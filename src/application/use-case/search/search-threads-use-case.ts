import { ContentDb } from "../../../storage/content-db.js";
import { selectors } from "../../../core/config.js";
import type { SearchThreadHit } from "../../../models/index.js";
import { searchThreads, type SearchThreadsOptions } from "./search-threads.js";
import type { ContentStorePort, LocalThreadSearchHit } from "../../../model/index.js";

type LocalThreadHit = LocalThreadSearchHit;

export interface SearchThreadsUseCaseOptions extends SearchThreadsOptions {
  readonly keyword?: string;
  readonly source?: "auto" | "local" | "remote";
  readonly boardName?: string;
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
      const localHits = db.searchThreadsContent(keyword, {
        boardEname: options.scope === "board" ? options.boardName : undefined,
        limit: options.maxThreads ?? 20,
      });
      if (localHits.length > 0 || source === "local") {
        return {
          kind: "results",
          source: "local",
          keyword,
          localHits,
          hits: [],
          elapsedMs: Date.now() - startedAt,
        };
      }
    } finally {
      if (!options.store) db.close?.();
    }
  }

  const startedAt = Date.now();
  const result = await searchThreads(options.boardName, keyword ?? "", options);
  const hits = result.hits.slice(0, options.maxThreads ?? 20);
  if (options.persist && hits.length > 0) persistHits(hits, options.store);
  return {
    kind: "results",
    source: "remote",
    keyword,
    author,
    scope: result.scope,
    hits,
    localHits: [],
    elapsedMs: Date.now() - startedAt,
  };
}
