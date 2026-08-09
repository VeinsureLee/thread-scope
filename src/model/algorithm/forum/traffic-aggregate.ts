import type { ForumNode } from "../../forum/forum-node.js";
import type { BoardNode } from "../../forum/board-node.js";
import type { TrafficInfo } from "../../traffic/traffic-info.js";

/** 同一父分区下的版块叶子组。 */
export interface SectionBoardGroup {
  readonly sectionId: string;
  readonly boards: BoardNode[];
}

function toNumber(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * 按直接父分区（立即祖先）把版块叶子分组。
 *
 * 流量采集的请求粒度是分区页面（一个 section 的 ?count=1 页返回其下全部版块流量），
 * 所以跨版并发前先按父分区归组，每组一次分区请求。parentSectionId 取叶节点的
 * 直接父 section（与旧的 LeafBoardRef 语义一致：zone-beta 下的 b4/b5 归 sub-gamma，
 * 而不是归 zone-beta）。
 *
 * 纯函数算法（文档 §2.1）：只读取 BoardNode 字段，不发请求、不落库。
 *
 * @param boards 目标版块叶子（可来自 createTrafficPlan 或自定义 boardEnames）
 * @returns 按叶子在输入中的出现顺序排列的「分区 → 版块组」列表
 */
export function groupBoardsBySection(boards: readonly BoardNode[]): SectionBoardGroup[] {
  const groups: SectionBoardGroup[] = [];
  const index = new Map<string, SectionBoardGroup>();
  for (const board of boards) {
    const sectionId = board.parentSectionId ?? "";
    let group = index.get(sectionId);
    if (!group) {
      group = { sectionId, boards: [] };
      index.set(sectionId, group);
      groups.push(group);
    }
    group.boards.push(board);
  }
  return groups;
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
