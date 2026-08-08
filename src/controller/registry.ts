import type { McpServer } from "@modelcontextprotocol/server";
import { registerLoginTool } from "./tool/auth/login.js";
import { registerFetchStructureTool } from "./tool/structure/fetch-structure.js";
import { registerFetchArticlesTool } from "./tool/article/fetch-articles.js";
import { registerFetchTrafficTool } from "./tool/traffic/fetch-traffic.js";
import { registerQueryTrafficHistoryTool } from "./tool/traffic/query-traffic-history.js";
import { registerInitTool } from "./tool/init/init-tool.js";
import { registerInitStructureTool } from "./tool/init/init-structure-tool.js";
import { registerInitManagersTool } from "./tool/init/init-managers-tool.js";
import { registerInitBoardArticlesTool } from "./tool/init/init-board-articles-tool.js";
import { registerSearchArticlesTool } from "./tool/search/search-articles.js";
import { registerSearchThreadsTool } from "./tool/search/search-threads.js";
import { registerSearchUserPostsTool } from "./tool/search/search-user-posts.js";
import { registerFetchThreadTool } from "./tool/thread/fetch-thread.js";
import { registerFetchUserProfilesTool } from "./tool/user/fetch-user-profiles.js";
import { registerFetchUserTitlesTool } from "./tool/user/fetch-user-titles.js";
import { registerGetUserTool } from "./tool/user/get-user.js";

/** MCP Controller 的唯一工具注册表；工具文件只负责单个协议适配器。 */
export function registerAllTools(server: McpServer): void {
  registerLoginTool(server);
  registerFetchStructureTool(server);
  registerFetchArticlesTool(server);
  registerFetchTrafficTool(server);
  registerQueryTrafficHistoryTool(server);
  registerInitTool(server);
  registerInitStructureTool(server);
  registerInitManagersTool(server);
  registerInitBoardArticlesTool(server);
  registerSearchArticlesTool(server);
  registerSearchThreadsTool(server);
  registerSearchUserPostsTool(server);
  registerFetchThreadTool(server);
  registerFetchUserProfilesTool(server);
  registerFetchUserTitlesTool(server);
  registerGetUserTool(server);
}
