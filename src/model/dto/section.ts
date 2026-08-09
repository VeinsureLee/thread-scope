import type { ForumTreeNode } from "./tree.js";

/**
 * 讨论区/分区节点（DTO）。
 *
 * 与领域实体 SectionNode（model/forum）区分：这是结构 JSON 快照的可序列化形态。
 */
export interface SectionNode {
  id: string;
  name: string;
  type: "section";
  /** 嵌套深度，1 = 一级讨论区，2 = 二级讨论区，... */
  level: number;
  children: ForumTreeNode[];
}
