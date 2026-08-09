import { requireLogin } from "../../../auth/auth.js";
import { selectors, DEFAULT_CONCURRENCY } from "../../../core/config.js";
import { ContentDb } from "../../../storage/content-db.js";
import { fetchForumTree } from "../../../view/structure/index.js";
import { resolveSearchBoards, type ResolvedSearchScope } from "./resolve-search-boards.js";
import { searchBoardsGrouped, type SearchBoardGroup } from "./search-boards.js";
import { groupByBoard } from "../../../model/index.js";
import type { SearchRepository } from "../../../crawl/search/index.js";
import type { ArticleRow, ForumTreeNode } from "../../../model/dto/index.js";
import type { ContentStorePort } from "../../../model/index.js";

export interface SearchArticlesUseCaseOptions {
  readonly keyword?: string;
  readonly source?: "auto" | "local" | "remote";
  readonly boards?: string | readonly string[];
  readonly author?: string;
  readonly maxPages?: number;
  readonly maxItems?: number;
  readonly persist?: boolean;
  readonly concurrency?: number;
  readonly tree?: ForumTreeNode[];
  readonly searchRepo?: SearchRepository;
  readonly store?: ContentStorePort;
}

export interface SearchArticleGroup {
  readonly boardEname: string;
  readonly count: number;
  readonly items: readonly ArticleRow[];
}

export type SearchArticlesUseCaseResult =
  | {
      readonly kind: "results";
      readonly source: "local" | "remote";
      readonly keyword?: string;
      readonly author?: string;
      readonly scope?: ResolvedSearchScope;
      readonly total: number;
      readonly boards: readonly SearchArticleGroup[];
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
      const rows = db.searchArticles(keyword, { limit: options.maxItems });
      if (rows.length > 0 || source === "local") {
        const groups = groupByBoard(rows).map((g) => ({
          boardEname: g.boardEname,
          count: g.count,
          items: g.items,
        }));
        return {
          kind: "results",
          source: "local",
          keyword,
          total: rows.length,
          boards: groups,
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
  const scope = resolveSearchBoards(tree, options.boards);

  // 仅 keyword（无 author）时远程查询也可走本地缓存优先：
  // 若本地无命中则继续联网。author 过滤只对远程有效。
  const hits = await searchBoardsGrouped(
    scope.enames,
    keyword ?? "",
    {
      author: author || undefined,
      maxPages: options.maxPages,
      maxItems: options.maxItems,
    },
    options.concurrency ?? DEFAULT_CONCURRENCY,
    tree,
    options.searchRepo,
  );

  const boards: SearchArticleGroup[] = hits.map((group: SearchBoardGroup) => ({
    boardEname: group.boardEname,
    count: group.count,
    items: group.items.map((hit) => hit.row),
  }));
  const total = boards.reduce((sum, group) => sum + group.count, 0);
  const allRows = boards.flatMap((group) => group.items);
  if (options.persist && allRows.length > 0) persistRows(allRows, options.store);
  return {
    kind: "results",
    source: "remote",
    keyword,
    author,
    scope,
    total,
    boards,
    elapsedMs: Date.now() - startedAt,
  };
}
