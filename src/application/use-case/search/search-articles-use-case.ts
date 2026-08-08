import { requireLogin } from "../../../auth/auth.js";
import { selectors, DEFAULT_CONCURRENCY } from "../../../core/config.js";
import { ContentDb } from "../../../storage/content-db.js";
import { fetchForumTree } from "../../../view/structure/index.js";
import { resolveScope, type SearchScope } from "./scope-resolver.js";
import type { SearchRepository } from "../../../crawl/search/index.js";
import type { ArticleRow, ForumTreeNode, SearchResult } from "../../../models/index.js";
import { searchArticlesInScope } from "./search-articles.js";
import type { ContentStorePort } from "../../../model/index.js";

export interface SearchArticlesUseCaseOptions {
  readonly keyword?: string;
  readonly source?: "auto" | "local" | "remote";
  readonly scope?: "all" | "top" | "board" | "section";
  readonly boardName?: string;
  readonly author?: string;
  readonly maxPages?: number;
  readonly maxItems?: number;
  readonly maxBoards?: number;
  readonly persist?: boolean;
  readonly concurrency?: number;
  readonly tree?: ForumTreeNode[];
  readonly searchRepo?: SearchRepository;
  readonly store?: ContentStorePort;
}

export type SearchArticlesUseCaseResult =
  | {
      readonly kind: "results";
      readonly source: "local" | "remote";
      readonly keyword?: string;
      readonly author?: string;
      readonly scope?: SearchScope;
      readonly rows: readonly ArticleRow[];
      readonly elapsedMs: number;
    }
  | { readonly kind: "invalid"; readonly message: string };

function persistRows(rows: readonly ArticleRow[], store?: ContentStorePort): void {
  const db = store ?? new ContentDb();
  try {
    for (const ename of new Set(rows.map((row) => row.boardEname))) {
      db.upsertBoard(ename, ename, ename === selectors.anonymous.board);
    }
    for (const row of rows) {
      if (row.authorUid) db.upsertUser({ uid: row.authorUid, name: row.authorRaw || row.authorUid });
      if (row.lastReplierUid) db.upsertUser({ uid: row.lastReplierUid, name: row.lastReplierUid });
    }
    db.upsertArticles([...rows]);
  } finally {
    if (!store) db.close?.();
  }
}

export async function searchArticlesUseCase(
  options: SearchArticlesUseCaseOptions,
): Promise<SearchArticlesUseCaseResult> {
  const source = options.source ?? "auto";
  const keyword = options.keyword?.trim();
  const author = options.author?.trim();

  if (!keyword && !author) {
    return { kind: "invalid", message: "搜索需要提供 keyword 或 author。" };
  }

  if ((source === "local" || source === "auto") && !author && keyword) {
    const startedAt = Date.now();
    const db = options.store ?? new ContentDb();
    try {
      const rows = db.searchArticles(keyword, {
        boardEname: options.scope === "board" ? options.boardName : undefined,
        limit: options.maxItems,
      });
      if (rows.length > 0 || source === "local") {
        return {
          kind: "results",
          source: "local",
          keyword,
          rows,
          elapsedMs: Date.now() - startedAt,
        };
      }
    } finally {
      if (!options.store) db.close?.();
    }
  }

  requireLogin();
  const startedAt = Date.now();
  const tree = options.tree ?? (await fetchForumTree());
  const scope = resolveScope(options.scope, options.boardName, tree, 5, options.maxBoards);
  const hits = await searchArticlesInScope(tree, scope, {
    keyword,
    authorUid: author,
    maxPages: options.maxPages,
    maxItems: options.maxItems,
    concurrency: options.concurrency ?? DEFAULT_CONCURRENCY,
    repo: options.searchRepo,
  });
  const rows = hits.map((hit: SearchResult) => hit.row);
  if (options.persist && rows.length > 0) persistRows(rows, options.store);
  return {
    kind: "results",
    source: "remote",
    keyword,
    author,
    scope,
    rows,
    elapsedMs: Date.now() - startedAt,
  };
}
