/**
 * 版块（board），树中的叶子节点。
 *
 * 只保存基本不变的静态字段。
 * 经常变化的流量数据（帖子数、主题数、在线人数、今日发帖）由 traffic 模块
 * 实时获取，归 TrafficInfo，不存储在这里。
 */
export interface Board {
  name: string;
  ename: string;
  /** 版主用户名列表（一个版块可能有多个版主） */
  manager: string[];
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
