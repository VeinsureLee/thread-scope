import { defaultTaskExecutor } from "../../application/execution/async-task-executor.js";

/**
 * 异步并发工具：带并发上限的映射（工作池）。
 *
 * 用途（docs/05 搜索并发设计）：
 * - 跨版面搜索：286 个版块任务，同时最多 limit 个在途；
 * - 帖子正文抓取：命中帖子之间独立，同时最多 limit 个在途；
 * - 分区流量采集：按分区分组，同时最多 limit 个在途。
 *
 * 三个保证：
 * 1. limit 生效：任意时刻在途任务数 ≤ limit；
 * 2. 顺序保持：结果按 items 原始顺序返回（完成时序不影响顺序）；
 * 3. 单项失败隔离：某个任务 reject 不会 abort 整池，记入 error 返回。
 *
 * 并发度（limit）与请求频率是两回事：本工具只管"同时多少在途"，
 * 真正的请求间隔由 PageFetcher 令牌队列统一兜底（见 docs/05 §3）。
 */
export interface PoolResult<T> {
  /** 任务成功时的值 */
  value?: T;
  /** 任务失败时的错误 */
  error?: Error;
}

/**
 * 对 items 逐项执行 async fn，最多 limit 个在途。
 *
 * @param items  任务列表（原始顺序）
 * @param limit  并发上限（>=1）
 * @param fn     异步任务函数
 * @returns 结果数组（与 items 同序）；单项失败对应项 error 非空
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<Array<PoolResult<R> & { index: number }>> {
  if (limit < 1) {
    throw new Error(`并发度 limit 必须 >= 1，收到 ${limit}`);
  }

  const outcomes = await defaultTaskExecutor.map(
    items,
    { concurrency: limit, failureMode: "isolate" },
    fn,
  );
  return outcomes.map((outcome) => {
    if (outcome.status === "success") return { index: outcome.index, value: outcome.value };
    return {
      index: outcome.index,
      error: new Error(outcome.error?.message ?? `任务${outcome.status}`),
    };
  });
}

/**
 * 便捷：只取成功项（忽略失败）。
 * 成功 = 无 error（即使值本身是 undefined）；失败 = error 已设置。
 * 依赖顺序保持：返回值与 items 中"成功的那部分"同序。
 */
export function poolValues<T>(
  results: Array<PoolResult<T> & { index: number }>,
): T[] {
  return results.filter((r) => r.error === undefined).map((r) => r.value!);
}

/** 便捷：取出全部失败错误（按 items 顺序） */
export function poolErrors<T>(
  results: Array<PoolResult<T> & { index: number }>,
): Error[] {
  return results.filter((r) => r.error !== undefined).map((r) => r.error!);
}
