import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchThread } from "../../../application/use-case/thread/fetch-thread.js";
import { presentThread } from "../../presenter/thread.js";
import { registerLoggedTool } from "../with-logging.js";

export function registerFetchThreadTool(server: McpServer): void {
  registerLoggedTool(
    server,
    "forum-fetch-thread",
    {
      title: "帖子 · 抓取完整帖子",
      description: "分类: 帖子。抓取单个帖子首帖+评论树，可选落库 forum-content.db。用途: 对已定位的帖子（来自 forum-search-articles / forum-search-threads / forum-fetch-board-articles 的 articleId + boardName）抓完整正文与楼层。前置: forum-login。返回: 首帖与楼层树。",
      inputSchema: z.object({
        boardName: z.string().trim().min(1).describe("版块英文名称（如 Demo）"),
        articleId: z.string().trim().min(1).describe("文章 ID（如 1001）"),
        maxPages: z.number().int().positive().max(100).optional().describe("楼层最多翻页数（默认 1，越界可传更大值抓全楼层）"),
        persist: z.boolean().default(true).describe("是否将正文写入 forum-content.db（默认 true）"),
      }),
    },
    async ({ boardName, articleId, maxPages, persist }) => {
      const result = await fetchThread(boardName, articleId, { maxPages, persist });
      const presentation = presentThread(result);
      return {
        content: [
          { type: "text", text: presentation.text },
          { type: "text", text: JSON.stringify(presentation.data, null, 2) },
        ],
      };
    },
  );
}
