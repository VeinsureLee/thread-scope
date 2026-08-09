import { requireLogin } from "../../../auth/auth.js";
import { selectors, DEFAULT_CONCURRENCY, DEFAULT_SEARCH_MAX_RESULTS, DEFAULT_SEARCH_PER_BOARD } from "../../../core/config.js";
import { ContentDb } from "../../../storage/content-db.js";
import { fetchForumTree } from "../../../view/structure/index.js";
import { resolveSearchBoards, type ResolvedSearchScope } from "./resolve-search-boards.js";
import { searchBoardsGrouped, type SearchBoardGroup } from "./search-boards.js";
import { groupByBoard, limitPerBoard } from "../../../model/index.js";
import type { SearchRepository } from "../../../crawl/search/index.js";
import type { ArticleRow, ForumTreeNode } from "../../../model/dto/index.js";
import type { ContentStorePort } from "../../../model/index.js";

export interface SearchArticlesUseCaseOptions {
  readonly keyword?: string;
  readonly source?: "auto" | "local" | "remote";
  readonly boards?: string | readonly string[];
  readonly author?: string;
  readonly maxPages?: number;
  /** 每版返回上限（本地/联网均生效；默认 20） */
  readonly maxItems?: number;
  /** 全局返回上限（默认 100；结果过多时截断并返回 truncated 信号） */
  readonly maxResults?: number;
  /** 发帖日期下界（YYYY-MM-DD，仅本地生效） */
  readonly from?: string;
  /** 发帖日期上界（仅本地生效） */
  readonly to?: string;
  /** 排序：recent=时效(默认) / relevant=相关性（仅本地生效） */
  readonly sort?: "recent" | "relevant";
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
      /** 结果过多被截断（可用 boards/from/to/关键词进一步收敛） */
      readonly truncated: boolean;
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
      const maxResults = options.maxResults ?? DEFAULT_SEARCH_MAX_RESULTS;
      const perBoard = options.maxItems ?? DEFAULT_SEARCH_PER_BOARD;

      // 本地搜索也按 boards 收敛（all 时不加过滤，避免冗余 IN）
      let boardEnames: string[] | undefined;
      if (options.boards) {
        const tree = options.tree ?? (await fetchForumTree());
        const scope = resolveSearchBoards(tree, options.boards);
        if (scope.kind !== "all") boardEnames = scope.enames;
      }

      // 多取 1 条探测截断：超过全局上限即有更多结果未返回
      const rows = db.searchArticles(keyword, {
        boardEnames,
        from: options.from,
        to: options.to,
        sort: options.sort,
        limit: maxResults + 1,
      });

      const rawTruncated = rows.length > maxResults;
      const boardCounts = new Map<string, number>();
      for (const row of rows) boardCounts.set(row.boardEname, (boardCounts.get(row.boardEname) ?? 0) + 1);
      const perBoardTruncated = [...boardCounts.values()].some((c) => c > perBoard);

      const finalRows = limitPerBoard(rows, perBoard).slice(0, maxResults);
      const groups = groupByBoard(finalRows).map((g) => ({
        boardEname: g.boardEname,
        count: g.count,
        items: g.items,
      }));

      if (rows.length > 0 || source === "local") {
        return {
          kind: "results",
          source: "local",
          keyword,
          total: finalRows.length,
          boards: groups,
          truncated: rawTruncated || perBoardTruncated,
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
  const allRows = boards.flatMap((group) => group.items);

  // 全局截断：返回前 maxResults 条并标记 truncated
  const maxResults = options.maxResults ?? DEFAULT_SEARCH_MAX_RESULTS;
  const truncated = allRows.length > maxResults;
  const capped = allRows.slice(0, maxResults);
  const finalBoards = groupByBoard(capped).map((g) => ({
    boardEname: g.boardEname,
    count: g.count,
    items: g.items,
  }));
  const total = finalBoards.reduce((sum, group) => sum + group.count, 0);

  if (options.persist && capped.length > 0) persistRows(capped, options.store);
  return {
    kind: "results",
    source: "remote",
    keyword,
    author,
    scope,
    total,
    boards: finalBoards,
    truncated,
    elapsedMs: Date.now() - startedAt,
  };
}
