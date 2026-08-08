import { requireLogin } from "../../../auth/auth.js";
import { fetchBoardArticles as fetchBoardArticlesView } from "../../../view/article/index.js";
import type { ArticleRepository } from "../../../crawl/article/index.js";
import { ContentDb } from "../../../storage/content-db.js";
import { selectors } from "../../../core/config.js";
import type { ArticleRow } from "../../../models/index.js";
import type { ContentStorePort, ArticleViewPort } from "../../../model/index.js";

export interface FetchBoardArticlesResult {
  readonly boardName: string;
  readonly rows: ArticleRow[];
  readonly persisted: boolean;
}

export async function fetchBoardArticles(
  boardName: string,
  options: {
    maxPages?: number;
    maxItems?: number;
    persist?: boolean;
    view?: ArticleViewPort;
    store?: ContentStorePort;
  } = {},
  repo?: ArticleRepository,
): Promise<FetchBoardArticlesResult> {
  requireLogin();
  const rows = options.view
    ? [...await options.view.fetchBoardArticles(boardName, { maxPages: options.maxPages, maxItems: options.maxItems })]
    : await fetchBoardArticlesView(
      boardName,
      { maxPages: options.maxPages, maxItems: options.maxItems },
      repo,
    );
  const persist = options.persist ?? true;
  if (persist) {
    const db = options.store ?? new ContentDb();
    try {
      db.upsertBoard(boardName, boardName, boardName === selectors.anonymous.board);
      for (const row of rows) {
        if (row.authorUid) db.upsertUser({ uid: row.authorUid, name: row.authorRaw || row.authorUid });
        if (row.lastReplierUid) db.upsertUser({ uid: row.lastReplierUid, name: row.lastReplierUid });
      }
      db.upsertArticles(rows);
    } finally {
      if (!options.store) db.close?.();
    }
  }
  return { boardName, rows, persisted: persist };
}
