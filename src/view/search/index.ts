import * as searchCrawl from "../../crawl/search/index.js";
import type { SearchRepository } from "../../crawl/search/index.js";
import type { SearchViewPort } from "../../model/index.js";

/** Search View：只读取单个版块的搜索结果；范围解析和并发在 Application 完成。 */
export function searchBoardArticles(
  boardName: string,
  keyword: string,
  options: { author?: string; maxPages?: number; maxItems?: number } = {},
  repo?: SearchRepository,
): ReturnType<typeof searchCrawl.searchBoardArticles> {
  return searchCrawl.searchBoardArticles(boardName, keyword, options, repo);
}

export const searchView: SearchViewPort = { searchBoardArticles };
export type { SearchRepository, HttpSearchRepository } from "../../crawl/search/index.js";
