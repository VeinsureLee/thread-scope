import { ForumNode, type ForumNodeOptions } from "./forum-node.js";

/** 讨论区/子讨论区节点：可包含子节点，是 Forum 树的分支。 */
export class SectionNode extends ForumNode {
  readonly type = "section" as const;
  readonly nodes: ForumNode[];

  constructor(options: ForumNodeOptions & { nodes?: readonly ForumNode[] }) {
    super("section", options);
    this.nodes = [...(options.nodes ?? [])];
    this.refreshDerivedState();
  }

  children(): readonly ForumNode[] {
    return this.nodes;
  }
}
