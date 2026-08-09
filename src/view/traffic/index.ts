import * as trafficCrawl from "../../crawl/traffic/index.js";
import type { BoardNode } from "../../model/index.js";
import type { TrafficViewPort } from "../../model/index.js";

/**
 * Traffic View：只读取单个分区流量页面（文档 §4.8）。
 *
 * 跨 section 并发、树加载、聚合和落库由 Application UseCase 编排；
 * View 只负责单资源读取与解析。
 */
export function fetchSectionTraffic(
  sectionId: string,
  boards: readonly BoardNode[],
): ReturnType<typeof trafficCrawl.fetchSectionTraffic> {
  return trafficCrawl.fetchSectionTraffic(sectionId, boards);
}

export const trafficView: TrafficViewPort = { fetchSectionTraffic };
