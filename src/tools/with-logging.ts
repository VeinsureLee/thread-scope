import type {
  McpServer,
  ToolCallback,
  StandardSchemaWithJSON,
  RegisteredTool,
  ServerContext,
} from "@modelcontextprotocol/server";
import { newTraceId, runWithTraceId, log } from "../logging/logger.js";
import type { StandardSchemaV1 } from "@modelcontextprotocol/server";

/**
 * 工具调用日志封装（docs 会话已定稿）。
 *
 * 每个工具用 registerLoggedTool 注册（等价于 registerTool），自动：
 * 1. 生成 traceId，并让该调用内部所有日志（crawl/queue）共享同一 traceId；
 * 2. 调用结束时记一条 tool_call 记录：tool / params / success / durationMs；
 *   失败时 level=error 并附 error 消息；
 * 3. 把 inputSchema 登记到 registry，供传输层探针复用做入参校验探测。
 *
 * 约定（日志格式讨论定稿）：
 * - 不记录返回内容（返回可能含论坛数据）；
 * - params 来自 zod 解析后的入参，不含凭证（账号密码只在 .env，从不进工具入参）。
 */

/** 工具名 → 入参 schema 注册表（供 validation-probe 复用，避免重复定义 schema） */
const toolSchemas = new Map<string, StandardSchemaV1>();

/** 按工具名取入参 schema（无则 undefined） */
export function getToolSchema(name: string): StandardSchemaV1 | undefined {
  return toolSchemas.get(name);
}

/**
 * 包装一个工具 handler：记录调用日志并共享 traceId。
 *
 * 注意：SDK 的 ToolCallback 是条件类型（依赖 Args 具体化才能解析），
 * 裸泛型下无法精确匹配，因此在边界用一次类型断言收敛。
 * 工具文件侧的类型推断不受影响——registerLoggedTool 签名与 registerTool 镜像，
 * handler 参数仍由 inputSchema 精确推断。
 */
function withToolLogging<Args extends StandardSchemaWithJSON>(
  toolName: string,
  handler: ToolCallback<Args>,
): ToolCallback<Args> {
  const wrapped = async (
    args: StandardSchemaWithJSON.InferOutput<Args>,
    ctx: ServerContext,
  ) => {
    const traceId = newTraceId();
    const start = Date.now();
    return runWithTraceId(traceId, async () => {
      try {
        const result = await handler(args, ctx);
        log("info", "tool_call", {
          tool: toolName,
          params: (args ?? {}) as Record<string, unknown>,
          success: true,
          durationMs: Date.now() - start,
        }, `mcp.${toolName}`);
        return result;
      } catch (err) {
        log("error", "tool_call", {
          tool: toolName,
          params: (args ?? {}) as Record<string, unknown>,
          success: false,
          durationMs: Date.now() - start,
          error: err instanceof Error ? err.message : String(err),
        }, `mcp.${toolName}`);
        throw err;
      }
    });
  };
  return wrapped as ToolCallback<Args>;
}

/**
 * 注册带日志的工具：等价于 server.registerTool，但 handler 被自动包裹。
 *
 * 用法：工具文件把 `server.registerTool(name, config, cb)` 换成
 * `registerLoggedTool(server, name, config, cb)` 即可（签名一致，类型推断一致）。
 */
export function registerLoggedTool<Args extends StandardSchemaWithJSON>(
  server: McpServer,
  name: string,
  config: {
    title?: string;
    description?: string;
    inputSchema?: Args;
  },
  handler: ToolCallback<Args>,
): RegisteredTool {
  // 登记入参 schema，供传输层探针做入参校验探测（避免重复定义）
  if (config.inputSchema) {
    toolSchemas.set(name, config.inputSchema as unknown as StandardSchemaV1);
  }
  return server.registerTool(name, config, withToolLogging(name, handler));
}
