import * as fs from "fs";
import * as path from "path";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { logConfig } from "../core/config.js";
import { fromRoot } from "../core/paths.js";

/**
 * 统一 JSONL 日志。
 *
 * 设计（docs 会话已定稿）：
 * - 写文件：JSONL，每行一条 JSON 记录（追加，不轮转），机器可读、可 grep/jq；
 * - 同时可选 stderr 人类可读多行输出（to_stderr: true），适合实时看；
 * - 命名空间分层（namespace / logger 名）：如 crawler.board、mcp.search，
 *   支持前缀 glob 过滤（include_ns: ["crawler.*"]）；
 * - 级别过滤：debug < info < warn < error；
 * - traceId：AsyncLocalStorage 让一次工具调用内所有日志共享同一 traceId；
 * - MCP 走 stdio，stdout 是协议通道 → 日志绝不写 stdout。
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** 日志事件类型 */
export type LogType =
  | "tool_call" // 工具调用记录（核心需求）
  | "crawl" // 爬取层事件（版面搜索失败等）
  | "queue" // 后台队列事件（写库失败）
  | "system"; // 进程级事件（server 启动/失败）

/** 解析配置级别，非法值回退 info */
function resolveThreshold(level: string | undefined): number {
  if (!level) return LEVEL_ORDER.info;
  const key = (Object.keys(LEVEL_ORDER) as LogLevel[]).find(
    (k) => k === level,
  );
  return key ? LEVEL_ORDER[key]! : LEVEL_ORDER.info;
}

const THRESHOLD = resolveThreshold(logConfig?.level);

/** stderr 实时输出开关（配置读取） */
const TO_STDERR = logConfig?.to_stderr ?? false;

/** 命名空间过滤规则（配置读取）；空 = 不过滤（记录全部） */
const INCLUDE_NS: string[] = logConfig?.include_ns ?? [];

/** 日志文件绝对路径（锚定项目根，不依赖 cwd） */
let LOG_FILE = fromRoot(logConfig?.file ?? "data/logs/forum-mcp.log");

// 确保日志目录存在
fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });

/**
 * 测试用：重定向日志文件路径（仅测试调用，生产不用）。
 * 切换后目录自动创建。
 */
export function setLogFileForTest(filePath: string): void {
  LOG_FILE = filePath;
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
}

/** 当前调用链的 traceId 存储 */
const traceStore = new AsyncLocalStorage<string>();

/** 读取当前上下文 traceId（无调用上下文时生成一个） */
export function currentTraceId(): string {
  const existing = traceStore.getStore();
  if (existing) return existing;
  // 无工具调用上下文（如进程启动期）：生成一次性 traceId
  return `sys-${randomUUID()}`;
}

/**
 * 在指定 traceId 上下文中执行 fn。
 * 工具调用封装用它把一次调用的整个过程绑定到同一 traceId。
 */
export function runWithTraceId<T>(traceId: string, fn: () => T): T {
  return traceStore.run(traceId, fn);
}

/** 生成新的 traceId（一次工具调用的唯一 ID） */
export function newTraceId(): string {
  return randomUUID();
}

export interface LogEntry {
  ts: string;
  level: LogLevel;
  type: LogType;
  /** 分层命名空间（如 crawler.board、mcp.search）；默认 "app" */
  namespace: string;
  traceId: string;
  [key: string]: unknown;
}

/** 判断 namespace 是否被 include_ns 过滤放行（支持 crawler.* 前缀 glob） */
function nsAllowed(ns: string): boolean {
  if (INCLUDE_NS.length === 0) return true;
  return INCLUDE_NS.some((rule) => {
    if (rule === "*") return true;
    if (rule.endsWith(".*")) {
      return ns === rule.slice(0, -2) || ns.startsWith(rule.slice(0, -1));
    }
    return ns === rule;
  });
}

/** 人类可读多行摘要（stderr 用） */
function formatHuman(entry: LogEntry): string {
  const time = new Date(entry.ts).toLocaleTimeString("zh-CN", { hour12: false });
  const level = entry.level.toUpperCase().padEnd(5);
  let line = `[${time}] ${level} [${entry.namespace}] trace=${entry.traceId.slice(0, 8)}`;
  if (entry.tool) line += ` tool=${entry.tool}`;
  if (entry.message) line += ` ${entry.message}`;
  if (entry.error) line += ` error=${entry.error}`;
  if (entry.success !== undefined) line += ` success=${entry.success}`;
  if (entry.durationMs !== undefined) line += ` ${entry.durationMs}ms`;
  return line;
}

/** 写一条日志：文件 JSONL + 可选 stderr 人类可读 */
function write(entry: LogEntry): void {
  if (LEVEL_ORDER[entry.level] < THRESHOLD) return;
  if (!nsAllowed(entry.namespace)) return;

  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    // 日志文件写入失败静默（不因日志拖垮业务）
  }

  if (TO_STDERR) {
    try {
      process.stderr.write(formatHuman(entry) + "\n");
    } catch {
      // stderr 写入失败静默
    }
  }
}

/**
 * 结构化日志入口。
 * @param level     级别
 * @param type      事件类型
 * @param fields    业务字段（tool/params/error/…），自动附带 ts/level/type/traceId
 * @param namespace 分层命名空间（默认 "app"）
 */
export function log(
  level: LogLevel,
  type: LogType,
  fields: Record<string, unknown> = {},
  namespace = "app",
): void {
  write({
    ts: new Date().toISOString(),
    level,
    type,
    namespace,
    traceId: currentTraceId(),
    ...fields,
  });
}

/** 便捷：创建带命名空间的 logger（分层用），如 crawlLogger("board") → crawler.board */
export function createLogger(ns: string): {
  info: (type: LogType, fields?: Record<string, unknown>) => void;
  warn: (type: LogType, fields?: Record<string, unknown>) => void;
  error: (type: LogType, fields?: Record<string, unknown>) => void;
} {
  return {
    info: (type, fields = {}) => log("info", type, fields, ns),
    warn: (type, fields = {}) => log("warn", type, fields, ns),
    error: (type, fields = {}) => log("error", type, fields, ns),
  };
}

/** info 级日志（工具调用记录等） */
export function logInfo(
  type: LogType,
  fields: Record<string, unknown> = {},
  namespace = "app",
): void {
  log("info", type, fields, namespace);
}

/** warn 级日志（部分失败、降级） */
export function logWarn(
  type: LogType,
  fields: Record<string, unknown> = {},
  namespace = "app",
): void {
  log("warn", type, fields, namespace);
}

/** error 级日志（失败、异常） */
export function logError(
  type: LogType,
  fields: Record<string, unknown> = {},
  namespace = "app",
): void {
  log("error", type, fields, namespace);
}

/** 当前日志文件路径（调试/查看用） */
export function logFilePath(): string {
  return LOG_FILE;
}
