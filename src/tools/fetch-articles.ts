import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { requireLogin } from "../auth/auth.js";
import { fetchBoardArticles } from "../crawl/article/index.js";
import { ContentDb } from "../storage/content-db.js";
import { selectors } from "../core/config.js";
import { registerLoggedTool } from "./with-logging.js";

/**
 * 注册获取版块文章列表工具。
 *
 * 合并自旧 forum-fetch-articles（docs/03 §2.3 #2）：
 * - 爬取指定版块文章列表（含翻页功能）
 * - 落库到 forum-content.db 的 article 表（需先保证 board 存在，满足外键）
 */
export function registerFetchArticlesTool(server: McpServer): void {
  registerLoggedTool(
    server,
    "forum-fetch-board-articles",
    {
      title: "文章 · 获取版块文章列表",
      description:
        "分类: 文章。爬取指定版块的文章列表（含标题、作者、日期、回复数、置顶标记）。可指定翻页数量上限。结果写入 forum-content.db 的 article 表。需要先执行 forum-login。",
      inputSchema: z.object({
        boardName: z.string().min(1).describe("版块英文名，如 Demo"),
        maxPages: z
          .number()
          .int()
          .positive()
          .max(100)
          .optional()
          .describe("最多翻页数，默认 1（只爬首页）"),
        maxItems: z
          .number()
          .int()
          .positive()
          .max(1000)
          .optional()
          .describe("最多返回条数，可选"),
      }),
    },
    async ({ boardName, maxPages, maxItems }) => {
      requireLogin();
      const rows = await fetchBoardArticles(boardName, { maxPages, maxItems });

      // 落库（article 表；先保证 board 存在以满足外键）
      const isAnonBoard = boardName === selectors.anonymous.board;
      const db = new ContentDb();
      try {
        db.upsertBoard(boardName, boardName, isAnonBoard);
        db.upsertArticles(rows);
      } finally {
        db.close();
      }

      const lines = [
        `版块: ${boardName}`,
        `抓取文章数: ${rows.length}`,
        `置顶: ${rows.filter((r) => r.isPinned).length}`,
        "",
        ...rows.map(
          (r) =>
            `${r.isPinned ? "[顶] " : ""}${r.date} ${r.title} (${r.authorRaw}) 回复:${r.replyCount}`,
        ),
      ];
      return {
        content: [
          { type: "text", text: lines.join("\n") },
          { type: "text", text: JSON.stringify(rows, null, 2) },
        ],
      };
    },
  );
}
