import type { ForumTreeNode } from "../../../model/dto/index.js";
import { bfs, dfs } from "../common/traversal.js";

/** 节点查找索引：把多种别名（id / 去前缀 id / ename / 中文名）映射到树节点。 */
export interface ForumTreeIndex {
  /** 别名键 → 节点（board 与 section 混存）。 */
  readonly byKey: Map<string, ForumTreeNode>;
  /** 全部版块叶子，按树序。 */
  readonly boards: Extract<ForumTreeNode, { type: "board" }>[];
  /** 全部 section 分支，按树序。 */
  readonly sections: Extract<ForumTreeNode, { type: "section" }>[];
}

/** 生成候选别名键（小写化便于模糊匹配；不含空串）。 */
function aliasKeys(node: ForumTreeNode): string[] {
  const keys: string[] = [];
  const push = (key: string): void => {
    const k = key.trim().toLowerCase();
    if (k) keys.push(k);
  };
  push(node.id);
  push(node.id.replace(/[()]/g, "").replace(/^board-/, "").replace(/^sec-/, ""));
  if (node.type === "board") {
    push(node.board.ename);
    push(node.name);
  } else {
    push(node.name);
  }
  return keys;
}

/**
 * 构建论坛树查找索引（哈希化，文档 §2.1）。
 *
 * 一次遍历把所有节点按多种别名（精确 id、去前缀/括号的 clean id、版块 ename、
 * 版块中文名、分区中文名）建成 Map，替代多次全树 DFS 扫描。
 *
 * @param tree 论坛 DTO 树
 */
export function buildForumTreeIndex(tree: readonly ForumTreeNode[]): ForumTreeIndex {
  const byKey = new Map<string, ForumTreeNode>();
  const boards: Extract<ForumTreeNode, { type: "board" }>[] = [];
  const sections: Extract<ForumTreeNode, { type: "section" }>[] = [];
  for (const node of dfs(tree, { childrenOf: (n) => n.type === "section" ? n.children : [] })) {
    if (node.type === "board") boards.push(node);
    else sections.push(node);
    for (const key of aliasKeys(node)) {
      if (!byKey.has(key)) byKey.set(key, node);
    }
  }
  return { byKey, boards, sections };
}

/** 清理输入的别名键（去括号/前缀，小写化）。 */
function cleanEntry(entry: string): string {
  return entry.trim().toLowerCase().replace(/[()]/g, "").replace(/^board-/, "").replace(/^sec-/, "");
}

/**
 * 解析一批"版块 / 分区"条目为版块集合。
 *
 * 每个条目可以是：版块 ename（Demo）、分区 id（sec-0）、版块中文名、分区中文名。
 * 命中版块取自身，命中分区取其下全部后代版块；按树序去重。
 *
 * @returns 解析出的版块英文名（树序）与无法解析的条目
 */
export function resolveBoardsFromEntries(
  index: ForumTreeIndex,
  entries: readonly string[],
): { enames: string[]; unresolved: string[] } {
  const enames: string[] = [];
  const seen = new Set<string>();
  const unresolved: string[] = [];
  for (const entry of entries) {
    const node = index.byKey.get(cleanEntry(entry)) ?? index.byKey.get(entry.trim().toLowerCase());
    if (!node) {
      unresolved.push(entry.trim());
      continue;
    }
    const boards = node.type === "board"
      ? [node as Extract<ForumTreeNode, { type: "board" }>]
      : collectBoards(node.children);
    for (const board of boards) {
      if (seen.has(board.board.ename)) continue;
      seen.add(board.board.ename);
      enames.push(board.board.ename);
    }
  }
  return { enames, unresolved };
}

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
 * - 中文名等价：Section 或 Board 节点的 `name`（清理括号后）也算命中
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
      (node.type === "board" && node.board.ename === clean) ||
      node.name.replace(/[()]/g, "") === clean
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
