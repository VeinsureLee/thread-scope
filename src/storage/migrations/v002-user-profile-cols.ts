import type { DatabaseSync } from "node:sqlite";

/**
 * v2 — user 表补列（docs/06 用户体系重构）。
 *
 * 早期 user 表只有 id/uid/name/is_anon/avatar/updated_at，逐步加 profile/
 * profile_fetched_at 及全部独立字段。SQLite 的 ALTER TABLE ADD COLUMN 无
 * IF NOT EXISTS，故逐列检查 PRAGMA table_info 再补（兼容旧库已有部分列）。
 * profile JSON 数据拆分在 v3（补列完成 + DROP 前）。
 */
export function migrateV002(db: DatabaseSync): void {
  const cols = db
    .prepare(`PRAGMA table_info(user)`)
    .all() as unknown as Array<{ name: string }>;
  const existing = new Set(cols.map((c) => c.name));

  const newColumns: Array<[string, string]> = [
    ["avatar", "TEXT"],
    ["gender", "TEXT"],
    ["constellation", "TEXT"],
    ["qq", "TEXT"],
    ["msn", "TEXT"],
    ["homepage", "TEXT"],
    ["level", "TEXT"],
    ["title", "TEXT"],
    ["post_count", "INTEGER"],
    ["points", "INTEGER"],
    ["vitality", "INTEGER"],
    ["last_login", "TEXT"],
    ["last_ip", "TEXT"],
    ["status", "TEXT"],
    ["is_online", "BOOLEAN NOT NULL DEFAULT 0"],
    ["follow_num", "INTEGER NOT NULL DEFAULT 0"],
    ["fans_num", "INTEGER NOT NULL DEFAULT 0"],
    ["is_manager", "BOOLEAN NOT NULL DEFAULT 0"],
    ["profile_fetched_at", "TEXT"],
    ["updated_at", "TEXT"],
  ];
  for (const [name, type] of newColumns) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE user ADD COLUMN ${name} ${type};`);
    }
  }
  // is_manager 索引（需列存在才建）
  db.exec(`CREATE INDEX IF NOT EXISTS idx_user_is_manager ON user (is_manager);`);
}
