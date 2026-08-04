import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

// ========== 工具注册（按功能域导入） ==========
import { registerLoginTool } from "./tools/login-tool.js";
import { registerFetchSectionsTool } from "./tools/fetch-sections.js";
import { registerFetchBoardsTool } from "./tools/fetch-boards.js";
import { registerFetchArticlesTool } from "./tools/fetch-articles.js";

// ========== 创建 MCP Server ==========
const server = new McpServer({
  name: "forum-mcp",
  version: "0.1.0",
});

// ========== 基础工具 ==========
server.registerTool(
  "hello",
  {
    title: "Hello",
    description: "根据传入的名字生成问候语",
    inputSchema: z.object({
      name: z.string().min(1).describe("需要问候的人的名字"),
    }),
  },
  async ({ name }) => ({
    content: [{ type: "text", text: `Hello, ${name}!` }],
  }),
);

// ========== 论坛工具 ==========
registerLoginTool(server);
registerFetchSectionsTool(server);
registerFetchBoardsTool(server);
registerFetchArticlesTool(server);

// ========== 启动 ==========
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("forum-mcp server started");
}

main().catch((error: unknown) => {
  console.error("Failed to start forum-mcp:", error);
  process.exit(1);
});
