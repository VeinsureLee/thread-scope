/**
 * 持久化 DTO 统一出口（docs/07 §1.7：实体与 DTO 分离）。
 *
 * DTO 是 JSON/SQLite 的可序列化形态，与领域实体（model/{domain}）区分：
 * - forum/thread 等目录放带方法的领域实体；
 * - dto/ 只放纯数据接口（ArticleRow/Post/ForumTreeNode/UserProfile 等）。
 */
export * from "./article.js";
export * from "./content.js";
export * from "./search.js";
export * from "./traffic.js";
export * from "./tree.js";
export * from "./board.js";
export * from "./section.js";
export * from "./user.js";
// UserProfile / TrafficInfo 是领域值对象，也是持久化 DTO 的组成部分，
// 统一从这里再导出，供 crawl/application/presenter 层导入。
export type { UserProfile } from "../user/user-profile.js";
export type { TrafficInfo } from "../traffic/traffic-info.js";
