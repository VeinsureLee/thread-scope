import { logError } from "../logging/logger.js";
import { getToolSchema } from "../tools/with-logging.js";

/**
 * 传输层入参校验探测（解决 MCP SDK 校验失败日志捕获不到的问题）。
 *
 * 背景：SDK 在调用工具 handler 前对 tools/call 入参做 zod 校验，校验失败
 * （如缺必需字段 keyword）直接返回 -32602，handler 不执行，普通日志捕获不到。
 *
 * 方案：在 process.stdin 上挂一个【只读探测】监听器（不干扰 SDK 自己的读取），
 * 对 JSON-RPC 消息做轻量解析，遇到 tools/call 时用【工具注册时登记的 schema】
 * 做校验，失败则记 error 日志。SDK 仍正常返回错误给客户端。
 *
 * 关键点：
 * - 零 schema 副本：复用 registerLoggedTool 登记的 inputSchema，与 SDK 校验一致；
 * - 缓冲累积：stdio 消息可能跨 chunk，先按 chunk 累积、再按换行切分完整消息；
 * - 只读：不修改流、不消费数据、不拦截；
 * - 只做同步校验：zod 无 async 转换时 validate 返回同步结果；async 校验交给 SDK。
 */

interface JsonRpcMessage {
  method?: string;
  params?: { name?: string; arguments?: unknown };
}

/** 累积未处理完的 stdin 字节（跨 chunk 的 JSON-RPC 消息） */
let pending = "";

/** StandardSchemaV1 的同步校验结果形态 */
interface SyncValidateResult {
  value?: unknown;
  issues?: Array<{ message: string }>;
}

/** 校验 tools/call 入参，返回错误描述（校验通过 / 无法判定返回 null） */
export function validateCallArgs(msg: JsonRpcMessage): string | null {
  const name = msg.params?.name;
  const args = msg.params?.arguments;
  const schema = name ? getToolSchema(name) : undefined;

  if (!name || !schema) return null; // 未知工具 / 无 schema，跳过

  const std = schema["~standard"] as
    | { validate: (v: unknown) => SyncValidateResult | Promise<SyncValidateResult> }
    | undefined;
  if (!std) return null;

  const result = std.validate(args);
  // zod 无 async 转换时 validate 同步返回；thenable 交给 SDK（探针不异步等待）
  if (result && typeof (result as Promise<unknown>).then === "function") {
    return null;
  }
  const issues = (result as SyncValidateResult).issues;
  if (issues && issues.length > 0) {
    return `入参校验失败: ${issues[0]!.message}`;
  }
  return null;
}

/** 挂只读探测监听器（幂等） */
export function attachValidationProbe(): void {
  if (!process.stdin) return;
  if ((process.stdin as NodeJS.ReadStream & { _mcpProbe?: boolean })._mcpProbe) {
    return;
  }
  (process.stdin as NodeJS.ReadStream & { _mcpProbe?: boolean })._mcpProbe = true;

  process.stdin.on("data", (chunk: Buffer) => {
    pending += chunk.toString("utf-8");
    const lines = pending.split("\n");
    // 最后一段可能不完整，留到下一个 chunk
    pending = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let msg: JsonRpcMessage;
      try {
        msg = JSON.parse(trimmed) as JsonRpcMessage;
      } catch {
        continue;
      }
      if (msg.method !== "tools/call") continue;

      const problem = validateCallArgs(msg);
      if (problem) {
        logError("tool_call", {
          message: problem,
          tool: msg.params?.name,
        }, "mcp.validate");
      }
    }
  });
}
