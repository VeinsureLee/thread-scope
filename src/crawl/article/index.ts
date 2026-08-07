/**
 * crawl/article 统一出口（docs/01 §2.1 — 同构四件套）。
 * 工具层只走 index.ts，不直接 import 内部文件。
 */
export { fetchBoardArticles } from "./service.js";
export type { ArticleRepository, HttpArticleRepository } from "./repository.js";
export { parseArticleList, articleIdFromUrl, boardFromArticleUrl } from "./parser.js";
