import * as articleCrawl from "../../crawl/article/index.js";
import type { ArticleViewPort } from "../../model/index.js";
import type { ArticleRepository } from "../../crawl/article/index.js";

/** Article View：只负责版块列表页读取与解析，跨版块编排由 Application 完成。 */
export function fetchBoardArticles(
  boardName: string,
  options: { maxPages?: number; maxItems?: number } = {},
  repo?: ArticleRepository,
): ReturnType<typeof articleCrawl.fetchBoardArticles> {
  return articleCrawl.fetchBoardArticles(boardName, options, repo);
}

export const articleView: ArticleViewPort = { fetchBoardArticles };
export type { ArticleRepository, HttpArticleRepository } from "../../crawl/article/index.js";
