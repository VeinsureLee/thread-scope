import type { DatabaseSync } from "node:sqlite";
import { transaction } from "../db-common.js";
import { segmentBigrams } from "../fts-bigrams.js";
import { logWarn } from "../../logging/logger.js";

/**
 * FTS5 全文索引维护（bigram 预切分，见 fts-bigrams.ts）。
 *
 * 定位：加速器而非正确性依赖——初始化失败仅降级 LIKE 搜索，不影响库可用性，
 * 因此与 schema 迁移（migrations/）分离：迁移失败必须崩，FTS 失败只降级。
 *
 * 职责：
 * - 建虚拟表（article_fts / post_fts）+ 存量回填（表空时）；
 * - 写路径增量同步挂点（syncArticle / syncPost）；
 * - 全量重建（维护脚本 npm run maintain 调用）。
 */
export class FtsIndex {
  /** FTS5 是否可用（初始化失败时回退 LIKE 搜索） */
  enabled = false;

  constructor(private db: DatabaseSync) {
    try {
      db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS article_fts USING fts5(title_tok)`);
      db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS post_fts USING fts5(content_tok)`);

      const articleCount = (db.prepare(`SELECT count(*) AS c FROM article_fts`).get() as { c: number }).c;
      if (articleCount === 0) {
        const rows = db.prepare(`SELECT id, title FROM article`).all() as Array<{ id: number; title: string }>;
        const insert = db.prepare(`INSERT INTO article_fts(rowid, title_tok) VALUES (?, ?)`);
        transaction(db, () => {
          for (const row of rows) insert.run(row.id, segmentBigrams(row.title));
        });
      }

      const postCount = (db.prepare(`SELECT count(*) AS c FROM post_fts`).get() as { c: number }).c;
      if (postCount === 0) this.backfillPostFts();

      this.enabled = true;
    } catch (err) {
      logWarn("system", { message: "FTS5 初始化失败，搜索回退 LIKE", error: (err as Error).message }, "db.fts");
    }
  }

  /** 同步单篇文章标题到 article_fts（写路径挂点）。 */
  syncArticle(id: number, title: string): void {
    if (!this.enabled) return;
    this.db.prepare(`DELETE FROM article_fts WHERE rowid = ?`).run(id);
    this.db.prepare(`INSERT INTO article_fts(rowid, title_tok) VALUES (?, ?)`).run(id, segmentBigrams(title));
  }

  /** 同步一批帖子正文到 post_fts（写路径挂点；按 article_id+kind+floor 定位 post id）。 */
  syncPost(articleId: number, posts: Array<{ floor: number; kind: string; content: string }>): void {
    if (!this.enabled) return;
    const findId = this.db.prepare(`SELECT id FROM post WHERE article_id = ? AND kind = ? AND floor = ?`);
    const del = this.db.prepare(`DELETE FROM post_fts WHERE rowid = ?`);
    const ins = this.db.prepare(`INSERT INTO post_fts(rowid, content_tok) VALUES (?, ?)`);
    for (const post of posts) {
      const row = findId.get(articleId, post.kind, post.floor) as { id: number } | undefined;
      if (!row) continue;
      del.run(row.id);
      ins.run(row.id, segmentBigrams(post.content));
    }
  }

  /** 重建 post_fts（从 post 表全部正文重灌 bigram）。调用方需确认 FTS 可用。 */
  private backfillPostFts(): void {
    this.db.exec(`DELETE FROM post_fts`);
    const rows = this.db.prepare(`SELECT id, content FROM post`).all() as Array<{ id: number; content: string }>;
    const insert = this.db.prepare(`INSERT INTO post_fts(rowid, content_tok) VALUES (?, ?)`);
    transaction(this.db, () => {
      for (const row of rows) insert.run(row.id, segmentBigrams(row.content));
    });
  }

  /**
   * 全量重建 FTS5 索引（bigram 预切分重灌；维护脚本 npm run maintain 调用）。
   *
   * 注意：本项目 FTS 表存的是 bigram 预切分文本，不能用 FTS5 原生
   * `INSERT INTO t(t) VALUES('rebuild')`（会对 bigram 串二次分词、破坏索引），
   * 必须从基表重新 segmentBigrams 灌入。
   */
  rebuild(): void {
    if (!this.enabled) return;
    this.db.exec(`DELETE FROM article_fts`);
    const rows = this.db
      .prepare(`SELECT id, title FROM article`)
      .all() as Array<{ id: number; title: string }>;
    const insert = this.db.prepare(`INSERT INTO article_fts(rowid, title_tok) VALUES (?, ?)`);
    transaction(this.db, () => {
      for (const row of rows) insert.run(row.id, segmentBigrams(row.title));
    });
    this.backfillPostFts();
  }
}
