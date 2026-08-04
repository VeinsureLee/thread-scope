import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { requireLogin } from "../auth/auth.js";
import { fetchBoardArticles } from "../crawl/forum.js";

/** 注册获取版块文章列表工具 */
export function registerFetchArticlesTool(server: McpServer): void {
  server.registerTool(
    "forum-fetch-articles",
    {
      title: "获取文章列表",
      description: "爬取指定版块首页的文章列表。需要先执行 forum-login。",
      inputSchema: z.object({
        boardName: z
          .string()
          .min(1)
          .describe("版块英文名"),
      }),
    },
    async ({ boardName }) => {
      requireLogin();
      const articles = await fetchBoardArticles(boardName);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(articles, null, 2),
          },
        ],
      };
    },
  );
}
