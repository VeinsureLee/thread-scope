import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { requireLogin } from "../auth/auth.js";
import { searchThreads } from "../init/search.js";
import { ContentDb } from "../storage/content-db.js";
import { selectors, DEFAULT_CONCURRENCY, MAX_CONCURRENCY } from "../core/config.js";
import { registerLoggedTool } from "./with-logging.js";

/**
 * 注册搜索帖子工具（docs/03 §2.2 — forum-search-threads）。
 *
 * - 先在搜索范围（单版面/分区/默认流量前N/全站）内搜出候选文章，再抓取正文与评论。
 * - 范围规则同 forum-search-articles：传版块名=单版面；传分区ID=递归分区；
 *   不传=流量前5版；不传且传 maxBoards=全站（约3分钟）。
 * - 可选落库：将命中文章与正文写入 forum-content.db。
 */
export function registerSearchThreadsTool(server: McpServer): void {
  registerLoggedTool(
    server,
    "forum-search-threads",
    {
      title: "搜索 · 搜索帖子并抓取正文",
      description:
        "分类: 搜索。在指定版块/分区内按关键字搜索，并抓取命中帖子的正文与全部评论。范围：传版块英文名=单版面；传分区节点ID=递归该分区；不传=默认搜流量最大的前5个版块；不传且传maxBoards=全站搜索（约3分钟）。结果可选写入 forum-content.db（persist=true）。需要先执行 forum-login。",
      inputSchema: z.object({
        boardName: z
          .string()
          .optional()
          .describe("版块英文名（如 Demo）或分区节点 ID（如 sec-0）。不传则按默认范围搜索"),
        keyword: z.string().min(1).describe("搜索关键字"),
        author: z.string().optional().describe("作者 ID（可选，精确匹配）"),
        maxPages: z
          .number()
          .int()
          .positive()
          .max(100)
          .optional()
          .describe("搜索每个版块最多翻页数，默认 1"),
        maxItems: z
          .number()
          .int()
          .positive()
          .max(1000)
          .optional()
          .describe("搜索每个版块最多返回条数，可选"),
        maxBoards: z
          .number()
          .int()
          .positive()
          .max(500)
          .optional()
          .describe("全站搜索时最多搜索的版块数（不传 boardName 且传此参数 = 全站搜索，约 3 分钟）"),
        maxThreads: z
          .number()
          .int()
          .positive()
          .max(50)
          .optional()
          .describe("最多抓取正文的文章数（默认 20）"),
        maxThreadPages: z
          .number()
          .int()
          .positive()
          .max(100)
          .optional()
          .describe("每篇文章楼层的最大页数（默认 5）"),
        persist: z
          .boolean()
          .default(true)
          .describe("是否将命中的文章与正文写入 forum-content.db（默认 true，即默认入库）"),
        concurrency: z
          .number()
          .int()
          .positive()
          .max(MAX_CONCURRENCY)
          .default(DEFAULT_CONCURRENCY)
          .describe(`并发度（搜索版块与抓取正文，默认 ${DEFAULT_CONCURRENCY}，上限 ${MAX_CONCURRENCY}）`),
      }),
    },
    async ({
      boardName,
      keyword,
      author,
      maxPages,
      maxItems,
      maxBoards,
      maxThreads,
      maxThreadPages,
      persist,
      concurrency,
    }) => {
      requireLogin();

      const start = Date.now();
      const { scope, hits } = await searchThreads(boardName, keyword, {
        author,
        maxPages,
        maxItems,
        maxBoards,
        maxThreads,
        maxThreadPages,
        concurrency,
      });
      const elapsedMs = Date.now() - start;

      // 落库：文章 + 正文（与 fetch-thread-content 同语义；命中帖子写入 post 表）
      if (persist) {
        const db = new ContentDb();
        try {
          for (const hit of hits) {
            const boardIsAnon = hit.boardEname === selectors.anonymous.board;
            db.upsertBoard(hit.boardEname, hit.boardEname, boardIsAnon);

            // 作者：仅持久真实身份（匿名占位名不写 user 表）
            const authors: Array<{ uid: string; name: string; isAnon?: boolean }> = [];
            for (const p of [hit.firstPost, ...hit.replies]) {
              if (p.authorUid && !p.isAnon) {
                authors.push({ uid: p.authorUid, name: p.authorRaw, isAnon: false });
              }
            }

            db.saveThread(
              hit.boardEname,
              { url: hit.url, title: hit.title },
              authors,
              hit.firstPost,
              hit.replies,
            );
          }
        } finally {
          db.close();
        }
      }

      const lines = [
        `搜索范围: ${scope.label}`,
        `关键字: ${keyword}`,
        `抓取帖子数: ${hits.length}`,
        `用时: ${(elapsedMs / 1000).toFixed(1)}s`,
        "",
        ...hits.map((h) => {
          const replyCount = h.replies.length;
          const first = h.firstPost;
          return `[${h.boardEname}] ${h.articleId} ${h.title} (${first.authorRaw}) 正文:${first.content.slice(0, 80)} 评论:${replyCount}`;
        }),
      ];
      return {
        content: [
          { type: "text", text: lines.join("\n") },
          { type: "text", text: JSON.stringify(hits, null, 2) },
        ],
      };
    },
  );
}
