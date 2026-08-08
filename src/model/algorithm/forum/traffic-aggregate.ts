import type { ForumNode } from "../../forum/forum-node.js";
import type { TrafficInfo } from "../../traffic/traffic-info.js";

function toNumber(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * 计算 section/root 的派生流量。
 * 任一后代 board 尚未抓到流量时返回 null，避免把"不完整总量"误当成完整统计。
 *
 * 属于算法模块：只读取 ForumNode 字段做纯函数聚合，不发起请求、不落库。
 * Controller 在并发抓取叶节点后调用，结果回填到节点。
 */
export function aggregateTraffic(node: ForumNode): TrafficInfo | null {
  if (node.type === "board") return node.traffic;
  const boards = node.collectBoards("dfs");
  const records = boards.map((board) => board.traffic);
  if (records.some((traffic) => traffic === null)) return null;
  const present = records as TrafficInfo[];
  return {
    ename: node.ename ?? "",
    name: node.name,
    onlineUsers: String(present.reduce((sum, item) => sum + toNumber(item.onlineUsers), 0)),
    todayPosts: String(present.reduce((sum, item) => sum + toNumber(item.todayPosts), 0)),
    threads: String(present.reduce((sum, item) => sum + toNumber(item.threads), 0)),
    posts: String(present.reduce((sum, item) => sum + toNumber(item.posts), 0)),
  };
}

/** 后序更新整个 ForumNode 子树的派生流量。 */
export function refreshTraffic(node: ForumNode): void {
  for (const child of node.children()) refreshTraffic(child);
  if (node.type !== "board") node.updateTraffic(aggregateTraffic(node));
}
