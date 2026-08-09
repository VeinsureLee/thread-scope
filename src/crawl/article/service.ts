import { load } from "cheerio";
import { requireLogin } from "../../auth/auth.js";
import type { ArticleRow } from "../../model/dto/index.js";
import { paginate, parsePagination } from "../common/paginator.js";
import { ArticleRepository, HttpArticleRepository } from "./repository.js";
import { parseArticleList } from "./parser.js";

/**
 * 爬取指定版块的文章列表（含翻页）。
 *
 * 能力（docs/03 §2.3 #2 — 合并自旧 forum-fetch-articles）：
 * - 默认只爬首页；可指定页数上限 / 数量上限
 * - 翻页由 paginator 统一驱动（docs/03 §5 #6 — 增量与幂等是底层契约）
 * - 列表页【只看不写】：返回文章行，落库由调用方（工具层）决定
 *
 * @param boardName 版块英文名（如 Beauty）
 * @param opts      { maxPages?, maxItems? } — 页数/数量上限
 * @param repo      数据访问实现（默认 HTTP，测试可注入 fake）
 * @returns 文章行列表（跨页累积，已按序）
 */
export async function fetchBoardArticles(
  boardName: string,
  opts: { maxPages?: number; maxItems?: number } = {},
  repo: ArticleRepository = new HttpArticleRepository(),
): Promise<ArticleRow[]> {
  requireLogin();

  const startPath = await repo.boardUrl(boardName);

  const rows = await paginate<ArticleRow>(
    startPath,
    async (path) => {
      const html = await repo.fetch(path);
      const page = parsePagination(load(html));
      const items = parseArticleList(boardName, html);
      // 下一页：分页控件里的 nextHref（已是完整相对路径，含 ?p=n）
      return { items, nextHref: page?.nextHref ?? null };
    },
    { maxPages: opts.maxPages ?? 1, maxItems: opts.maxItems },
  );

  // 跨页去重（翻页边界最后一条/下页第一条可能重复）
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}
