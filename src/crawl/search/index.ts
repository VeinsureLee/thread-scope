/**
 * crawl/search 统一出口（docs/01 §2.1 — 同构四件套）。
 * 工具层只走 index.ts，不直接 import 内部文件。
 */
export {
  searchBoardArticles,
  searchAllBoards,
  searchAndSnapshot,
  resolveScope,
  type SearchScope,
} from "./service.js";
export type { SearchRepository, HttpSearchRepository } from "./repository.js";
export {
  parseSearchResults,
  keywordFromUrl,
  boardFromSearchUrl,
} from "./parser.js";
