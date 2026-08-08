import * as threadCrawl from "../../crawl/content/index.js";
import type { ThreadRepository } from "../../crawl/content/index.js";
import type { ThreadViewPort } from "../../model/index.js";

/** Thread View：只负责单篇详情页读取与解析，不负责 Thread 合并或持久化。 */
export function fetchThreadDetail(
  boardName: string,
  articleId: string,
  options: { maxPages?: number } = {},
  repo?: ThreadRepository,
): ReturnType<typeof threadCrawl.fetchThreadDetail> {
  return threadCrawl.fetchThreadDetail(boardName, articleId, options, repo);
}

export function parseThreadPage(...args: Parameters<typeof threadCrawl.parseThreadPage>): ReturnType<typeof threadCrawl.parseThreadPage> {
  return threadCrawl.parseThreadPage(...args);
}

export const threadView: ThreadViewPort = { fetchThreadDetail };
export type { ThreadRepository, HttpThreadRepository } from "../../crawl/content/index.js";
