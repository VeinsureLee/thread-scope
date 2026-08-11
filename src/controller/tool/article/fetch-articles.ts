import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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
      description: "分类: 文章。获取指定版块的文章列表（标题/作者/日期/回复数），可翻页，可落库 article 表。用途: 关键字搜索效果不佳时，直接浏览某版面历史帖。前置: forum-login。关联: 配合 forum-fetch-traffic 挑热门版面、forum-fetch-structure 找相关分区；返回的 articleId 可传给 forum-fetch-thread 抓正文。返回: 文章行列表（含 url/作者/回复数）。",
      inputSchema: z.object({
        boardName: z.string().min(1).describe("版块英文名称（如 Demo）"),
        maxPages: z.number().int().positive().max(100).optional().describe("每版最多翻页数（默认 1）"),
        maxItems: z.number().int().positive().max(1000).optional().describe("最多返回文章条数（可选）"),
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
