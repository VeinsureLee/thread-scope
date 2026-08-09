import { load } from "cheerio";
import { requireLogin } from "../../auth/auth.js";
import type { SearchResult } from "../../model/dto/index.js";
import { paginate, parsePagination } from "../common/paginator.js";
import { SearchRepository, HttpSearchRepository } from "./repository.js";
import { parseSearchResults } from "./parser.js";

/**
 * 在单个版面内搜索文章（含翻页）。View 职责（文档 §4.5）。
 *
 * 只负责单 board 的搜索分页读取与解析；跨 board 并发、范围解析、
 * 去重聚合由 Application UseCase 编排。
 *
 * @param boardEname 版块英文名（如 Demo）
 * @param keyword    搜索关键字
 * @param opts       { author?, maxPages?, maxItems? } — 作者过滤与数量上限
 * @param repo       数据访问实现（默认 HTTP，测试可注入 fake）
 * @returns 命中文章行列表（已跨页去重）
 */
export async function searchBoardArticles(
  boardEname: string,
  keyword: string,
  opts: { author?: string; maxPages?: number; maxItems?: number } = {},
  repo: SearchRepository = new HttpSearchRepository(),
): Promise<SearchResult[]> {
  requireLogin();

  const startPath = repo.searchUrl({ boardEname, keyword, author: opts.author });

  const rows = await paginate<SearchResult>(
    startPath,
    async (path) => {
      const html = await repo.fetch(path);
      const page = parsePagination(load(html));
      const items = parseSearchResults(boardEname, html).map((row) => ({
        row,
        boardEname,
      }));
      // 下一页：分页控件里的 nextHref（已是完整相对路径，含 ?p=n）
      return { items, nextHref: page?.nextHref ?? null };
    },
    { maxPages: opts.maxPages ?? 1, maxItems: opts.maxItems },
  );

  // 跨页去重（翻页边界最后一条/下页第一条可能重复）
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.row.url)) return false;
    seen.add(r.row.url);
    return true;
  });
}
