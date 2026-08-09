import type { ForumTreeNode } from "../../../model/dto/index.js";
import { boardEnames, buildForumTreeIndex, resolveBoardsFromEntries } from "../../../model/index.js";
import { TrafficDb } from "../../../storage/traffic-db.js";

/** 解析后的搜索范围描述。 */
export type ResolvedSearchScope =
  | { kind: "all"; label: string; enames: string[] }
  | { kind: "top"; label: string; enames: string[]; source: "traffic" | "tree" }
  | { kind: "custom"; label: string; enames: string[] };

/** 特殊字面量：全站 / 流量前 N 版。 */
export const ALL = "all";
export const TOP = "top";

/** 把 string | string[] 入参规范化为 string[]。 */
export function normalizeBoards(boards?: string | readonly string[]): string[] {
  if (boards === undefined) return [];
  return (Array.isArray(boards) ? boards : [boards]).map((b) => String(b));
}

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
 * 解析搜索范围入参（boards 数组）为版块集合。
 *
 * 语义（用户拍板）：
 * - 省略或空数组 → 全站（等效 boards:["all"]）
 * - 特殊值优先级：all > top > 自定义
 * - 其余元素：版块 ename / 分区 id / 分区中文名 / 版块中文名，经树索引解析为版块集合
 * - 无法解析的元素 → 抛错（清晰提示，不静默跳过）
 *
 * @param tree  论坛 DTO 树
 * @param boards 搜索范围入参
 * @param topCount 流量前 N 版的 N（默认 5）
 */
export function resolveSearchBoards(
  tree: ForumTreeNode[],
  boards?: string | readonly string[],
  topCount = 5,
): ResolvedSearchScope {
  const raw = normalizeBoards(boards);
  const hasSpecial = (value: string): boolean => raw.some((b) => b.trim().toLowerCase() === value);

  // 特殊值：all 优先于 top
  if (raw.length === 0 || hasSpecial(ALL)) {
    return { kind: "all", label: "全站", enames: boardEnames(tree) };
  }
  if (hasSpecial(TOP)) {
    const { enames, source } = topTrafficBoards(tree, topCount);
    return { kind: "top", label: `流量前${enames.length}版`, enames, source };
  }

  const index = buildForumTreeIndex(tree);
  const { enames, unresolved } = resolveBoardsFromEntries(index, raw);
  if (unresolved.length > 0) {
    throw new Error(
      `无法解析的版面/分区: ${unresolved.join(", ")}。可传版块英文名（如 Demo）、分区 ID（如 sec-0）、分区/版块中文名。`,
    );
  }
  return {
    kind: "custom",
    label: `指定 ${enames.length} 版: ${enames.slice(0, 5).join(", ")}${enames.length > 5 ? "…" : ""}`,
    enames,
  };
}
