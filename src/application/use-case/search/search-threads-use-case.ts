import { ContentDb } from "../../../storage/content-db.js";
import { selectors, DEFAULT_SEARCH_MAX_THREADS, DEFAULT_SEARCH_PER_BOARD_THREADS } from "../../../core/config.js";
import type { SearchThreadHit } from "../../../model/dto/index.js";
import { searchThreads, type SearchThreadsOptions } from "./search-threads.js";
import { limitPerBoard } from "../../../model/index.js";
import { resolveSearchBoards } from "./resolve-search-boards.js";
import { fetchForumTree } from "../../../view/structure/index.js";
import type { ContentStorePort, LocalThreadSearchHit } from "../../../model/index.js";

type LocalThreadHit = LocalThreadSearchHit;

export interface SearchThreadsUseCaseOptions extends SearchThreadsOptions {
  readonly keyword?: string;
  readonly source?: "auto" | "local" | "remote";
  readonly persist?: boolean;
  readonly store?: ContentStorePort;
}

export type SearchThreadsUseCaseResult =
  | {
      readonly kind: "results";
      readonly source: "local" | "remote";
      readonly keyword?: string;
      readonly author?: string;
      readonly scope?: Awaited<ReturnType<typeof searchThreads>>["scope"];
      readonly hits: readonly SearchThreadHit[];
      readonly localHits: readonly LocalThreadHit[];
      /** 结果过多被截断（可用 boards/from/to/关键词进一步收敛） */
      readonly truncated: boolean;
      readonly elapsedMs: number;
    }
  | { readonly kind: "invalid"; readonly message: string };

function persistHits(hits: readonly SearchThreadHit[], store?: ContentStorePort): void {
  const db = store ?? new ContentDb();
  try {
    for (const hit of hits) {
      db.upsertBoard(hit.boardEname, hit.boardEname, hit.boardEname === selectors.anonymous.board);
      if (hit.thread) {
        db.saveThreadModel(hit.thread);
        continue;
      }
      const authors = [hit.firstPost, ...hit.replies]
        .filter((post) => post.authorUid && !post.isAnon)
        .map((post) => ({ uid: post.authorUid!, name: post.authorRaw, isAnon: false }));
      db.saveThread(
        hit.boardEname,
        { url: hit.url, title: hit.title },
        authors,
        hit.firstPost,
        hit.replies,
      );
    }
  } finally {
    if (!store) db.close?.();
  }
}

export async function searchThreadsUseCase(
  options: SearchThreadsUseCaseOptions,
): Promise<SearchThreadsUseCaseResult> {
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
      const maxThreads = options.maxThreads ?? DEFAULT_SEARCH_MAX_THREADS;
      const perBoard = options.maxThreadsPerBoard ?? DEFAULT_SEARCH_PER_BOARD_THREADS;

      // 本地搜索也按 boards 收敛（all 时不加过滤，避免冗余 IN）
      let boardEnames: string[] | undefined;
      if (options.boards) {
        const tree = options.tree ?? (await fetchForumTree());
        const scope = resolveSearchBoards(tree, options.boards);
        if (scope.kind !== "all") boardEnames = scope.enames;
      }

      // 多取 1 条探测截断
      const rows = db.searchThreadsContent(keyword, {
        boardEnames,
        from: options.from,
        to: options.to,
        sort: options.sort,
        limit: maxThreads + 1,
      });

      const rawTruncated = rows.length > maxThreads;
      const boardCounts = new Map<string, number>();
      for (const row of rows) boardCounts.set(row.boardEname, (boardCounts.get(row.boardEname) ?? 0) + 1);
      const perBoardTruncated = [...boardCounts.values()].some((c) => c > perBoard);

      const localHits = limitPerBoard(rows, perBoard).slice(0, maxThreads);

      if (rows.length > 0 || source === "local") {
        return {
          kind: "results",
          source: "local",
          keyword,
          localHits,
          hits: [],
          truncated: rawTruncated || perBoardTruncated,
          elapsedMs: Date.now() - startedAt,
        };
      }
    } finally {
      if (!options.store) db.close?.();
    }
  }

  const startedAt = Date.now();
  const result = await searchThreads(options.boards, keyword ?? "", options);
  const hits = result.hits;
  if (options.persist && hits.length > 0) persistHits(hits, options.store);
  return {
    kind: "results",
    source: "remote",
    keyword,
    author,
    scope: result.scope,
    hits,
    localHits: [],
    truncated: result.truncated,
    elapsedMs: Date.now() - startedAt,
  };
}
