import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { requireLogin } from "../../auth/auth.js";
import { resolveScope, searchBoards } from "../../crawl/search/index.js";
import { fetchForumTree } from "../../crawl/structure/index.js";
import { ContentDb } from "../../storage/content-db.js";
import { selectors, DEFAULT_CONCURRENCY, MAX_CONCURRENCY } from "../../core/config.js";
import { registerLoggedTool } from "../with-logging.js";

/** 搜索数据来源（本地缓存 / 联网 / 自动） */
const SOURCE_ENUM = ["auto", "local", "remote"] as const;
/** 搜索范围（全站 / 流量前N / 单版面 / 分区递归） */
const SCOPE_ENUM = ["all", "top", "board", "section"] as const;

/**
 * 注册搜索文章工具（docs/03 §2.2 — forum-search-articles）。
 *
 * 架构优化（2026-08-07）：
 * - 【本地 / 联网】source：
 *   - local   → 只查本地 forum-content.db（秒回，无需登录）
 *   - remote  → 只联网搜索（原行为）
 *   - auto    → 先查本地，无命中再联网（默认）
 * - 【范围】scope：
 *   - all     → 全站全部版面（约 3 分钟，不再需要 maxBoards 凑够版面数）
 *   - top     → 流量最高的前 5 个版面（默认，快）
 *   - board   → 单版面（配合 boardName 版块英文名）
 *   - section → 递归该分区下所有版面（配合 boardName 分区节点 ID）
 * - 命中候选可选落库 forum-content.db（article 表，url_hash 去重）。
 */
export function registerSearchArticlesTool(server: McpServer): void {
  registerLoggedTool(
    server,
    "forum-search-articles",
    {
      title: "搜索 · 搜索文章",
      description:
        "分类: 搜索。按关键字搜索文章（返回候选列表：标题/URL/作者/日期/回复数），不抓正文。source=local 只查本地缓存（秒回，无需登录）；source=remote 联网搜索；source=auto 先本地后联网（默认）。scope=all 全站搜索（约3分钟）；scope=top 流量前5版（默认）；scope=board 单版面（配 boardName）；scope=section 分区递归（配 boardName）。结果可选写入 forum-content.db（persist=true）。联网需先 forum-login。",
      inputSchema: z.object({
        keyword: z.string().min(1).describe("搜索关键字"),
        source: z
          .enum(SOURCE_ENUM)
          .default("auto")
          .describe("数据来源：local=只查本地缓存（秒回，无需登录）；remote=只联网搜索；auto=先本地后联网（默认）"),
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
          .describe("每个版块最多翻页数，默认 1（仅联网搜索有效）"),
        maxItems: z
          .number()
          .int()
          .positive()
          .max(1000)
          .optional()
          .describe("每个版块最多返回条数，可选（仅联网搜索有效）"),
        maxBoards: z
          .number()
          .int()
          .positive()
          .max(500)
          .optional()
          .describe("scope=all 时最多搜索的版块数（可选；不传则搜全部版面）"),
        persist: z
          .boolean()
          .default(true)
          .describe("是否将命中文章写入 forum-content.db（默认 true，url_hash 去重；local 搜索本就来自缓存，此参数无效）"),
        concurrency: z
          .number()
          .int()
          .positive()
          .max(MAX_CONCURRENCY)
          .default(DEFAULT_CONCURRENCY)
          .describe(`联网搜索并发度（默认 ${DEFAULT_CONCURRENCY}，上限 ${MAX_CONCURRENCY}）`),
      }),
    },
    async ({ keyword, source, scope, boardName, author, maxPages, maxItems, maxBoards, persist, concurrency }) => {
      // ── local：只查本地缓存（无需登录） ──
      const localHit = source === "local" || source === "auto";
      if (localHit) {
        const startLocal = Date.now();
        const db = new ContentDb();
        try {
          const rows = db.searchArticles(keyword, {
            boardEname: scope === "board" ? boardName : undefined,
            limit: maxItems,
          });
          const elapsedMs = Date.now() - startLocal;
          // auto：本地有命中就直接返回；local：无论如何返回本地结果
          if (rows.length > 0 || source === "local") {
            return {
              content: [
                { type: "text", text: `来源: 本地缓存\n关键字: ${keyword}\n命中数: ${rows.length}\n用时: ${elapsedMs}ms` },
                { type: "text", text: JSON.stringify(rows, null, 2) },
              ],
            };
          }
        } finally {
          db.close();
        }
      }

      // ── remote / auto 兜底：联网搜索（需登录） ──
      requireLogin();

      const start = Date.now();
      const tree = await fetchForumTree();
      const scopeResolved = resolveScope(scope, boardName, tree, 5, maxBoards);
      const hits = await searchBoards(
        scopeResolved.boards,
        keyword,
        { author, maxPages, maxItems },
        concurrency,
      );
      const elapsedMs = Date.now() - start;

      // 命中候选可选落库（article 表，先保证 board 存在满足外键；url_hash 去重不重复入库）
      if (persist && hits.length > 0) {
        const db = new ContentDb();
        try {
          const rows = hits.map((h) => h.row);
          for (const ename of new Set(rows.map((r) => r.boardEname))) {
            db.upsertBoard(ename, ename, ename === selectors.anonymous.board);
          }
          db.upsertArticles(rows);
        } finally {
          db.close();
        }
      }

      const lines = [
        `来源: 联网`,
        `搜索范围: ${scopeResolved.label}`,
        `关键字: ${keyword}`,
        `命中数: ${hits.length}`,
        `用时: ${(elapsedMs / 1000).toFixed(1)}s`,
        "",
        ...hits.map(
          (h) =>
            `[${h.boardEname}] ${h.row.date} ${h.row.title} (${h.row.authorRaw}) 回复:${h.row.replyCount}`,
        ),
      ];
      return {
        content: [
          { type: "text", text: lines.join("\n") },
          { type: "text", text: JSON.stringify(hits.map((h) => h.row), null, 2) },
        ],
      };
    },
  );
}
