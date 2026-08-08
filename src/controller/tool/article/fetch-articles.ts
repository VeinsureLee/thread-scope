import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { fetchBoardArticles } from "../../../application/use-case/article/fetch-board-articles.js";
import { presentBoardArticles } from "../../presenter/article.js";
import { registerLoggedTool } from "../with-logging.js";

export function registerFetchArticlesTool(server: McpServer): void {
  registerLoggedTool(
    server,
    "forum-fetch-board-articles",
    {
      title: "文章 · 获取版块文章列表",
      description: "分类: 文章。抓取指定版块的文章列表，可限制翻页和返回数量，并写入 article 表。需要先执行 forum-login。",
      inputSchema: z.object({
        boardName: z.string().min(1).describe("版块英文名称。"),
        maxPages: z.number().int().positive().max(100).optional(),
        maxItems: z.number().int().positive().max(1000).optional(),
      }),
    },
    async ({ boardName, maxPages, maxItems }) => {
      const result = await fetchBoardArticles(boardName, { maxPages, maxItems });
      const presentation = presentBoardArticles(result);
      return {
        content: [
          { type: "text", text: presentation.text },
          { type: "text", text: JSON.stringify(presentation.data, null, 2) },
        ],
      };
    },
  );
}
