/**
 * 版面实时流量值（领域模型，ForumNode 派生数据）。
 *
 * 与持久化 DTO（models/traffic）分离：这里是 ForumNode 树节点上的
 * 领域流量，聚合规则见 model/algorithm/forum/traffic-aggregate。
 */
export interface TrafficInfo {
  readonly ename: string;
  readonly name: string;
  readonly onlineUsers: string;
  readonly todayPosts: string;
  readonly threads: string;
  readonly posts: string;
}
