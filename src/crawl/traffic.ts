import { load } from "cheerio";
import { routes, selectors, fillRoute } from "../utils/config.js";
import { ajaxGet } from "../utils/http-client.js";
import { requireLogin } from "../auth/auth.js";
import { writeJson, readJson } from "../storage/store.js";
import type { ForumTreeNode, BoardNode, TrafficInfo, TrafficSnapshot } from "../utils/types.js";
import { fetchForumTree } from "./structure.js";

// ============================================================
// 内部类型
// ============================================================

/** 带父分区引用的叶节点 */
interface LeafBoardRef {
  node: BoardNode;
  parentSectionId: string;
}

// ============================================================
// 叶节点收集
// ============================================================

/**
 * 从树中按 nodeId 查找目标节点，递归收集其下所有 BoardNode 叶子。
 *
 * 匹配策略（按优先级）：
 *   1. node.id === rawNodeId（精确匹配，如 board-IWhisper、sec-0）
 *   2. node.id === "board-{clean}" 或 "sec-{clean}"（用户省略/换用前缀）
 *   3. 叶节点 clean ename === cleanNodeId（按纯英文名匹配，如 IWhisper）
 *   4. 分区节点 clean name === cleanNodeId（按中文名匹配，如 校园生活）
 *
 * @returns 叶子列表及节点名称；若未找到则 leaves 为空
 */
function collectLeafBoards(
  tree: ForumTreeNode[],
  nodeId: string,
  parentId: string = "",
): { leaves: LeafBoardRef[]; nodeName: string } {
  /** 清理 nodeId：去括号、去 board-/sec- 前缀，得到纯英文名/sectionId/中文名 */
  const cleanNodeId = nodeId.replace(/[()]/g, "").replace(/^board-/, "").replace(/^sec-/, "");
  const boardPrefixedId = `board-${cleanNodeId}`;
  const secPrefixedId = `sec-${cleanNodeId}`;

  for (const node of tree) {
    // ── 弹性匹配 ──
    let matched = false;
    if (node.id === nodeId || node.id === boardPrefixedId || node.id === secPrefixedId || node.id === cleanNodeId) {
      matched = true;
    } else if (node.type === "board") {
      const cleanEname = (node.board.ename ?? "").replace(/[()]/g, "");
      if (cleanEname === cleanNodeId) {
        matched = true;
      }
    } else if (node.type === "section") {
      const cleanSectionName = node.name.replace(/[()]/g, "");
      if (cleanSectionName === cleanNodeId) {
        matched = true;
      }
    }

    if (matched) {
      if (node.type === "board") {
        return {
          leaves: [{ node, parentSectionId: parentId }],
          nodeName: node.name,
        };
      }
      // section → 递归收集所有叶子
      const leaves: LeafBoardRef[] = [];
      function gather(nodes: ForumTreeNode[], sectionId: string) {
        for (const child of nodes) {
          if (child.type === "board") {
            leaves.push({ node: child, parentSectionId: sectionId });
          } else {
            gather(child.children, child.id);
          }
        }
      }
      gather(node.children, nodeId);
      return { leaves, nodeName: node.name };
    }

    if (node.type === "section") {
      const result = collectLeafBoards(node.children, nodeId, node.id);
      if (result.leaves.length > 0 || result.nodeName) {
        return result;
      }
    }
  }

  return { leaves: [], nodeName: "" };
}

// ============================================================
// 流量 HTML 解析
// ============================================================

/**
 * 从 section detail HTML（带 ?count=1）中解析指定版块的流量信息。
 *
 * @param html         section detail 页面 HTML
 * @param boardEnames  需要获取流量的版块英文名集合（已清理括号）
 * @param boardNames   需要获取流量的版块中文名集合（纯中文名，如 "悄悄话"）
 * @returns 匹配到的流量信息列表
 */
export function parseSectionTraffic(
  html: string,
  boardEnames: Set<string>,
  boardNames?: Set<string>,
): TrafficInfo[] {
  const $ = load(html);
  const rows = $(selectors.board_list.row_selector).toArray();
  const result: TrafficInfo[] = [];
  const sel = selectors.board_stats;

  for (const row of rows) {
    const $tr = $(row);
    const $nameCell = $tr.find(selectors.board_list.ename).first();

    // 中文名：从 <a> 标签文本提取（如 <a href="/board/Beauty">美容护肤</a> → "美容护肤"）
    const name = $nameCell.find("a").first().text().trim();

    // 英文名：优先从 <a href="/board/Beauty"> 提取，fallback 到纯文本模式
    const href = $nameCell.find("a").first().attr("href") || "";
    const boardMatch = href.match(/\/board\/(.+)/);
    const ename = boardMatch
      ? boardMatch[1]!.trim()
      : $nameCell.text().trim().replace(name, "").trim().replace(/[()（）]/g, "");

    // 按 ename 匹配（含括号清理），若 ename 为空则回退到按中文名匹配
    const enameMatch = boardEnames.has(ename) || boardEnames.has(ename.replace(/[()]/g, ""));
    const nameMatch = boardNames ? boardNames.has(name) : false;
    if (!enameMatch && !nameMatch) continue;
    if (!name && !ename) continue;

    const todayPosts = sel.today_posts
      ? $tr.find(sel.today_posts).text().trim()
      : "";
    const threads = $tr.find(selectors.board_list.threads).text().trim();
    const posts = $tr.find(selectors.board_list.posts).text().trim();
    const onlineUsers = sel.online_users
      ? $tr.find(sel.online_users).text().trim()
      : "";

    result.push({ ename, name, onlineUsers, todayPosts, threads, posts });
  }

  return result;
}

// ============================================================
// 主入口
// ============================================================

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
