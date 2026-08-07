import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { requireLogin } from "../../auth/auth.js";
import { searchThreads } from "../../init/search.js";
import { ContentDb } from "../../storage/content-db.js";
import { selectors, DEFAULT_CONCURRENCY, MAX_CONCURRENCY } from "../../core/config.js";
import { registerLoggedTool } from "../with-logging.js";

/** 搜索数据来源（本地缓存 / 联网 / 自动） */
const SOURCE_ENUM = ["auto", "local", "remote"] as const;
/** 搜索范围（全站 / 流量前N / 单版面 / 分区递归） */
const SCOPE_ENUM = ["all", "top", "board", "section"] as const;

/**
 * 注册搜索帖子工具（docs/03 §2.2 — forum-search-threads）。
 *
 * 架构优化（2026-08-07）：
 * - 【本地 / 联网】source：
 *   - local   → 只读本地 forum-content.db 的正文缓存（秒回，无需登录）
 *   - remote  → 联网搜索 + 抓正文（原行为）
 *   - auto    → 先本地，无命中再联网（默认）
 * - 【范围】scope：
 *   - all     → 全站全部版面（约 3 分钟，不再需要 maxBoards 凑数）
 *   - top     → 流量最高的前 5 个版面（默认，快）
 *   - board   → 单版面（配合 boardName 版块英文名）
 *   - section → 递归该分区下所有版面（配合 boardName 分区节点 ID）
 * - 联网命中可选落库 forum-content.db（persist=true）。
 */
export function registerSearchThreadsTool(server: McpServer): void {
  registerLoggedTool(
    server,
    "forum-search-threads",
    {
      title: "搜索 · 搜索帖子并抓取正文",
      description:
        "分类: 搜索。按关键字搜索帖子并抓取正文与全部评论。source=local 只读本地缓存正文（秒回，无需登录）；source=remote 联网搜索并抓正文；source=auto 先本地后联网（默认）。scope=all 全站（约3分钟）；scope=top 流量前5版（默认）；scope=board 单版面（配 boardName）；scope=section 分区递归（配 boardName）。联网命中可选写入 forum-content.db（persist=true）。联网需先 forum-login。",
      inputSchema: z.object({
        keyword: z.string().min(1).describe("搜索关键字"),
        source: z
          .enum(SOURCE_ENUM)
          .default("auto")
          .describe("数据来源：local=只读本地缓存正文（秒回，无需登录）；remote=联网搜索并抓正文；auto=先本地后联网（默认）"),
        scope: z
          .enum(SCOPE_ENUM)
          .optional()
          .describe("搜索范围：all=全站（约3分钟）；top=流量前5版（默认）；board=单版面；section=分区递归。不传时按 boardName/maxBoards 自动推断"),
        boardName: z
          .string()
          .optional()
          .describe("scope=board/section 时使用：版块英文名（如 Demo）或分区节点 ID（如 sec-0）"),
        author: z.string().optional().describe("作者 ID（可选，精确匹配，仅联网搜索有效）"),
        maxPages: z
          .number()
          .int()
          .positive()
          .max(100)
          .optional()
          .describe("搜索每个版块最多翻页数，默认 1（仅联网搜索有效）"),
        maxItems: z
          .number()
          .int()
          .positive()
          .max(1000)
          .optional()
          .describe("搜索每个版块最多返回条数，可选（仅联网搜索有效）"),
        maxBoards: z
          .number()
          .int()
          .positive()
          .max(500)
          .optional()
          .describe("scope=all 时最多搜索的版块数（可选；不传则搜全部版面）"),
        maxThreads: z
          .number()
          .int()
          .positive()
          .max(50)
          .optional()
          .describe("最多抓取正文的文章数（默认 20，仅联网搜索有效）"),
        maxThreadPages: z
          .number()
          .int()
          .positive()
          .max(100)
          .optional()
          .describe("每篇文章楼层的最大页数（默认 5，仅联网搜索有效）"),
        persist: z
          .boolean()
          .default(true)
          .describe("是否将命中的文章与正文写入 forum-content.db（默认 true；local 搜索本就来自缓存，此参数无效）"),
        concurrency: z
          .number()
          .int()
          .positive()
          .max(MAX_CONCURRENCY)
          .default(DEFAULT_CONCURRENCY)
          .describe(`联网搜索与抓正文的并发度（默认 ${DEFAULT_CONCURRENCY}，上限 ${MAX_CONCURRENCY}）`),
      }),
    },
    async ({
      boardName,
      keyword,
      source,
      scope,
      author,
      maxPages,
      maxItems,
      maxBoards,
      maxThreads,
      maxThreadPages,
      persist,
      concurrency,
    }) => {
      // ── local：只读本地缓存正文（无需登录） ──
      const localHit = source === "local" || source === "auto";
      if (localHit) {
        const startLocal = Date.now();
        const db = new ContentDb();
        try {
          const rows = db.searchThreadsContent(keyword, {
            boardEname: scope === "board" ? boardName : undefined,
            limit: maxThreads ?? 20,
          });
          const elapsedMs = Date.now() - startLocal;
          // auto：本地有命中就直接返回；local：无论如何返回本地结果
          if (rows.length > 0 || source === "local") {
            const lines = [
              `来源: 本地缓存`,
              `关键字: ${keyword}`,
              `命中楼层数: ${rows.length}`,
              `用时: ${elapsedMs}ms`,
              "",
              ...rows.map(
                (r) =>
                  `[${r.boardEname}] ${r.articleTitle} #${r.floor} (${r.authorRaw}): ${r.content.slice(0, 80)}`,
              ),
            ];
            return {
              content: [
                { type: "text", text: lines.join("\n") },
                { type: "text", text: JSON.stringify(rows, null, 2) },
              ],
            };
          }
        } finally {
          db.close();
        }
      }

      // ── remote / auto 兜底：联网搜索 + 抓正文（需登录） ──
      requireLogin();

      const start = Date.now();
      const { scope: scopeResolved, hits } = await searchThreads(boardName, keyword, {
        scope,
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
        `来源: 联网`,
        `搜索范围: ${scopeResolved.label}`,
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
