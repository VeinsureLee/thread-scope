import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  logInfo,
  logWarn,
  logError,
  runWithTraceId,
  newTraceId,
  setLogFileForTest,
  currentTraceId,
  createLogger,
} from "../../src/logging/logger.js";

/** 测试专用日志文件（重定向，不污染真实日志） */
const TEST_LOG = path.resolve(process.cwd(), "data/logs/logger.test.log");

function readLines(): Array<Record<string, unknown>> {
  if (!fs.existsSync(TEST_LOG)) return [];
  return fs
    .readFileSync(TEST_LOG, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe("logging/logger（JSONL 日志）", () => {
  beforeEach(() => {
    setLogFileForTest(TEST_LOG);
    fs.mkdirSync(path.dirname(TEST_LOG), { recursive: true });
    fs.writeFileSync(TEST_LOG, "", "utf-8");
  });

  afterEach(() => {
    if (fs.existsSync(TEST_LOG)) fs.unlinkSync(TEST_LOG);
  });

  it("每条记录是单行 JSON：ts/level/type/traceId 齐备", () => {
    logInfo("tool_call", { tool: "forum-test", params: { a: 1 } });
    const lines = readLines();
    expect(lines).toHaveLength(1);
    const entry = lines[0]!;
    expect(typeof entry.ts).toBe("string");
    expect(new Date(entry.ts as string).getTime()).not.toBeNaN();
    expect(entry.level).toBe("info");
    expect(entry.type).toBe("tool_call");
    expect(typeof entry.traceId).toBe("string");
    expect(entry.tool).toBe("forum-test");
    expect((entry.params as { a: number }).a).toBe(1);
  });

  it("runWithTraceId 内所有日志共享同一 traceId（AsyncLocalStorage 贯穿）", async () => {
    const tid = newTraceId();
    await runWithTraceId(tid, async () => {
      logInfo("crawl", { message: "内部事件1" });
      await Promise.resolve();
      logWarn("crawl", { message: "内部事件2" });
    });
    // 上下文外再记一条 → 不同 traceId
    logInfo("system", { message: "外部事件" });

    const lines = readLines();
    const inner = lines.filter((l) => (l.message as string).startsWith("内部"));
    const outer = lines.find((l) => l.message === "外部事件")!;
    expect(inner).toHaveLength(2);
    expect(inner.every((l) => l.traceId === tid)).toBe(true);
    expect(outer.traceId).not.toBe(tid);
  });

  it("error 级日志带 level=error 与错误消息", () => {
    logError("tool_call", { tool: "forum-test", error: "节点不存在" });
    const entry = readLines()[0]!;
    expect(entry.level).toBe("error");
    expect(entry.error).toBe("节点不存在");
  });

  it("warn/info/error 各自按 level 记录", () => {
    logWarn("queue", { message: "写库失败" });
    logError("system", { message: "启动失败" });
    const levels = readLines().map((l) => l.level);
    expect(levels).toEqual(["warn", "error"]);
  });

  it("currentTraceId 在上下文内取 store 值，外部为 sys- 前缀", () => {
    const tid = newTraceId();
    runWithTraceId(tid, () => {
      expect(currentTraceId()).toBe(tid);
    });
    expect(currentTraceId()).toMatch(/^sys-/);
  });

  it("日志不抛异常（写失败不中断业务）", () => {
    // 目标是"目录存在但无法写入"：用 .gitignore 这类存在的只读文件目录
    // 实际验证：append 到不可写目标失败时被捕获，不抛给调用方
    const readOnlyPath = path.resolve(process.cwd(), "package.json");
    // 把日志目标指向一个已存在文件所在目录下的非法子路径——改用目录本身作为目标
    // （appendFileSync 对目录写会 EISDIR/EPERM，应被吞掉）
    setLogFileForTest(path.resolve(process.cwd(), "data"));
    expect(() => logInfo("system", { message: "should not throw" })).not.toThrow();
    void readOnlyPath;
  });

  it("默认 namespace 为 app", () => {
    logInfo("system", { message: "默认命名空间" });
    const entry = readLines()[0]!;
    expect(entry.namespace).toBe("app");
  });

  it("传入 namespace 时记录到该命名空间", () => {
    logInfo("crawl", { message: "爬取事件" }, "crawler.board");
    const entry = readLines()[0]!;
    expect(entry.namespace).toBe("crawler.board");
  });

  it("createLogger 返回分层 logger：自动带 namespace", () => {
    const boardLog = createLogger("crawler.board");
    boardLog.info("crawl", { message: "版块抓取" });
    const entry = readLines()[0]!;
    expect(entry.namespace).toBe("crawler.board");
    expect(entry.message).toBe("版块抓取");
  });

  it("stderr 输出人类可读摘要（to_stderr 开启时）", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      logInfo("tool_call", { tool: "forum-test", message: "测试调用", success: true, durationMs: 123 });
      const writes = spy.mock.calls.map((c) => String(c[0]));
      // 若配置 to_stderr=true，应输出多行可读摘要（含级别/命名空间/tool）
      const human = writes.join("");
      expect(human).toMatch(/INFO/);
      expect(human).toContain("forum-test");
      expect(human).toContain("123ms");
    } finally {
      spy.mockRestore();
    }
  });
});
