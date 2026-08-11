import type { DatabaseSync } from "node:sqlite";

/**
 * 数据库迁移定义。
 *
 * 约定：
 * - version 为升序整数，以 SQLite 原生 `PRAGMA user_version` 记录已应用版本；
 * - 每个迁移只执行一次（version 小于等于已应用版本则跳过），失败整体回滚；
 * - up 内可自由 ALTER/UPDATE/DELETE，无需幂等（但 CREATE TABLE IF NOT EXISTS
 *   仍建议保留，便于旧库首次升级时跳过历史重复结构）；
 * - 数据清洗类迁移（如旧 JSON 拆分、脏正文清洗）也放这里——跑完即弃，
 *   不再常驻业务类。
 */
export interface Migration {
  version: number;
  name: string;
  up: (db: DatabaseSync) => void;
}
