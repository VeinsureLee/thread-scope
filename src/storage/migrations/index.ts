import type { DatabaseSync } from "node:sqlite";
import { transaction } from "../db-common.js";
import type { Migration } from "./types.js";
import { migrateV001 } from "./v001-base-schema.js";
import { migrateV002 } from "./v002-user-profile-cols.js";
import { migrateV003 } from "./v003-drop-profile-col.js";
import { migrateV004 } from "./v004-article-cols.js";
import { migrateV005 } from "./v005-post-cols.js";

/**
 * 迁移注册表（升序）。新增 schema 演进 → 追加一个 v00X 文件 + 一行注册。
 * 只跑未应用的版本（PRAGMA user_version 记录），每个迁移在事务内执行：
 * 成功则推进版本，失败整体回滚。
 */
const MIGRATIONS: Migration[] = [
  { version: 1, name: "base-schema", up: migrateV001 },
  { version: 2, name: "user-profile-cols", up: migrateV002 },
  { version: 3, name: "drop-profile-col", up: migrateV003 },
  { version: 4, name: "article-cols", up: migrateV004 },
  { version: 5, name: "post-cols-and-clean", up: migrateV005 },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;

/** 按 user_version 增量执行未应用的迁移（幂等，可重复调用）。 */
export function runMigrations(db: DatabaseSync): void {
  const { user_version: applied } = db
    .prepare("PRAGMA user_version")
    .get() as { user_version: number };

  for (const m of MIGRATIONS
    .filter((x) => x.version > applied)
    .sort((a, b) => a.version - b.version)) {
    transaction(db, () => {
      m.up(db);
      db.exec(`PRAGMA user_version = ${m.version}`);
    });
  }
}
