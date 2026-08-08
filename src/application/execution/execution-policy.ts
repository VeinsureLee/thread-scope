import { DEFAULT_CONCURRENCY, MAX_CONCURRENCY } from "../../core/config.js";

export interface ExecutionPolicy {
  readonly boardFetch: number;
  readonly boardSearch: number;
  readonly threadFetch: number;
  readonly userFetch: number;
}

export const DEFAULT_EXECUTION_POLICY: ExecutionPolicy = {
  boardFetch: DEFAULT_CONCURRENCY,
  boardSearch: DEFAULT_CONCURRENCY,
  threadFetch: DEFAULT_CONCURRENCY,
  userFetch: DEFAULT_CONCURRENCY,
};

/** 工具层可传单一并发度；UseCase 将它映射到各类任务并限制上限。 */
export function executionPolicyFromConcurrency(concurrency?: number): ExecutionPolicy {
  const value = concurrency ?? DEFAULT_CONCURRENCY;
  if (!Number.isInteger(value) || value < 1 || value > MAX_CONCURRENCY) {
    throw new Error(`并发度必须在 1-${MAX_CONCURRENCY} 之间，收到 ${value}`);
  }
  return {
    boardFetch: value,
    boardSearch: value,
    threadFetch: value,
    userFetch: value,
  };
}
