import type { ForumTreeNode } from "../../../models/index.js";
import { bfs, dfs } from "../common/traversal.js";

/**
 * Forum DTO 树的遍历/查询算法（文档 §2.1 tree-index.ts）。
 *
 * 论坛树是静态骨架（section 分支 / board 叶子），本模块集中所有对树结构的
 * 遍历/查询，供 init / search / 用户定位复用，避免各 crawl 模块各自手写递归。
 *
 * 两种遍历：
 * - collectBoards：广度优先（BFS，队列）——"取全部版块"类任务，无递归深度风险；
 * - findNodeById：深度优先（DFS，栈）——"按节点 ID 定位单个节点"类任务，
 *   需要精确层级语义（board/section 消歧），命中即停。
 *
 * 算法只处理 DTO 数据，不发 HTTP、不读数据库（文档 §2.1 边界）。
 */

/**
 * 从树中收集全部版块叶子节点（BFS，迭代队列，无递归深度限制）。
 *
 * @returns 全部 Board 节点（树序遍历顺序）
 */
export function collectBoards(tree: ForumTreeNode[]): Extract<ForumTreeNode, { type: "board" }>[] {
  return bfs(tree, {
    childrenOf: (node) => node.type === "section" ? node.children : [],
  }).filter((node): node is Extract<ForumTreeNode, { type: "board" }> => node.type === "board");
}

/** 全部版块英文名（BFS） */
export function boardEnames(tree: ForumTreeNode[]): string[] {
  return collectBoards(tree).map((n) => n.board.ename);
}

/** 全部版主 uid（去重，BFS） */
export function boardManagers(tree: ForumTreeNode[]): string[] {
  const seen = new Set<string>();
  for (const node of collectBoards(tree)) {
    for (const m of node.board.manager) {
      if (m.trim()) seen.add(m.trim());
    }
  }
  return [...seen];
}

/**
 * 按节点 ID 定位单个节点（DFS，迭代栈，命中即停）。
 *
 * ID 匹配（消除 board-/sec- 前缀歧义）：
 * - 精确 ID：`board-Demo` / `sec-0`
 * - 去前缀：`Demo`（→ board-Demo 或 sec-Demo）
 * - 版块英文名等价：Board 节点的 `board.ename` 也算命中
 *
 * @returns 匹配节点；未找到返回 null
 */
export function findNodeById(
  tree: ForumTreeNode[],
  nodeId: string,
): ForumTreeNode | null {
  const clean = nodeId.replace(/[()]/g, "").replace(/^board-/, "").replace(/^sec-/, "");
  const nodes = dfs(tree, {
    childrenOf: (node) => node.type === "section" ? node.children : [],
  });
  for (const node of nodes) {
    if (
      node.id === nodeId ||
      node.id === clean ||
      node.id === `board-${clean}` ||
      node.id === `sec-${clean}` ||
      (node.type === "board" && node.board.ename === clean)
    ) {
      return node;
    }
  }
  return null;
}

/**
 * 按节点 ID 取该节点下的全部版块英文名（分区递归；版块节点则返回自身）。
 * 基于 findNodeById（DFS 定位），命中后 BFS 收集。未找到返回 null。
 *
 * @returns 版块英文名列表；节点不存在返回 null
 */
export function boardsUnderNode(
  tree: ForumTreeNode[],
  nodeId: string,
): string[] | null {
  const node = findNodeById(tree, nodeId);
  if (!node) return null;
  if (node.type === "board") return [node.board.ename];
  return collectBoards(node.children).map((n) => n.board.ename);
}
