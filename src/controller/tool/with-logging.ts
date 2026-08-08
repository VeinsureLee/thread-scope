import type {
  McpServer,
  ToolCallback,
  StandardSchemaWithJSON,
  RegisteredTool,
  ServerContext,
} from "@modelcontextprotocol/server";
import { newTraceId, runWithTraceId, log } from "../../logging/logger.js";
import type { StandardSchemaV1 } from "@modelcontextprotocol/server";

const toolSchemas = new Map<string, StandardSchemaV1>();

export function getToolSchema(name: string): StandardSchemaV1 | undefined {
  return toolSchemas.get(name);
}

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
  if (config.inputSchema) {
    toolSchemas.set(name, config.inputSchema as unknown as StandardSchemaV1);
  }
  return server.registerTool(name, config, withToolLogging(name, handler));
}
