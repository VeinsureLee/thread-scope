import { ForumNode, type ForumNodeOptions } from "./forum-node.js";

/** 讨论区/子讨论区节点：可包含子节点，是 Forum 树的分支。 */
export class SectionNode extends ForumNode {
  readonly type = "section" as const;
  readonly nodes: ForumNode[];

  constructor(options: ForumNodeOptions & { nodes?: readonly ForumNode[] }) {
    super("section", options);
    this.nodes = [...(options.nodes ?? [])];
    // 为直接子版块补充 parentSectionId（立即祖先语义）：直接叶子归本分区。
    // 嵌套 section 的叶子在更内层的 SectionNode 构造时由各自的父 section 归组。
    for (const child of this.nodes) {
      if (child.type === "board") child.assignParentSectionId(this.id);
    }
    this.refreshDerivedState();
  }

  children(): readonly ForumNode[] {
    return this.nodes;
  }
}
