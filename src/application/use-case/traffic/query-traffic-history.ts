import { TrafficDb } from "../../../storage/traffic-db.js";
import type { TrafficHistoryPoint } from "../../../models/index.js";
import type { ClosablePort, TrafficStorePort } from "../../../model/index.js";

export interface QueryTrafficHistoryOptions {
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
  readonly store?: TrafficStorePort & ClosablePort;
}

export async function queryTrafficHistory(
  boardEname: string,
  options: QueryTrafficHistoryOptions = {},
): Promise<{ boardEname: string; points: TrafficHistoryPoint[] }> {
  const db = options.store ?? new TrafficDb();
  try {
    return {
      boardEname,
      points: db.queryHistory(boardEname, options),
    };
  } finally {
    if (!options.store) db.close();
  }
}
