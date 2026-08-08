import { ForumNode, type ForumNodeOptions } from "./forum-node.js";

/** 版面节点：Forum 树叶节点，可关联多个 Thread。ename 必须有真实值。 */
export class BoardNode extends ForumNode {
  readonly type = "board" as const;
  declare ename: string;

  constructor(options: ForumNodeOptions & { ename: string }) {
    super("board", options);
    this.ename = options.ename;
  }

  children(): readonly ForumNode[] {
    return [];
  }
}
