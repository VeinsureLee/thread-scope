import { requireLogin } from "../../../auth/auth.js";
import type { SearchThreadHit, ArticleRow, ForumTreeNode } from "../../../models/index.js";
import { fetchThreadDetail } from "../../../view/thread/index.js";
import { articleIdFromUrl, boardFromArticleUrl } from "../../../crawl/article/index.js";
import { searchBoardArticles } from "../../../view/search/index.js";
import { resolveScope, type SearchScope } from "./scope-resolver.js";
import { defaultTaskExecutor } from "../../execution/async-task-executor.js";
import { DEFAULT_CONCURRENCY } from "../../../core/config.js";
import { fetchForumTree } from "../../../view/structure/index.js";
import type { SearchRepository } from "../../../crawl/search/index.js";
import type { ThreadRepository } from "../../../crawl/content/index.js";
import { threadFromLegacyDetail } from "../../../model/index.js";

export interface SearchThreadsOptions {
  scope?: "all" | "top" | "board" | "section" | "auto";
  author?: string;
  maxPages?: number;
  maxItems?: number;
  maxBoards?: number;
  maxThreads?: number;
  maxThreadPages?: number;
  topCount?: number;
  concurrency?: number;
  tree?: ForumTreeNode[];
}

export interface SearchThreadsRepositories {
  searchRepo?: SearchRepository;
  threadRepo?: ThreadRepository;
}

/**
 * 搜索 Thread 用例：
 * 1. ResolveScope 只决定任务范围；
 * 2. ForumNode/算法产生的版面顺序交由版面搜索池执行；
 * 3. 命中后受 maxThreads 限制，再交由独立 Thread 池抓详情；
 * 4. View 只负责单版面/单详情页读取，所有跨资源并发由此处控制。
 */
export async function searchThreads(
  nodeId: string | undefined,
  keyword: string,
  opts: SearchThreadsOptions = {},
  repos: SearchThreadsRepositories = {},
): Promise<{ scope: SearchScope; hits: SearchThreadHit[] }> {
  requireLogin();

  const tree = opts.tree ?? (await fetchForumTree());
  const scope = resolveScope(opts.scope, nodeId, tree, opts.topCount ?? 5, opts.maxBoards);
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;

  const boardOutcomes = await defaultTaskExecutor.map(
    scope.boards,
    { concurrency, failureMode: "isolate" },
    async (ename) => searchBoardArticles(
      ename,
      keyword,
      { author: opts.author, maxPages: opts.maxPages, maxItems: opts.maxItems },
      repos.searchRepo,
    ),
  );

  const hits: Array<{ row: ArticleRow; boardEname: string }> = [];
  for (const outcome of boardOutcomes) {
    if (outcome.status === "success") {
      hits.push(...(outcome.value ?? []));
    }
  }

  const maxThreads = opts.maxThreads ?? 20;
  const limited = hits.slice(0, maxThreads);
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
