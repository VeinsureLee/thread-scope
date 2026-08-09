import type { UserRef } from "../user/user-ref.js";
import type { TrafficInfo } from "../traffic/traffic-info.js";

/**
 * ForumNode 的可序列化快照（文档 §1.7：JSON/SQLite 只保存数据，不保存类方法）。
 *
 * 由 ForumNodeMapper.toSnapshot 生成；禁止把 JSON.parse 的普通对象直接断言成
 * ForumNode 类，否则运行时没有 createSearchArticlesPlan() 等方法。
 */
export interface ForumNodeSnapshot {
  id: string;
  type: "root" | "section" | "board";
  name: string;
  ename: string | null;
  depth: number;
  managers: UserRef[];
  traffic: TrafficInfo | null;
  trafficUpdatedAt: string | null;
  parentSectionId?: string | null;
  baseUrl?: string;
  nodes?: ForumNodeSnapshot[];
}
