import type { McpServer } from "@modelcontextprotocol/server";
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
      description: "分类: 帖子。按版块名称和文章 ID 抓取一个 Thread 的首帖及评论树，可选择写入 forum-content.db。需要先执行 forum-login。",
      inputSchema: z.object({
        boardName: z.string().trim().min(1).describe("版块英文名称。"),
        articleId: z.string().trim().min(1).describe("文章 ID。"),
        maxPages: z.number().int().positive().max(100).optional(),
        persist: z.boolean().default(true),
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
