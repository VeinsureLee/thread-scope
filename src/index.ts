import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { flushTrafficWrites } from "./storage/traffic-queue.js";

// ── 工具注册 ──
import { registerLoginTool } from "./tools/login-tool.js";
import { registerFetchStructureTool } from "./tools/fetch-structure.js";
import { registerFetchArticlesTool } from "./tools/fetch-articles.js";
import { registerFetchTrafficTool } from "./tools/fetch-traffic.js";
import { registerQueryTrafficHistoryTool } from "./tools/query-traffic-history.js";
import { registerInitTool } from "./tools/init-tool.js";

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

// ── 启动 ──
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("forum-mcp server started");
}

main().catch((error: unknown) => {
  console.error("Failed to start forum-mcp:", error);
  process.exit(1);
});

// 进程退出前同步 flush 待写的流量采样，避免丢库
process.on("exit", () => {
  flushTrafficWrites();
});
