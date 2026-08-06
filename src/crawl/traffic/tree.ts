import type { ForumTreeNode, TrafficInfo, TrafficTreeNode } from "../../models/index.js";

/**
 * 从 structure 树 + 流量记录派生树状流量视图。
 *
 * 设计：
 * - board 节点：traffic = 对应版块流量（未爬取 → null）
 * - section 节点：traffic = 其下全部后代 board 的聚合
 *   - 任一后代 board 未统计（null）→ section 为 null（"全齐才统计"）
 *   - 全部有值 → 逐字段求和
 *
 * 纯函数：每次从 flat records 重建整棵树，O(n)。
 * 由于是派生视图，无需维护"叶更新→祖先重算"的状态一致性。
 *
 * @param tree     structure 树
 * @param byEname  ename（已清理括号）→ TrafficInfo 的映射
 */
export function buildTrafficTree(
  tree: ForumTreeNode[],
  byEname: Map<string, TrafficInfo>,
): TrafficTreeNode[] {
  return tree.map((node) => {
    if (node.type === "board") {
      const key = cleanEname(node.board.ename);
      return {
        id: node.id,
        name: node.name,
        type: "board" as const,
        level: node.level,
        traffic: byEname.get(key) ?? null,
      };
    }

    // section：先递归构建子树，再聚合
    const children = buildTrafficTree(node.children, byEname);
    return {
      id: node.id,
      name: node.name,
      type: "section" as const,
      level: node.level,
      traffic: aggregateSection(children),
      children,
    };
  });
}

/**
 * 聚合 section 下所有后代 board 的流量。
 * 任一为 null → null；全部有值 → 逐字段求和。
 */
function aggregateSection(children: TrafficTreeNode[]): TrafficInfo | null {
  let onlineUsers = 0;
  let todayPosts = 0;
  let threads = 0;
  let posts = 0;
  let allPresent = true;

  function collect(nodes: TrafficTreeNode[]): void {
    for (const node of nodes) {
      if (node.type === "board") {
        const t = node.traffic;
        if (!t) {
          allPresent = false;
          return;
        }
        onlineUsers += toNum(t.onlineUsers);
        todayPosts += toNum(t.todayPosts);
        threads += toNum(t.threads);
        posts += toNum(t.posts);
      } else {
        collect(node.children ?? []);
      }
    }
  }

  collect(children);

  if (!allPresent) return null;
  return {
    ename: "",
    name: "",
    onlineUsers: String(onlineUsers),
    todayPosts: String(todayPosts),
    threads: String(threads),
    posts: String(posts),
  };
}

/** 清理括号的 ename */
function cleanEname(ename: string): string {
  return ename.replace(/[()]/g, "");
}

/** 字符串数字 → number（空串/非法 → 0） */
function toNum(s: string): number {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}
