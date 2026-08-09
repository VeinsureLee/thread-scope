import { forumRootFromLegacyTree } from "../../../model/index.js";
import { searchBoardArticles } from "../../../view/search/index.js";
import { defaultTaskExecutor } from "../../execution/async-task-executor.js";
import { logWarn } from "../../../logging/logger.js";
import type { SearchRepository } from "../../../crawl/search/index.js";
import type { ForumTreeNode, SearchResult } from "../../../model/dto/index.js";

/** 按版分组后的搜索命中组（含该版命中条数）。 */
export interface SearchBoardGroup {
  readonly boardEname: string;
  readonly count: number;
  readonly items: SearchResult[];
}

/**
 * 跨版面并发搜索并按版分组（文档 §3.1：并发唯一控制点在 Application UseCase）。
 *
 * articles 与 threads 共用此函数：由 ForumNode.createSearchArticlesPlan 生成
 * 目标版块任务计划，经统一 Executor 工作池并发执行；完成后按原版面顺序聚合，
 * 只保留有命中的版面并计数。请求频率由 PageFetcher 令牌队列统一兜底。
 * View 只负责单 board 搜索读取。
 *
 * @param boards  目标版块英文名列表（已由 resolveSearchBoards 解析）
 * @param keyword 搜索关键字
 * @param opts    { author?, maxPages?, maxItems? }
 * @param concurrency  并发度
 * @param tree    论坛 DTO 树（用于水合 ForumNode）
 * @param repo    数据访问实现（默认 HTTP，测试可注入 fake）
 */
export async function searchBoardsGrouped(
  boards: string[],
  keyword: string,
  opts: { author?: string; maxPages?: number; maxItems?: number },
  concurrency: number,
  tree: readonly ForumTreeNode[],
  repo?: SearchRepository,
): Promise<SearchBoardGroup[]> {
  const forumRoot = forumRootFromLegacyTree(tree);
  const plan = forumRoot.createSearchArticlesPlan(
    { keyword, authorUid: opts.author },
    {
      traversal: "dfs",
      pageLimit: opts.maxPages,
      itemLimit: opts.maxItems,
      boardEnames: boards,
    },
  );

  const outcomes = await defaultTaskExecutor.map(
    plan.tasks,
    { concurrency, failureMode: "isolate" },
    async (task) => searchBoardArticles(
      task.board.ename,
      keyword,
      { author: opts.author, maxPages: task.pageLimit, maxItems: task.itemLimit },
      repo,
    ),
  );

  const groups: SearchBoardGroup[] = [];
  for (const outcome of outcomes) {
    const ename = plan.tasks[outcome.index]!.board.ename;
    if (outcome.status === "success" && outcome.value !== undefined && outcome.value.length > 0) {
      groups.push({ boardEname: ename, count: outcome.value.length, items: outcome.value });
    }
  }

  const failed = outcomes.filter((outcome) => outcome.status === "failed").length;
  if (failed > 0) {
    const details = outcomes
      .filter((outcome) => outcome.status === "failed")
      .map((outcome) => `版面 [${plan.tasks[outcome.index]!.board.ename}] 搜索失败: ${outcome.error?.message ?? "未知错误"}`);
    logWarn("crawl", { message: "部分版面搜索失败", boards: details }, "crawler.search");
  }
  return groups;
}
