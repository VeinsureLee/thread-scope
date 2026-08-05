import { routes, fillRoute } from "../../core/config.js";
import { ajaxGet } from "../../core/http-client.js";
import { requireLogin } from "../../auth/auth.js";
import { writeJson, readJson } from "../../storage/store.js";
import type { ForumTreeNode, TrafficInfo, TrafficSnapshot } from "../../models/index.js";
import { fetchForumTree } from "../structure/index.js";
import { collectLeafBoards } from "./collector.js";
import type { LeafBoardRef } from "./collector.js";
import { parseSectionTraffic } from "./parser.js";

/**
 * 获取指定节点（版面或分区）的流量信息。
 *
 * 流程：
 * 1. 加载论坛树（缓存优先）
 * 2. 收集目标节点下所有叶节点
 * 3. 按父分区去重，批量请求 section detail 页面
 * 4. 解析流量字段，汇总返回
 *
 * 结果同时保存到 data/traffic-snapshot.json。
 *
 * @param nodeId 节点 ID，如 "sec-0"（分区）或 "board-JobInfo"（版面）
 */
export async function fetchTraffic(nodeId: string): Promise<TrafficSnapshot> {
  requireLogin();

  // ── 1. 加载树 ──
  let tree: ForumTreeNode[];
  const cached = readJson<{ tree: ForumTreeNode[] }>("forum-structure.json");
  if (cached?.tree) {
    tree = cached.tree;
  } else {
    tree = await fetchForumTree();
    writeJson("forum-structure.json", { crawledAt: new Date().toISOString(), tree });
  }

  // ── 2. 收集叶节点 ──
  const { leaves, nodeName } = collectLeafBoards(tree, nodeId);

  if (leaves.length === 0 && !nodeName) {
    // 收集可用节点信息，帮助用户定位
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

  if (leaves.length === 0) {
    // section 下无版面（空分区）
    const snapshot: TrafficSnapshot = {
      crawledAt: new Date().toISOString(),
      nodeId,
      nodeName,
      records: [],
      errors: [],
    };
    writeJson("traffic-snapshot.json", snapshot);
    return snapshot;
  }

  // ── 3. 按父分区分组 ──
  const bySection = new Map<string, LeafBoardRef[]>();
  for (const leaf of leaves) {
    const list = bySection.get(leaf.parentSectionId);
    if (list) {
      list.push(leaf);
    } else {
      bySection.set(leaf.parentSectionId, [leaf]);
    }
  }

  // ── 4. 批量请求并解析 ──
  const allRecords: TrafficInfo[] = [];
  const errors: string[] = [];

  for (const [sectionId, refs] of bySection) {
    // 统一清理括号：树中 ename 可能为 "(Advice)"，HTML 提取的是 "Advice"
    const enames = new Set(
      refs.map((r) => r.node.board.ename.replace(/[()]/g, "")),
    );
    // 收集中文名，用于纯中文版面（如 "悄悄话"）的回退匹配
    const names = new Set(
      refs.map((r) => r.node.name),
    );

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
            threads: ref.node.board.threads,
            posts: ref.node.board.posts,
          });
        }
      }

      allRecords.push(...parsed);
    } catch (err) {
      const msg = `分区 [${sectionId}] 流量获取失败: ${String(err)}`;
      errors.push(msg);

      // 降级：使用树中缓存的静态数据
      for (const ref of refs) {
        allRecords.push({
          ename: ref.node.board.ename,
          name: ref.node.name,
          onlineUsers: "",
          todayPosts: "",
          threads: ref.node.board.threads,
          posts: ref.node.board.posts,
        });
      }
    }
  }

  // ── 5. 保存并返回 ──
  const snapshot: TrafficSnapshot = {
    crawledAt: new Date().toISOString(),
    nodeId,
    nodeName,
    records: allRecords,
    errors,
  };
  writeJson("traffic-snapshot.json", snapshot);

  return snapshot;
}
