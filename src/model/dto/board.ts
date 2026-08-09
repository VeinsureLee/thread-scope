/**
 * 持久化 DTO — 版块（board）。
 *
 * 与领域实体 BoardNode（model/forum）区分：这是论坛结构 JSON 快照 / DB 行
 * 的可序列化形态（docs/02 §3.1）。
 */
export interface Board {
  name: string;
  ename: string;
  /** 版主用户名列表（一个版块可能有多个版主） */
  manager: string[];
}

/** 版块叶子节点（DTO） */
export interface BoardNode {
  id: string;
  name: string;
  type: "board";
  /** 嵌套深度，1 = 一级讨论区下的版面，2 = 二级目录下的版面，... */
  level: number;
  board: Board;
}
