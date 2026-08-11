import type { DatabaseSync } from "node:sqlite";

/**
 * v5 — post 表补列（client / ip，帖子正文清洗后提取的字段）。
 * 幂等：逐列检查 PRAGMA table_info 再补。
 *
 * 注：早期脏正文的清洗属"启动期幂等修复"（可能持续出现），不在一次性版本
 * 迁移内，见 content/repairs.ts。
 */
export function migrateV005(db: DatabaseSync): void {
  const cols = db
    .prepare(`PRAGMA table_info(post)`)
    .all() as unknown as Array<{ name: string }>;
  const existing = new Set(cols.map((c) => c.name));
  const newColumns: Array<[string, string]> = [
    ["client", "TEXT"],
    ["ip", "TEXT"],
  ];
  for (const [name, type] of newColumns) {
    if (!existing.has(name)) db.exec(`ALTER TABLE post ADD COLUMN ${name} ${type};`);
  }
}
