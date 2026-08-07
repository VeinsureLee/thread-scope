import type { ForumTreeNode } from "./tree.js";

/**
 * 论坛结构树节点 — 分区/讨论区（branch）。
 *
 * type: "section" → 可包含子分区或版块
 */
export interface SectionNode {
  id: string;
  name: string;
  type: "section";
  /** 嵌套深度，1 = 一级讨论区，2 = 二级讨论区，... */
  level: number;
  children: ForumTreeNode[];
}
