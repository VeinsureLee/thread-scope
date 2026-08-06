import type { TrafficInfo } from "../models/index.js";
import { TrafficDb } from "./traffic-db.js";

/**
 * 后台任务队列：将写库等副作用任务排队异步执行，不阻塞 MCP 工具返回。
 *
 * 生命周期：
 * - enqueue 将任务入队（fire-and-forget）
 * - 队列在空闲时 drain（进程事件循环空闲）
 * - 进程退出前 flush 剩余任务（保证不丢）
 * - 任务失败记录到 onError 回调，不影响调用方
 */
export class TaskQueue {
  private queue: (() => void)[] = [];
  private draining = false;

  constructor(private onError: (err: unknown) => void = console.error) {}

  /** 入队一个任务（同步副作用，如 DB insert） */
  enqueue(task: () => void): void {
    this.queue.push(task);
    this.scheduleDrain();
  }

  /** 请求事件循环空闲时 drain */
  private scheduleDrain(): void {
    if (this.draining) return;
    this.draining = true;
    setImmediate(() => {
      this.draining = false;
      this.drain();
    });
  }

  /** 执行队列中所有任务（同步）；失败交给 onError，不中断其余 */
  drain(): void {
    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      try {
        task();
      } catch (err) {
        this.onError(err);
      }
    }
  }

  /** 剩余任务数（调试用） */
  get pending(): number {
    return this.queue.length;
  }

  /** 进程退出前同步 flush（保证写库不丢） */
  flush(): void {
    this.drain();
  }
}

/** 全局唯一的写库队列 */
export const trafficQueue = new TaskQueue((err) => {
  console.error("[traffic-queue] 写库任务失败:", err);
});

/** 便捷：将一批流量采样入队写库 */
export function enqueueTrafficWrite(
  records: TrafficInfo[],
  crawledAt: string,
): void {
  trafficQueue.enqueue(() => {
    const db = new TrafficDb();
    try {
      db.insertBatch(records, crawledAt);
    } finally {
      db.close();
    }
  });
}

/** 进程退出前 flush 所有待写任务（在 index.ts 退出钩子调用） */
export function flushTrafficWrites(): void {
  trafficQueue.flush();
}
