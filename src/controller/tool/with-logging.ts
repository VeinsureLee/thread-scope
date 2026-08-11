import type {
  McpServer,
  ToolCallback,
  RegisteredTool,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  AnySchema,
  SchemaOutput,
} from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { newTraceId, runWithTraceId, log } from "../../logging/logger.js";

/**
 * 工具注册的通用封装（SDK ≥1.24 新 API 适配）：
 * - 泛型 Args 为 zod4 schema 类型（AnySchema = zod3 | zod4 联合，本项目用 zod4）
 * - handler 参数类型由 SchemaOutput<Args> 推导（zod 输出类型）
 * - ctx（请求上下文）仅透传，工具 handler 不使用，故以宽松类型承载
 * - 每次调用生成 traceId + 耗时/成败日志
 */
const toolSchemas = new Map<string, AnySchema>();

export function getToolSchema(name: string): AnySchema | undefined {
  return toolSchemas.get(name);
}

function withToolLogging<Args extends AnySchema>(
  toolName: string,
  handler: ToolCallback<Args>,
): ToolCallback<Args> {
  const wrapped = async (
    args: SchemaOutput<Args>,
    ctx: unknown,
  ) => {
    const traceId = newTraceId();
    const start = Date.now();
    return runWithTraceId(traceId, async () => {
      try {
        const result = await handler(args, ctx as Parameters<ToolCallback<Args>>[1]);
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
  return wrapped as unknown as ToolCallback<Args>;
}

export function registerLoggedTool<Args extends AnySchema>(
  server: McpServer,
  name: string,
  config: {
    title?: string;
    description?: string;
    inputSchema?: Args;
  },
  handler: ToolCallback<Args>,
): RegisteredTool {
  if (config.inputSchema) {
    toolSchemas.set(name, config.inputSchema);
  }
  return server.registerTool(name, config, withToolLogging(name, handler));
}
