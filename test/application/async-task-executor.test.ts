import { describe, expect, it } from "vitest";
import { BoundedTaskExecutor } from "../../src/application/execution/async-task-executor.js";

describe("BoundedTaskExecutor", () => {
  it("限制在途任务数并按计划顺序返回", async () => {
    const executor = new BoundedTaskExecutor();
    let active = 0;
    let peak = 0;
    const result = await executor.map([1, 2, 3, 4], { concurrency: 2 }, async (value) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, value === 1 ? 8 : 1));
      active--;
      return value * 2;
    });
    expect(peak).toBeLessThanOrEqual(2);
    expect(result.map((r) => r.value)).toEqual([2, 4, 6, 8]);
  });

  it("默认隔离单项失败", async () => {
    const executor = new BoundedTaskExecutor();
    const result = await executor.map(["ok", "bad", "ok2"], { concurrency: 2 }, async (value) => {
      if (value === "bad") throw new Error("synthetic failure");
      return value;
    });
    expect(result.map((r) => r.status)).toEqual(["success", "failed", "success"]);
    expect(result[1]?.error?.message).toBe("synthetic failure");
  });
});
