import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { requireLogin } from "../auth/auth.js";
import { resolveScope, searchBoards } from "../crawl/search/index.js";
import { fetchForumTree } from "../crawl/structure/index.js";
import { ContentDb } from "../storage/content-db.js";
import { selectors, DEFAULT_CONCURRENCY, MAX_CONCURRENCY } from "../core/config.js";
import { registerLoggedTool } from "./with-logging.js";

/**
 * 注册版面内搜索工具（docs/03 §2.2 — forum-search-articles）。
 *
 * - 定位 A：只返回候选文章（标题/url/作者/日期/回复数），不抓正文。
 * - 范围（2026-08-07 决策）：
 *   - boardName=版面 ename → 单版面搜索
 *   - boardName=分区节点 ID → 递归该分区下所有版块
 *   - 不传 boardName + maxBoards → 全站搜索（约 3 分钟，工具会注明用时）
 *   - 不传 boardName → 默认搜流量最高的前 5 个版面
 * - 命中候选可选落库 forum-content.db（article 表，url_hash 去重，重复搜索不重复入库；
 *   persist=false 可只查不写）。
 */
export function registerSearchArticlesTool(server: McpServer): void {
  registerLoggedTool(
    server,
    "forum-search-articles",
    {
      title: "搜索 · 搜索文章",
      description:
        "分类: 搜索。在指定版块/分区内按关键字搜索文章（返回候选列表：标题/URL/作者/日期/回复数），不直接抓取正文；需要正文请调用 forum-fetch-thread-content。范围：传版块英文名=单版面；传分区节点ID=递归该分区；不传=默认搜流量最大的前5个版块；不传且传maxBoards=全站搜索（约3分钟）。结果可选写入 forum-content.db（persist=true，url_hash 去重不重复入库）。需要先执行forum-login。",
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
          .describe("每个版块最多翻页数，默认 1（只搜首页结果）"),
        maxItems: z
          .number()
          .int()
          .positive()
          .max(1000)
          .optional()
          .describe("每个版块最多返回条数，可选"),
        maxBoards: z
          .number()
          .int()
          .positive()
          .max(500)
          .optional()
          .describe("全站搜索时最多搜索的版块数（不传 boardName 且传此参数 = 全站搜索，约 3 分钟）"),
        persist: z
          .boolean()
          .default(true)
          .describe("是否将命中文章写入 forum-content.db（默认 true，即默认入库，url_hash 去重）"),
        concurrency: z
          .number()
          .int()
          .positive()
          .max(MAX_CONCURRENCY)
          .default(DEFAULT_CONCURRENCY)
          .describe(`同时搜索的版块数（并发度，默认 ${DEFAULT_CONCURRENCY}，上限 ${MAX_CONCURRENCY}）`),
      }),
    },
    async ({ boardName, keyword, author, maxPages, maxItems, maxBoards, persist, concurrency }) => {
      requireLogin();

      const start = Date.now();
      const tree = await fetchForumTree();
      const scope = resolveScope(boardName, tree, 5, maxBoards);
      const hits = await searchBoards(
        scope.boards,
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
        `搜索范围: ${scope.label}`,
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
