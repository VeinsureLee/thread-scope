import type { BoardNode } from "./board.js";
import type { SectionNode } from "./section.js";

/**
 * 树中的任意节点（DTO）。
 *
 * 与领域实体 ForumNode（model/forum）区分：这是论坛结构 JSON 快照的
 * 可序列化形态，由 initStructure 产出、fetchForumTree 读取。
 */
export type ForumTreeNode = SectionNode | BoardNode;

/** 论坛结构汇总（init 产出） */
export interface ForumStructure {
  crawledAt: string;
  tree: ForumTreeNode[];
}
