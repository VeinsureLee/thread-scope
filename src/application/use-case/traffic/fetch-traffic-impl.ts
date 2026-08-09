import { requireLogin } from "../../../auth/auth.js";
import { fetchForumTree } from "../../../view/structure/index.js";
import { fetchSectionTraffic } from "../../../view/traffic/index.js";
import { buildTrafficTree } from "../../../crawl/traffic/index.js";
import { enqueueTrafficWrite } from "../../../storage/traffic-queue.js";
import { defaultTaskExecutor } from "../../execution/async-task-executor.js";
import { DEFAULT_CONCURRENCY } from "../../../core/config.js";
import { forumRootFromLegacyTree } from "../../../model/index.js";
import { groupBoardsBySection } from "../../../model/index.js";
import { boardsUnderNode, findNodeById } from "../../../model/index.js";
import type { ForumTreeNode, TrafficInfo, TrafficTreeNode } from "../../../model/dto/index.js";

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

/** 收集整棵树的节点提示（用于节点不存在时报错）。 */
function collectNodeHints(nodes: ForumTreeNode[], acc: string[] = []): string[] {
  for (const n of nodes) {
    acc.push(`${n.id} (${n.name})`);
    if (n.type === "section") collectNodeHints(n.children, acc);
  }
  return acc;
}

/**
 * 流量采集应用用例（文档 §5.2.6）。
 *
 * 编排职责集中在此：加载论坛树、水合 ForumNode、用 createTrafficPlan 的
 * 版块任务语义（collectBoards + 按 ename 限定）选定目标版块、按父分区归组后
 * 经统一 Executor 并发读取各分区页面、构建树状聚合视图、后台写库。
 * View 只做单分区读取。
 *
 * 请求粒度是分区页面（一个 section 的 ?count=1 页返回其下全部版块流量），
 * 所以任务计划里每个版块对应一次分区读取——同一分区归并到一次请求，
 * 由 groupBoardsBySection 完成分组；跨分区并发由 defaultTaskExecutor 控制，
 * 共享 defaultPageFetcher 的全局限速队列。结果按原分组顺序保序聚合。
 *
 * @param nodeId 节点 ID（如 sec-0 分区 / board-JobInfo 版面 / 分区中文名）；不传则采集全站
 */
export async function fetchTrafficUseCase(
  nodeId: string | undefined,
  options: { concurrency?: number } = {},
): Promise<TrafficUseCaseResult> {
  requireLogin();
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const tree = await fetchForumTree();
  const forumRoot = forumRootFromLegacyTree(tree);

  // 目标版块：全站用整棵树的叶子；否则按 nodeId 解析节点并取该节点下全部叶子。
  // boardsUnderNode 统一处理：board 节点 → 自身 ename；section 节点 → 递归全部后代 ename。
  const boards = nodeId
    ? (() => {
        const enames = boardsUnderNode(tree, nodeId);
        if (!enames) {
          const hints = collectNodeHints(tree);
          const hint = hints.length > 0
            ? `\n可用的节点 (前30个): ${hints.slice(0, 30).join(", ")}`
            : "\n提示: 论坛树为空，请先执行 forum-init 初始化树结构";
          throw new Error(`节点不存在: ${nodeId}${hint}`);
        }
        const target = new Set(enames);
        return forumRoot.collectBoards("dfs").filter((b) => target.has(b.ename));
      })()
    : forumRoot.collectBoards("dfs");

  const errors: string[] = [];

  // 按父分区归组：每组一次分区页面请求
  const groups = groupBoardsBySection(boards);
  const groupOutcomes = await defaultTaskExecutor.map(
    groups,
    { concurrency, failureMode: "isolate" },
    async (group) => ({ group, result: await fetchSectionTraffic(group.sectionId, group.boards) }),
  );

  const records: TrafficInfo[] = [];
  for (const outcome of groupOutcomes) {
    if (outcome.status === "success" && outcome.value) {
      records.push(...outcome.value.result.records);
      if (outcome.value.result.error) errors.push(outcome.value.result.error);
    } else {
      const group = groups[outcome.index]!;
      errors.push(`分区 [${group.sectionId}] 流量获取失败: ${outcome.error?.message ?? "未知错误"}`);
    }
  }

  const crawledAt = new Date().toISOString();
  const view = buildTrafficTree(tree, toEnameMap(records));
  if (records.length > 0) enqueueTrafficWrite(records, crawledAt);

  // nodeId 已在上方解析通过（boardsUnderNode 非 null），此处只取显示名
  const nodeName = nodeId ? (findNodeById(tree, nodeId)?.name ?? nodeId) : "全部版面";
  return { crawledAt, nodeId, nodeName, records, tree: view, errors };
}
