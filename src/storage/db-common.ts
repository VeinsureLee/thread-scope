import { DatabaseSync } from "node:sqlite";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// db-common：SQLite 通用辅助（docs/01 §2.2 — 全项目唯一值得做成基类的点）
// ============================================================
// 所有 *Db（TrafficDb / ContentDb）共享：打开连接、建目录、执行迁移、事务模板。
// ============================================================

/** data 目录绝对路径（不存在则创建） */
export function dataDir(): string {
  const dir = path.resolve(process.cwd(), "data");
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
 * 打开一个 SQLite 连接，并执行建表/迁移 SQL。
 * 迁移采用 `CREATE TABLE IF NOT EXISTS` 幂等写法（与 TrafficDb 现有方式一致）。
 */
export function openDb(filename: string, migrations: string[]): DatabaseSync {
  const db = new DatabaseSync(dbFilePath(filename));
  // 开启外键约束（content 表之间的 REFERENCES 依赖）
  db.exec("PRAGMA foreign_keys = ON;");
  for (const sql of migrations) {
    db.exec(sql);
  }
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
