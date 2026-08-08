import { fetchThreadDetail } from "../../../view/thread/index.js";
import type { ThreadRepository } from "../../../view/thread/index.js";
import { threadFromLegacyDetail } from "../../../model/index.js";
import type { Thread } from "../../../model/index.js";
import { ContentDb } from "../../../storage/content-db.js";
import type { ContentStorePort, ThreadViewPort } from "../../../model/index.js";

export interface FetchThreadResult {
  readonly thread: Thread;
  readonly persisted: boolean;
}

/** 抓取单个 Thread 的应用用例；搜索与线程详情是两个独立生命周期。 */
export async function fetchThread(
  boardName: string,
  articleId: string,
  options: {
    maxPages?: number;
    persist?: boolean;
    view?: ThreadViewPort;
    store?: ContentStorePort;
  } = {},
  repo?: ThreadRepository,
): Promise<FetchThreadResult> {
  const detail = options.view
    ? await options.view.fetchThreadDetail(boardName, articleId, { maxPages: options.maxPages })
    : await fetchThreadDetail(boardName, articleId, { maxPages: options.maxPages }, repo);
  const thread = threadFromLegacyDetail(detail);
  const persist = options.persist ?? true;

  if (persist) {
    const db = options.store ?? new ContentDb();
    try {
      db.saveThreadModel(thread);
    } finally {
      if (!options.store) db.close?.();
    }
  }
  return { thread, persisted: persist };
}
