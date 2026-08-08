/**
 * crawl/search 统一出口（docs/01 §2.1 — 同构四件套）。
 * 只导出单 board 搜索读取；跨 board 并发编排在 application/use-case/search。
 */
export { searchBoardArticles } from "./service.js";
export type { SearchRepository, HttpSearchRepository } from "./repository.js";
export {
  parseSearchResults,
  keywordFromUrl,
  boardFromSearchUrl,
} from "./parser.js";
