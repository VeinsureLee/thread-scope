import type { BoardNode } from "./board.js";
import type { SectionNode } from "./section.js";

/**
 * 树中的任意节点。
 *
 * 节点类型：
 *   type: "section" → 分区/讨论区（branch），可包含子分区或版块
 *   type: "board"   → 版面（leaf），包含版面详情
 *
 * section 的 level 表示嵌套深度：
 *   level 1 → 一级讨论区（根分组下）
 *   level 2 → 二级讨论区
 *   level N → N 级讨论区
 */
export type ForumTreeNode = SectionNode | BoardNode;

/** 论坛结构汇总（init 产出） */
export interface ForumStructure {
  crawledAt: string;
  tree: ForumTreeNode[];
}
