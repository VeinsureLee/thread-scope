import type { ForumTreeNode, SearchResult } from "../../../models/index.js";
import { forumRootFromLegacyTree, type ArticleSearchQuery } from "../../../model/index.js";
import { defaultTaskExecutor } from "../../execution/async-task-executor.js";
import { searchBoardArticles } from "../../../view/search/index.js";
import type { SearchRepository } from "../../../crawl/search/index.js";
import type { SearchScope } from "./scope-resolver.js";

export interface SearchArticlesOptions {
  readonly keyword?: string;
  readonly authorUid?: string;
  readonly maxPages?: number;
  readonly maxItems?: number;
  readonly concurrency: number;
  readonly repo?: SearchRepository;
}

/** 在给定 Forum scope 中按 DFS 任务计划并发搜索多个 board。 */
export async function searchArticlesInScope(
  tree: readonly ForumTreeNode[],
  scope: SearchScope,
  options: SearchArticlesOptions,
): Promise<SearchResult[]> {
  const query: ArticleSearchQuery = {
    keyword: options.keyword,
    authorUid: options.authorUid,
  };
  const forumRoot = forumRootFromLegacyTree(tree);
  const plan = forumRoot.createSearchArticlesPlan(query, {
    traversal: "dfs",
    pageLimit: options.maxPages,
    itemLimit: options.maxItems,
    boardEnames: scope.boards,
  });
  const outcomes = await defaultTaskExecutor.map(
    plan.tasks,
    { concurrency: options.concurrency, failureMode: "isolate" },
    async (task) => searchBoardArticles(
      task.board.ename,
      task.query.keyword ?? "",
      {
        author: task.query.authorUid,
        maxPages: task.pageLimit,
        maxItems: task.itemLimit,
      },
      options.repo,
    ),
  );
  return outcomes
    .filter((outcome) => outcome.status === "success" && outcome.value !== undefined)
    .flatMap((outcome) => outcome.value!);
}
