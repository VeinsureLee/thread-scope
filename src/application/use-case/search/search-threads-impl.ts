import { requireLogin } from "../../../auth/auth.js";
import type { SearchThreadHit, ArticleRow, ForumTreeNode } from "../../../model/dto/index.js";
import { fetchThreadDetail } from "../../../view/thread/index.js";
import { articleIdFromUrl, boardFromArticleUrl } from "../../../crawl/article/index.js";
import { searchBoardsGrouped } from "./search-boards.js";
import { resolveSearchBoards, type ResolvedSearchScope } from "./resolve-search-boards.js";
import { defaultTaskExecutor } from "../../execution/async-task-executor.js";
import { DEFAULT_CONCURRENCY } from "../../../core/config.js";
import { fetchForumTree } from "../../../view/structure/index.js";
import type { SearchRepository } from "../../../crawl/search/index.js";
import type { ThreadRepository } from "../../../crawl/content/index.js";
import { threadFromLegacyDetail, limitPerBoard } from "../../../model/index.js";

export interface SearchThreadsOptions {
  boards?: string | readonly string[];
  author?: string;
  maxPages?: number;
  maxItems?: number;
  /** 显式 boards（custom）时每版最多抓取 N 条，默认 2。 */
  maxThreadsPerBoard?: number;
  /** all/top 大范围时的全局抓取上限，默认 100。 */
  maxThreads?: number;
  maxThreadPages?: number;
  concurrency?: number;
  tree?: ForumTreeNode[];
}

export interface SearchThreadsRepositories {
  searchRepo?: SearchRepository;
  threadRepo?: ThreadRepository;
}

/**
 * 搜索 Thread 用例：
 * 1. resolveSearchBoards 决定目标版块集合与范围类型（all/top/custom）；
 * 2. ForumNode/算法产生的版面顺序交由版面搜索池执行；
 * 3. 命中后：custom 模式每版限 maxThreadsPerBoard 条，all/top 模式全局限 maxThreads 条；
 *    再交由独立 Thread 池抓详情；
 * 4. View 只负责单版面/单详情页读取，所有跨资源并发由此处控制。
 */
export async function searchThreads(
  boards: string | readonly string[] | undefined,
  keyword: string,
  opts: SearchThreadsOptions = {},
  repos: SearchThreadsRepositories = {},
): Promise<{ scope: ResolvedSearchScope; hits: SearchThreadHit[] }> {
  requireLogin();

  const tree = opts.tree ?? (await fetchForumTree());
  const scope = resolveSearchBoards(tree, boards);
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;

  const groups = await searchBoardsGrouped(
    scope.enames,
    keyword,
    { author: opts.author, maxPages: opts.maxPages, maxItems: opts.maxItems },
    concurrency,
    tree,
    repos.searchRepo,
  );

  // 展平为带 boardEname 的命中项
  const hits: Array<{ row: ArticleRow; boardEname: string }> = groups.flatMap((group) =>
    group.items.map((hit) => ({ row: hit.row, boardEname: group.boardEname })),
  );

  // 限量：custom 每版 N 条；all/top 全局上限
  const limited = scope.kind === "custom"
    ? limitPerBoard(hits, opts.maxThreadsPerBoard ?? 2)
    : hits.slice(0, opts.maxThreads ?? 100);

  const threadOutcomes = await defaultTaskExecutor.map(
    limited,
    { concurrency, failureMode: "isolate" },
    async (hit) => {
      const board = boardFromArticleUrl(hit.row.url);
      const articleId = articleIdFromUrl(hit.row.url);
      if (!board || !articleId) {
        throw new Error(`无法从 URL 解析版面/文章ID: ${hit.row.url}`);
      }
      const detail = await fetchThreadDetail(
        board,
        articleId,
        { maxPages: opts.maxThreadPages },
        repos.threadRepo,
      );
      const thread = threadFromLegacyDetail(detail, {
        title: hit.row.title,
        isPinned: hit.row.isPinned,
        replyCount: hit.row.replyCount,
      });
      return {
        boardEname: board,
        articleId,
        title: detail.title || hit.row.title,
        url: hit.row.url,
        firstPost: detail.firstPost,
        replies: detail.replies,
        thread,
      } satisfies SearchThreadHit;
    },
  );

  return {
    scope,
    hits: threadOutcomes
      .filter((outcome): outcome is typeof outcome & { status: "success"; value: SearchThreadHit } => outcome.status === "success")
      .map((outcome) => outcome.value),
  };
}
