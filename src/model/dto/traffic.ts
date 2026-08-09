import type { TrafficInfo } from "../traffic/traffic-info.js";

/** 流量快照（保存到文件及 MCP 工具返回） */
export interface TrafficSnapshot {
  crawledAt: string;
  nodeId: string;
  nodeName: string;
  records: TrafficInfo[];
  errors: string[];
}

/**
 * 树状流量节点（对齐 ForumTreeNode 的结构，DTO）。
 *
 * - board：traffic 为自身实时流量
 * - section：traffic 为其下全部后代 board 的聚合
 * - traffic === null 表示未统计（board 未爬取 / section 有后代未统计）
 */
export interface TrafficTreeNode {
  id: string;
  name: string;
  type: "section" | "board";
  level: number;
  /** 流量统计；null = 未统计 */
  traffic: TrafficInfo | null;
  /** 仅 section 节点有 */
  children?: TrafficTreeNode[];
}

/** 单版面历史流量查询结果 */
export interface TrafficHistoryPoint {
  crawledAt: string;
  onlineUsers: number;
  todayPosts: number;
  threads: number;
  posts: number;
}
