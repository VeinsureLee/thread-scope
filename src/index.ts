import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

// ── 工具注册 ──
import { registerLoginTool } from "./tools/login-tool.js";
import { registerFetchStructureTool } from "./tools/fetch-structure.js";
import { registerFetchArticlesTool } from "./tools/fetch-articles.js";
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
