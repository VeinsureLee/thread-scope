import { selectors } from "../../core/config.js";
import type { ArticleRow } from "../../model/dto/index.js";
import { parseArticleList } from "../article/parser.js";

/**
 * 解析搜索结果页（/s/article，element-06）。
 *
 * 结果表为 table.board-list.tiz（多一个 .tiz class，行结构同文章列表），
 * 直接复用 article 的 parseArticleList，收敛到 tiz 表即可（docs/04 §1.2）。
 *
 * @param boardEname 搜索的版块英文名（全站时为实际命中版块）
 * @param html       搜索结果页 HTML
 * @returns 命中文章行列表
 */
export function parseSearchResults(boardEname: string, html: string): ArticleRow[] {
  // result_table 是表选择器（table.board-list.tiz），转成行选择器复用 parseArticleList
  const rowSelector = `${selectors.search.result_table} tbody tr`;
  return parseArticleList(boardEname, html, rowSelector);
}

/** 从搜索 URL 提取关键字（快照记录用；解析失败返回空串） */
export function keywordFromUrl(url: string): string {
  const m = url.match(/[?&]t1=([^&]*)/);
  return m ? decodeURIComponent(m[1]!) : "";
}

/** 从搜索 URL 提取版块英文名（b 参数；解析失败返回空串） */
export function boardFromSearchUrl(url: string): string {
  const m = url.match(/[?&]b=([^&]*)/);
  return m ? decodeURIComponent(m[1]!) : "";
}
