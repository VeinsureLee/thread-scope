export type TaskFailureMode = "isolate" | "fail-fast";

export interface AppTaskError {
  readonly message: string;
  readonly code?: string;
}

export interface TaskOutcome<T> {
  readonly index: number;
  readonly status: "success" | "failed" | "cancelled";
  readonly value?: T;
  readonly error?: AppTaskError;
  readonly durationMs: number;
}

export interface AsyncTaskExecutor {
  map<TTask, TResult>(
    tasks: readonly TTask[],
    options: {
      readonly concurrency: number;
      readonly signal?: AbortSignal;
      readonly failureMode?: TaskFailureMode;
    },
    worker: (task: TTask, index: number) => Promise<TResult>,
  ): Promise<Array<TaskOutcome<TResult>>>;
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 全部跨资源并发任务的默认执行器。
 * 任务发现顺序由 DFS/BFS 计划提供，执行完成后仍按 index 返回。
 */
export class BoundedTaskExecutor implements AsyncTaskExecutor {
  async map<TTask, TResult>(
    tasks: readonly TTask[],
    options: {
      readonly concurrency: number;
      readonly signal?: AbortSignal;
      readonly failureMode?: TaskFailureMode;
    },
    worker: (task: TTask, index: number) => Promise<TResult>,
  ): Promise<Array<TaskOutcome<TResult>>> {
    if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
      throw new Error(`并发度必须是正整数，收到 ${options.concurrency}`);
    }

    const outcomes: Array<TaskOutcome<TResult>> = [];
    const failureMode = options.failureMode ?? "isolate";
    let cursor = 0;
    let aborted = false;
    const slots = Math.min(options.concurrency, tasks.length);

    const run = async (): Promise<void> => {
      while (true) {
        const index = cursor++;
        if (index >= tasks.length) return;
        if (aborted || options.signal?.aborted) {
          outcomes.push({ index, status: "cancelled", durationMs: 0 });
          continue;
        }

        const startedAt = Date.now();
        try {
          const value = await worker(tasks[index]!, index);
          outcomes.push({ index, status: "success", value, durationMs: Date.now() - startedAt });
        } catch (error) {
          outcomes.push({
            index,
            status: "failed",
            error: { message: asMessage(error) },
            durationMs: Date.now() - startedAt,
          });
          if (failureMode === "fail-fast") aborted = true;
        }
      }
    };

    await Promise.all(Array.from({ length: slots }, () => run()));
    return outcomes.sort((a, b) => a.index - b.index);
  }
}

export const defaultTaskExecutor: AsyncTaskExecutor = new BoundedTaskExecutor();
