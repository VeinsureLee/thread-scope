import type { DatabaseSync } from "node:sqlite";
import { transaction } from "../db-common.js";
import { parsePostContent } from "../../crawl/common/parse-post-content.js";

/**
 * 启动期幂等数据修复（与版本迁移的区别见 migrations/types.ts）。
 *
 * 版本迁移只管 schema 结构（建表/补列/删列），只跑一次；这里管"可能持续出现
 * 的脏数据"修复——每次启动都检查、发现才动、跑完即净，幂等。
 *
 * 当前仅一类：早期帖子 content 存整块原始文本（含"发信人:/标题/发信站"头部与
 * "--/来源"尾部），会污染 FTS 分词。检测到仍带"发信人:"头的帖子时，
 * 逐行 parsePostContent 清洗 content/client/ip（依赖 v5 迁移补的列），
 * 并清空 post_fts 让 FtsIndex 初始化时重灌干净 bigram（表可能尚未创建，忽略）。
 */
export function repairLegacyPosts(db: DatabaseSync): void {
  const dirty = db
    .prepare(`SELECT count(*) AS c FROM post WHERE content LIKE '发信人:%'`)
    .get() as { c: number };
  if (!dirty.c) return;

  const rows = db
    .prepare(`SELECT id, content FROM post WHERE content LIKE '发信人:%'`)
    .all() as Array<{ id: number; content: string }>;
  const update = db.prepare(
    `UPDATE post SET content = ?, client = ?, ip = ?,
       post_time = CASE WHEN ? IS NOT NULL THEN ? ELSE post_time END
     WHERE id = ?`,
  );
  transaction(db, () => {
    for (const row of rows) {
      const parsed = parsePostContent(row.content);
      update.run(parsed.body, parsed.client, parsed.ip, parsed.postTime, parsed.postTime, row.id);
    }
  });

  // 清洗后正文变了 → 清空 post_fts，由 FtsIndex 初始化重灌干净 bigram
  try {
    db.exec(`DELETE FROM post_fts`);
  } catch {
    /* FTS 表不存在（新库）— 忽略 */
  }
}
