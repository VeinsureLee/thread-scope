import { describe, it, expect } from "vitest";
import {
  mapWithConcurrency,
  poolValues,
  poolErrors,
  type PoolResult,
} from "../../../src/crawl/common/async-pool.js";

/** 让若干任务按指定顺序 resolve，记录并发在途峰值 */
function trackPeak<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<unknown>,
  limit: number,
): Promise<{ results: unknown[]; peak: number }> {
  let inFlight = 0;
  let peak = 0;
  const wrapper = async (item: T, index: number): Promise<unknown> => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    try {
      return await fn(item, index);
    } finally {
      inFlight--;
    }
  };
  return mapWithConcurrency(items, limit, wrapper).then((results) => ({
    results,
    peak,
  }));
}

describe("mapWithConcurrency（异步并发池）", () => {
  it("limit=1 时严格串行", async () => {
    const order: number[] = [];
    await mapWithConcurrency([1, 2, 3], 1, async (n) => {
      order.push(n);
    });
    expect(order).toEqual([1, 2, 3]);
  });

  it("并发度不超过 limit", async () => {
    const { peak } = await trackPeak(
      [1, 2, 3, 4, 5, 6],
      2,
      2,
    );
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("并发度 = min(limit, items.length)", async () => {
    const { peak } = await trackPeak(
      [1, 2, 3],
      async (n: number) => {
        await new Promise((r) => setTimeout(r, 5));
        void n;
      },
      10,
    );
    expect(peak).toBe(3);
  });

  it("结果保持 items 原始顺序（不按完成时序）", async () => {
    // 每个任务延迟与 index 反向：后一个先完成，但结果必须按原始顺序
    const results = await mapWithConcurrency([10, 20, 30], 3, async (n, i) => {
      await new Promise((r) => setTimeout(r, (3 - i) * 10));
      return n;
    });
    expect(poolValues(results)).toEqual([10, 20, 30]);
  });

  it("单项失败不 abort 整池，其余任务照常完成", async () => {
    const results = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      return n * 10;
    });
    const values = poolValues(results);
    const errors = poolErrors(results);
    expect(values).toEqual([10, 30]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe("boom");
  });

  it("全部失败时 values 为空、errors 齐全且保序", async () => {
    const results = await mapWithConcurrency([1, 2], 1, async () => {
      throw new Error("x");
    });
    expect(poolValues(results)).toEqual([]);
    expect(poolErrors(results).map((e) => e.message)).toEqual(["x", "x"]);
  });

  it("空数组立即返回空结果", async () => {
    const results = await mapWithConcurrency([], 5, async (n: number) => n);
    expect(results).toEqual([]);
  });

  it("limit<1 抛出参数错误", async () => {
    await expect(
      mapWithConcurrency([1], 0, async (n: number) => n),
    ).rejects.toThrow(/limit/);
  });

  it("错误对象跨边界保留（非 Error 被包装）", async () => {
    const results = await mapWithConcurrency([1], 1, async () => {
      throw "string error";
    });
    expect(poolErrors(results)[0]).toBeInstanceOf(Error);
  });

  it("返回值携带 index（便于保序 / 调试）", async () => {
    const results: Array<PoolResult<number> & { index: number }> =
      await mapWithConcurrency(["a", "b", "c"], 2, async (_, i) => i * 2);
    expect(results.map((r) => r.index)).toEqual([0, 1, 2]);
  });

  it("任务合法 resolve 为 undefined 不被误判为失败", async () => {
    const results = await mapWithConcurrency([1, 2], 2, async () => undefined);
    expect(poolValues(results)).toEqual([undefined, undefined]);
    expect(poolErrors(results)).toHaveLength(0);
  });
});
