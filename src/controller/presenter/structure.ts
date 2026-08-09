import type { ForumTreeNode } from "../../model/dto/index.js";

export function presentStructure(result: {
  kind: "children" | "tree";
  nodes: readonly ForumTreeNode[];
  cached?: boolean;
}): { text: string; data: readonly ForumTreeNode[] } {
  const source = result.kind === "tree" ? (result.cached ? "本地缓存" : "联网") : "联网展开";
  return {
    text: `来源: ${source}\n节点数: ${result.nodes.length}`,
    data: result.nodes,
  };
}
