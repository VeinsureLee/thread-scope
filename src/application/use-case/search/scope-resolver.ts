import type { ForumTreeNode } from "../../../models/index.js";
import { boardEnames, boardsUnderNode } from "../../../model/index.js";
import { TrafficDb } from "../../../storage/traffic-db.js";

/** 搜索范围描述（快照记录 / 工具输出用） */
export type SearchScope =
  | { kind: "board"; boardEname: string; boards: string[]; label: string }
  | { kind: "top"; boardEname: null; boards: string[]; label: string; source: "traffic" | "tree" }
  | { kind: "section"; boardEname: null; boards: string[]; label: string }
  | { kind: "all"; boardEname: null; boards: string[]; label: string };

/**
 * 流量最高的前 N 个版块英文名。
 * 数据来自 traffic_snapshot 表每版面最新一行；无流量数据时回退到结构树前 N 个。
 */
function topTrafficBoards(tree: ForumTreeNode[], n: number): { enames: string[]; source: "traffic" | "tree" } {
  try {
    const db = new TrafficDb();
    try {
      const latest = db.getLatestAll();
      if (latest.length > 0) {
        const sorted = [...latest].sort(
          (a, b) =>
            parseInt(b.onlineUsers, 10) - parseInt(a.onlineUsers, 10) ||
            parseInt(b.todayPosts, 10) - parseInt(a.todayPosts, 10),
        );
        const enames = sorted.slice(0, n).map((t) => t.ename).filter(Boolean);
        if (enames.length > 0) return { enames, source: "traffic" };
      }
    } finally {
      db.close();
    }
  } catch {
    // 流量库缺失/损坏 → 回退结构树
  }
  return { enames: boardEnames(tree).slice(0, n), source: "tree" };
}

/**
 * 解析搜索范围（显式 scope 语义）。范围解析是 Application 用例流程的一部分（文档 §5.2.4）。
 *
 * scope（架构优化定稿，消除「不传 boardName + 传 maxBoards = 全站」的隐晦）：
 *   - "all"     → 全站全部版面（约 3 分钟）；maxBoards 可选限制最多搜 N 版
 *   - "top"     → 流量最高前 topCount 个版面（默认 5，快）
 *   - "board"   → 单版面（nodeId 为版块英文名）
 *   - "section" → 递归该分区下所有版面（nodeId 为分区节点 ID）
 *   - "auto"    → 按 nodeId/maxBoards 推断（兼容旧调用；nodeId → board/section，maxBoards → all，否则 top）
 */
export function resolveScope(
  scope: "all" | "top" | "board" | "section" | "auto" | undefined,
  nodeId: string | undefined,
  tree: ForumTreeNode[],
  topCount: number,
  maxBoards: number | undefined,
): SearchScope {
  // 显式单版面
  if (scope === "board") {
    if (!nodeId) throw new Error("scope=board 时必须传 boardName（版块英文名）");
    const matched = boardsUnderNode(tree, nodeId);
    if (!matched || matched.length === 0) {
      throw new Error(`节点不存在: ${nodeId}。可传版块英文名（如 Demo）或分区节点 ID（如 sec-0）。`);
    }
    if (matched.length > 1) {
      throw new Error(`节点 ${nodeId} 是分区，不是单个版块。scope=board 需单版面；要搜整个分区请用 scope=section。`);
    }
    return {
      kind: "board" as const,
      boardEname: matched[0]!,
      boards: matched,
      label: matched[0]!,
    };
  }

  // 显式分区递归
  if (scope === "section") {
    if (!nodeId) throw new Error("scope=section 时必须传 boardName（分区节点 ID）");
    const matched = boardsUnderNode(tree, nodeId);
    if (!matched || matched.length === 0) {
      throw new Error(`节点不存在: ${nodeId}。可传分区节点 ID（如 sec-0）或版块英文名。`);
    }
    return {
      kind: "section" as const,
      boardEname: null,
      boards: matched,
      label: nodeId,
    };
  }

  // 显式全站
  if (scope === "all") {
    const all = boardEnames(tree);
    return {
      kind: "all" as const,
      boardEname: null,
      boards: maxBoards !== undefined && maxBoards < all.length ? all.slice(0, maxBoards) : all,
      label: maxBoards !== undefined && maxBoards < all.length ? `全站前${maxBoards}版` : "全站",
    };
  }

  // 显式流量前 N
  if (scope === "top") {
    const { enames, source } = topTrafficBoards(tree, topCount);
    return {
      kind: "top" as const,
      boardEname: null,
      boards: enames,
      label: `流量前${enames.length}版`,
      source,
    };
  }

  // auto：按 nodeId / maxBoards 推断（兼容旧调用）
  if (nodeId) {
    const matched = boardsUnderNode(tree, nodeId);
    if (matched) {
      if (matched.length === 1) {
        return {
          kind: "board" as const,
          boardEname: matched[0]!,
          boards: matched,
          label: matched[0]!,
        };
      }
      return {
        kind: "section" as const,
        boardEname: null,
        boards: matched,
        label: nodeId,
      };
    }
    throw new Error(
      `节点不存在: ${nodeId}。可传版块英文名（如 Demo）或分区节点 ID（如 sec-0）。`,
    );
  }

  if (maxBoards !== undefined) {
    const all = boardEnames(tree);
    return {
      kind: "all" as const,
      boardEname: null,
      boards: maxBoards >= all.length ? all : all.slice(0, maxBoards),
      label: maxBoards >= all.length ? "全站" : `全站前${maxBoards}版`,
    };
  }

  // 默认：流量最高的前 topCount 个版面（数据不足时回退）
  const { enames, source } = topTrafficBoards(tree, topCount);
  return {
    kind: "top" as const,
    boardEname: null,
    boards: enames,
    label: `流量前${enames.length}版`,
    source,
  };
}
