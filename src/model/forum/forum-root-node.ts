import { ForumNode, type ForumNodeOptions } from "./forum-node.js";

/** Forum 树逻辑根节点：保存站点标识和入口信息，children 返回顶层 section/board。 */
export class ForumRootNode extends ForumNode {
  readonly type = "root" as const;
  readonly baseUrl: string;
  readonly nodes: ForumNode[];

  constructor(options: ForumNodeOptions & { baseUrl?: string; nodes?: readonly ForumNode[] }) {
    super("root", options);
    this.baseUrl = options.baseUrl ?? "";
    this.nodes = [...(options.nodes ?? [])];
    this.refreshDerivedState();
  }

  children(): readonly ForumNode[] {
    return this.nodes;
  }
}
