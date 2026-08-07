import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { flushTrafficWrites } from "./storage/traffic-queue.js";
import { logInfo, logError, logFilePath } from "./logging/logger.js";
import { attachValidationProbe } from "./logging/validation-probe.js";

// ── 工具注册 ──
import { registerLoginTool } from "./tools/auth/login.js";
import { registerFetchStructureTool } from "./tools/structure/fetch-structure.js";
import { registerFetchArticlesTool } from "./tools/article/fetch-articles.js";
import { registerFetchTrafficTool } from "./tools/traffic/fetch-traffic.js";
import { registerQueryTrafficHistoryTool } from "./tools/traffic/query-traffic-history.js";
import { registerInitTool } from "./tools/init/init-tool.js";
import { registerSearchArticlesTool } from "./tools/search/search-articles.js";
import { registerSearchThreadsTool } from "./tools/search/search-threads.js";

// ── 创建 MCP Server ──
const server = new McpServer({
  name: "forum-mcp",
  version: "0.1.0",
});

// ── 注册工具 ──
registerLoginTool(server);
registerFetchStructureTool(server);
registerFetchArticlesTool(server);
registerFetchTrafficTool(server);
registerQueryTrafficHistoryTool(server);
registerInitTool(server);
registerSearchArticlesTool(server);
registerSearchThreadsTool(server);

// ── 启动 ──
async function main(): Promise<void> {
  // 传输层入参校验探测：捕获 SDK 校验失败（缺参数等）→ 记日志
  attachValidationProbe();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logInfo("system", {
    message: "forum-mcp server started",
    logFile: logFilePath(),
  }, "system");
}

main().catch((error: unknown) => {
  logError("system", {
    message: "Failed to start forum-mcp",
    error: error instanceof Error ? error.message : String(error),
  }, "system");
  process.exit(1);
});

// 进程退出前同步 flush 待写的流量采样，避免丢库
process.on("exit", () => {
  flushTrafficWrites();
});
