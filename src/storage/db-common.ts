import { DatabaseSync } from "node:sqlite";
import * as fs from "fs";
import * as path from "path";
import { fromRoot } from "../core/paths.js";

// ============================================================
// db-common：SQLite 通用辅助（docs/01 §2.2 — 全项目唯一值得做成基类的点）
// ============================================================
// 所有 *Db（TrafficDb / ContentDb）共享：打开连接、建目录、事务模板。
// schema 演进不在 openDb：ContentDb 走 migrations/（版本化迁移，
// PRAGMA user_version），TrafficDb 用自身的幂等 CREATE TABLE。
// ============================================================

/** data 目录绝对路径（锚定项目根；不存在则创建） */
export function dataDir(): string {
  const dir = fromRoot("data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 解析 db 文件绝对路径。
 * - 传入绝对路径 → 原样使用
 * - 传入相对路径 / 纯文件名 → 落到 data 目录下
 */
export function dbFilePath(filename: string): string {
  if (path.isAbsolute(filename)) return filename;
  return path.join(dataDir(), filename);
}

/**
 * 打开一个 SQLite 连接并应用通用 PRAGMA。
 * schema 演进走 migrations/（版本化迁移，PRAGMA user_version），不在此执行。
 */
export function openDb(filename: string): DatabaseSync {
  const db = new DatabaseSync(dbFilePath(filename));
  // 开启外键约束（content 表之间的 REFERENCES 依赖）
  db.exec("PRAGMA foreign_keys = ON;");
  // WAL 模式：读写不互斥，批量写摊薄 fsync，适合本项目“采集写 + 查询读”并存
  // 的访问形态；-wal/-shm 文件落在 data/（已 gitignore）。内存库(:memory:)会自动回退。
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");
  return db;
}

/**
 * 事务模板：在单个事务内执行写操作，成功提交、失败回滚。
 * 批量写性能关键：一条 BEGIN/COMMIT 摊薄 fsync（docs/02 §4.1）。
 */
export function transaction<T>(
  db: DatabaseSync,
  fn: () => T,
): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
