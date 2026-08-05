/** 版面流量信息 */
export interface TrafficInfo {
  /** 版面英文名 */
  ename: string;
  /** 版面中文名 */
  name: string;
  /** 在线人数 */
  onlineUsers: string;
  /** 今日发帖数 */
  todayPosts: string;
  /** 主题数 */
  threads: string;
  /** 发帖总数（文章数） */
  posts: string;
}

/** 流量快照（保存到文件及 MCP 工具返回） */
export interface TrafficSnapshot {
  crawledAt: string;
  nodeId: string;
  nodeName: string;
  records: TrafficInfo[];
  errors: string[];
}
