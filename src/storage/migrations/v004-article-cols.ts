import type { DatabaseSync } from "node:sqlite";

/**
 * v4 — article 表补列（文章概览字段迁移，兼容早期只保存标题/URL 的表）。
 * 幂等：逐列检查 PRAGMA table_info 再补。
 */
export function migrateV004(db: DatabaseSync): void {
  const cols = db
    .prepare(`PRAGMA table_info(article)`)
    .all() as unknown as Array<{ name: string }>;
  const existing = new Set(cols.map((c) => c.name));
  const newColumns: Array<[string, string]> = [
    ["date", "TEXT NOT NULL DEFAULT ''"],
    ["reply_count", "INTEGER NOT NULL DEFAULT 0"],
    ["last_reply", "TEXT NOT NULL DEFAULT ''"],
    ["last_replier_uid", "INTEGER REFERENCES user(id)"],
  ];
  for (const [name, type] of newColumns) {
    if (!existing.has(name)) db.exec(`ALTER TABLE article ADD COLUMN ${name} ${type};`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_article_last_reply ON article (last_reply);`);
}
