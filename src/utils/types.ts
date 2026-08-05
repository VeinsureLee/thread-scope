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
 * 树的结构类型：
 *   type: "section" → children 可以是 SectionNode[]（子分区）或 Board[]
 *   type: "board"   → 叶子节点，包含版块详情
 */
export interface SectionNode {
  id: string;
  name: string;
  type: "section";
  children: ForumTreeNode[];
}

/** 版块叶子节点 */
export interface BoardNode {
  id: string;
  name: string;
  type: "board";
  board: Board;
}

/** 树中的任意节点 */
export type ForumTreeNode = SectionNode | BoardNode;

/** 论坛结构汇总（init 产出） */
export interface ForumStructure {
  crawledAt: string;
  tree: SectionNode[];
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
