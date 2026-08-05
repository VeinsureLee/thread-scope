/** 版块（board），树中的叶子节点 */
export interface Board {
  name: string;
  ename: string;
  manager: string;
  posts: string;
  threads: string;
  /** 当前在线人数（仅带 count 参数时可用） */
  onlineUsers?: string;
  /** 今日发帖数（仅带 count 参数时可用） */
  todayPosts?: string;
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
