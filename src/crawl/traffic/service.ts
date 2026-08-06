import { routes, fillRoute } from "../../core/config.js";
import { ajaxGet } from "../../core/http-client.js";
import { requireLogin } from "../../auth/auth.js";
import { writeJson, readJson } from "../../storage/store.js";
import { enqueueTrafficWrite } from "../../storage/traffic-queue.js";
import type { ForumTreeNode, TrafficInfo, TrafficTreeNode } from "../../models/index.js";
import { fetchForumTree } from "../structure/index.js";
import { collectLeafBoards, collectAllLeafBoards } from "./collector.js";
import type { LeafBoardRef } from "./collector.js";
import { parseSectionTraffic } from "./parser.js";
import { buildTrafficTree } from "./tree.js";

/**
 * 加载论坛树（缓存优先），无缓存则爬取并保存。
 * 论坛树是流量树的骨架，只含静态字段（name/ename/manager）。
 */
async function loadTree(): Promise<ForumTreeNode[]> {
  const cached = readJson<{ tree: ForumTreeNode[] }>("structure-overview.json");
  if (cached?.tree) return cached.tree;
  const tree = await fetchForumTree();
  writeJson("structure-overview.json", { crawledAt: new Date().toISOString(), tree });
  return tree;
}

/**
 * 获取单个分区下指定版块的流量。
 * @param errors 分区级错误收集（由调用方传入，跨调用不共享）
 */
async function fetchSectionTraffic(
  sectionId: string,
  refs: LeafBoardRef[],
  errors: string[],
): Promise<TrafficInfo[]> {
  // 统一清理括号：树中 ename 可能为 "(Advice)"，HTML 提取的是 "Advice"
  const enames = new Set(refs.map((r) => r.node.board.ename.replace(/[()]/g, "")));
  // 收集中文名，用于纯中文版面（如 "悄悄话"）的回退匹配
  const names = new Set(refs.map((r) => r.node.name));

  try {
    // ajaxGet 自动追加 _uid=xxx 参数
    const sectionPath = fillRoute(routes.section_detail, {
      sectionId: sectionId.replace(/^sec-/, ""),
    });
    const path = `${sectionPath}?count=1`;
    const html = await ajaxGet(path);
    const parsed = parseSectionTraffic(html, enames, names);

    // 补充未匹配到的版面（可能 HTML 行数不足）
    const matched = new Set([
      ...parsed.map((p) => p.ename.replace(/[()]/g, "")),
      ...parsed.map((p) => p.name),
    ]);
    for (const ref of refs) {
      const cleanEname = ref.node.board.ename.replace(/[()]/g, "");
      if (!matched.has(cleanEname) && !matched.has(ref.node.name)) {
        parsed.push({
          ename: ref.node.board.ename,
          name: ref.node.name,
          onlineUsers: "",
          todayPosts: "",
          threads: "",
          posts: "",
        });
      }
    }
    return parsed;
  } catch (err) {
    const msg = `分区 [${sectionId}] 流量获取失败: ${String(err)}`;
    errors.push(msg);
    return refs.map((ref) => ({
      ename: ref.node.board.ename,
      name: ref.node.name,
      onlineUsers: "",
      todayPosts: "",
      threads: "",
      posts: "",
    }));
  }
}

/** 按父分区对叶子分组，批量请求并解析各分区流量 */
async function fetchTrafficBySections(
  leaves: LeafBoardRef[],
  errors: string[],
): Promise<TrafficInfo[]> {
  const bySection = new Map<string, LeafBoardRef[]>();
  for (const leaf of leaves) {
    const list = bySection.get(leaf.parentSectionId);
    if (list) list.push(leaf);
    else bySection.set(leaf.parentSectionId, [leaf]);
  }

  const allRecords: TrafficInfo[] = [];
  for (const [sectionId, refs] of bySection) {
    allRecords.push(...(await fetchSectionTraffic(sectionId, refs, errors)));
  }
  return allRecords;
}

/** 由 records 构建 ename → TrafficInfo 映射（清理括号） */
function toEnameMap(records: TrafficInfo[]): Map<string, TrafficInfo> {
  const map = new Map<string, TrafficInfo>();
  for (const rec of records) {
    const key = rec.ename.replace(/[()]/g, "");
    map.set(key, rec);
  }
  return map;
}

/**
 * 全量获取整个论坛所有版面的流量信息。
 *
 * 生命周期：
 * 1. 加载论坛树（缓存优先）
 * 2. 收集所有版块叶子，按父分区批量爬取流量
 * 3. 构建树状视图并返回（不等待 DB 写入）
 * 4. 后台队列异步将本次采样写入数据库（供历史查询）
 *
 * @returns 树状流量视图（含聚合统计）
 */
export async function fetchAllTraffic(): Promise<{
  crawledAt: string;
  nodeName: string;
  records: TrafficInfo[];
  tree: TrafficTreeNode[];
  errors: string[];
}> {
  requireLogin();

  const tree = await loadTree();
  const leaves = collectAllLeafBoards(tree);
  const errors: string[] = [];
  const records = await fetchTrafficBySections(leaves, errors);
  const crawledAt = new Date().toISOString();

  // 返回树状视图（派生，纯函数）
  const view = buildTrafficTree(tree, toEnameMap(records));

  // 异步写库（fire-and-forget，不阻塞返回）
  enqueueTrafficWrite(records, crawledAt);

  return { crawledAt, nodeName: "全部版面", records, tree: view, errors };
}

/**
 * 获取指定节点（版面或分区）的流量信息。
 *
 * 只爬取目标节点下的版面，构建树状视图返回；
 * 本次采样通过后台队列写入数据库，作为该版面新的历史记录。
 *
 * @param nodeId 节点 ID，如 "sec-0"（分区）或 "board-JobInfo"（版面）
 */
export async function fetchTraffic(nodeId: string): Promise<{
  crawledAt: string;
  nodeId: string;
  nodeName: string;
  records: TrafficInfo[];
  tree: TrafficTreeNode[];
  errors: string[];
}> {
  requireLogin();

  const tree = await loadTree();
  const { leaves, nodeName } = collectLeafBoards(tree, nodeId);

  if (leaves.length === 0 && !nodeName) {
    const available: string[] = [];
    function collectNodeIds(nodes: ForumTreeNode[]) {
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
    ? await fetchTrafficBySections(leaves, errors)
    : [];

  // 构建整棵树视图：目标节点下的版面用本次结果，其余版面无数据（null）
  const view = buildTrafficTree(tree, toEnameMap(records));
  const crawledAt = new Date().toISOString();

  // 异步写库
  if (records.length > 0) enqueueTrafficWrite(records, crawledAt);

  return { crawledAt, nodeId, nodeName, records, tree: view, errors };
}
