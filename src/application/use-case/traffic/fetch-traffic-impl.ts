import { requireLogin } from "../../../auth/auth.js";
import { fetchForumTree } from "../../../view/structure/index.js";
import { fetchSectionTraffic } from "../../../view/traffic/index.js";
import { collectLeafBoards, collectAllLeafBoards, type LeafBoardRef } from "../../../crawl/traffic/index.js";
import { buildTrafficTree } from "../../../crawl/traffic/index.js";
import { enqueueTrafficWrite } from "../../../storage/traffic-queue.js";
import { defaultTaskExecutor } from "../../execution/async-task-executor.js";
import { DEFAULT_CONCURRENCY } from "../../../core/config.js";
import type { ForumTreeNode, TrafficInfo, TrafficTreeNode } from "../../../models/index.js";

export interface TrafficUseCaseResult {
  readonly crawledAt: string;
  readonly nodeId?: string;
  readonly nodeName: string;
  readonly records: readonly TrafficInfo[];
  readonly tree: readonly TrafficTreeNode[];
  readonly errors: readonly string[];
}

/** 由 records 构建 ename → TrafficInfo 映射（清理括号）。 */
function toEnameMap(records: TrafficInfo[]): Map<string, TrafficInfo> {
  const map = new Map<string, TrafficInfo>();
  for (const rec of records) {
    const key = rec.ename.replace(/[()]/g, "");
    map.set(key, rec);
  }
  return map;
}

/**
 * 按父分区对叶子分组，经统一执行器并发读取各分区流量（文档 §4.8/§5.2.6）。
 *
 * 跨 section 并发是 Controller/Application 的策略：由 defaultTaskExecutor 控制，
 * 共享 defaultPageFetcher 的全局限速队列；结果按原分组顺序保序聚合。
 */
async function fetchTrafficBySections(
  leaves: LeafBoardRef[],
  errors: string[],
  concurrency: number,
): Promise<TrafficInfo[]> {
  const bySection = new Map<string, LeafBoardRef[]>();
  for (const leaf of leaves) {
    const list = bySection.get(leaf.parentSectionId);
    if (list) list.push(leaf);
    else bySection.set(leaf.parentSectionId, [leaf]);
  }
  const sectionGroups = [...bySection.entries()];
  const outcomes = await defaultTaskExecutor.map(
    sectionGroups,
    { concurrency, failureMode: "isolate" },
    async ([sectionId, refs]) => fetchSectionTraffic(sectionId, refs, errors),
  );
  return outcomes
    .filter((outcome) => outcome.status === "success" && outcome.value !== undefined)
    .flatMap((outcome) => outcome.value!);
}

/**
 * 流量采集应用用例（文档 §5.2.6）。
 *
 * 编排职责集中在此：加载论坛树、收集目标叶子、跨 section 并发采集、
 * 构建树状聚合视图、后台写库。View 只做单资源读取。
 *
 * @param nodeId 节点 ID（如 sec-0 分区 / board-JobInfo 版面）；不传则采集全站
 */
export async function fetchTrafficUseCase(
  nodeId: string | undefined,
  options: { concurrency?: number } = {},
): Promise<TrafficUseCaseResult> {
  requireLogin();
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const tree = await fetchForumTree();

  if (!nodeId) {
    const leaves = collectAllLeafBoards(tree);
    const errors: string[] = [];
    const records = await fetchTrafficBySections(leaves, errors, concurrency);
    const crawledAt = new Date().toISOString();
    const view = buildTrafficTree(tree, toEnameMap(records));
    enqueueTrafficWrite(records, crawledAt);
    return { crawledAt, nodeName: "全部版面", records, tree: view, errors };
  }

  const { leaves, nodeName } = collectLeafBoards(tree, nodeId);
  if (leaves.length === 0 && !nodeName) {
    const available: string[] = [];
    function collectNodeIds(nodes: ForumTreeNode[]): void {
      for (const n of nodes) {
        available.push(`${n.id} (${n.name})`);
        if (n.type === "section") collectNodeIds(n.children);
      }
    }
    collectNodeIds(tree);
    const hint = available.length > 0
      ? `\n可用的节点 (前30个): ${available.slice(0, 30).join(", ")}`
      : "\n提示: 论坛树为空，请先执行 forum-init 初始化树结构";
    throw new Error(`节点不存在: ${nodeId}${hint}`);
  }

  const errors: string[] = [];
  const records = leaves.length > 0
    ? await fetchTrafficBySections(leaves, errors, concurrency)
    : [];
  const view = buildTrafficTree(tree, toEnameMap(records));
  const crawledAt = new Date().toISOString();
  if (records.length > 0) enqueueTrafficWrite(records, crawledAt);
  return { crawledAt, nodeId, nodeName, records, tree: view, errors };
}
