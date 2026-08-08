import type { SearchResult } from "../../../models/index.js";
import { searchBoardArticles } from "../../../view/search/index.js";
import { defaultTaskExecutor } from "../../execution/async-task-executor.js";
import { logWarn } from "../../../logging/logger.js";
import type { SearchRepository } from "../../../crawl/search/index.js";

/**
 * 跨版面并发搜索编排（文档 §3.1：并发唯一控制点在 Application UseCase）。
 *
 * 版面之间完全独立，用统一 Executor 工作池并发，同时最多 concurrency 个版面
 * 搜索在途；完成后按原版面顺序聚合。请求频率由 PageFetcher 令牌队列统一兜底。
 * View 只负责单 board 搜索读取。
 *
 * @param boardEnames  版块英文名列表
 * @param keyword      搜索关键字
 * @param opts         { author?, maxPages?, maxItems? }
 * @param concurrency  并发度
 * @param repo         数据访问实现（默认 HTTP，测试可注入 fake）
 */
export async function searchBoards(
  boardEnames: string[],
  keyword: string,
  opts: { author?: string; maxPages?: number; maxItems?: number },
  concurrency: number,
  repo?: SearchRepository,
): Promise<SearchResult[]> {
  const outcomes = await defaultTaskExecutor.map(
    boardEnames,
    { concurrency, failureMode: "isolate" },
    async (ename) => searchBoardArticles(ename, keyword, opts, repo),
  );

  const errors = outcomes
    .filter((outcome) => outcome.status === "failed")
    .map((outcome) => `版面 [${boardEnames[outcome.index]!}] 搜索失败: ${outcome.error?.message ?? "未知错误"}`);
  if (errors.length > 0) {
    logWarn("crawl", { message: "部分版面搜索失败", boards: errors }, "crawler.search");
  }

  return outcomes
    .filter((outcome) => outcome.status === "success" && outcome.value !== undefined)
    .flatMap((outcome) => outcome.value!);
}
