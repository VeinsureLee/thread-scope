/** 论坛树状结构共享类型定义 */

/** 分区（section），论坛的顶级或子级分类 */
export interface Section {
  /** 节点 ID（数字为版块 leaf，字符串为分区 branch） */
  id: string;
  name: string;
}

/** 版块（board），树中的叶子节点 */
export interface Board {
  name: string;
  ename: string;
  manager: string;
  posts: string;
  threads: string;
  /** 当前在线人数（仅带 count 参数时可用） */
  onlineUsers?: string;
}

/**
 * 论坛结构树节点。
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
export interface SectionNode {
  id: string;
  name: string;
  type: "section";
  /** 嵌套深度，1 = 一级讨论区，2 = 二级讨论区，... */
  level: number;
  children: ForumTreeNode[];
}

/** 版块叶子节点 */
export interface BoardNode {
  id: string;
  name: string;
  type: "board";
  /** 嵌套深度，1 = 一级讨论区下的版面，2 = 二级目录下的版面，... */
  level: number;
  board: Board;
}

/** 树中的任意节点 */
export type ForumTreeNode = SectionNode | BoardNode;

/** 论坛结构汇总（init 产出） */
export interface ForumStructure {
  crawledAt: string;
  tree: ForumTreeNode[];
}

/** 文章（article），版块中的帖子 */
export interface Article {
  title: string;
  url: string;
  author: string;
  date: string;
}

// ============================================================
// 向后兼容的别名（旧接口仍可用）
// ============================================================

/** @deprecated 使用 SectionNode 替代 */
export interface SectionWithBoards {
  sectionId: string;
  sectionName: string;
  boards: Board[];
}
