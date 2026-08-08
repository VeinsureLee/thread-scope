/**
 * storage 层统一出口。
 *
 * 存储分工：
 * - SQLite：内容库（content-db）、流量库（traffic-db），可查询、增量持久化；
 * - JSON 文件：结构快照（structure-store），整体读写；
 * - 写库队列（traffic-queue）：异步落库不阻塞工具返回。
 */
export { ContentDb } from "./content-db.js";
export { TrafficDb } from "./traffic-db.js";
export { enqueueTrafficWrite, flushTrafficWrites } from "./traffic-queue.js";
export { readJson, writeJson, getDataDir } from "./structure-store.js";
export { openDb, transaction } from "./db-common.js";
export { flattenArticleNodes } from "./mapper/index.js";
