import type { ForumTreeNode, BoardNode } from "../../models/index.js";

/** 带父分区引用的叶节点 */
export interface LeafBoardRef {
  node: BoardNode;
  parentSectionId: string;
}

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
export function collectLeafBoards(
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
