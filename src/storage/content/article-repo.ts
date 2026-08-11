import type { DatabaseSync } from "node:sqlite";
import { transaction } from "../db-common.js";
import { shouldUseFts, ftsPhraseQuery } from "../fts-bigrams.js";
import type { ArticleRow } from "../../model/dto/index.js";
import type { FtsIndex } from "./fts-index.js";
import { hashUrl, findUserId } from "./util.js";
import { appendCommonFilters, appendLimit } from "./search-common.js";

/**
 * 版块 + 文章域仓储（board / article 表）。
 * 依赖 FtsIndex（标题索引同步），无其他仓储依赖。
 */
export class ArticleRepo {
  constructor(
    private db: DatabaseSync,
    private fts: FtsIndex,
  ) {}

  /** upsert 版块（含匿名标记）；返回是否新增 */
  upsertBoard(ename: string, name: string, isAnonymous: boolean): void {
    this.db
      .prepare(
        `INSERT INTO board (ename, name, is_anonymous)
         VALUES (?, ?, ?)
         ON CONFLICT(ename) DO UPDATE SET
           name = excluded.name,
           is_anonymous = excluded.is_anonymous`,
      )
      .run(ename, name, isAnonymous ? 1 : 0);
  }

  /**
   * upsert 文章（列表页）。返回文章行 id。
   * 依赖 url_hash UNIQUE，重复插入被忽略或更新元数据。
   */
  upsertArticle(article: ArticleRow): number {
    const now = new Date().toISOString();
    const urlHash = hashUrl(article.url);
    this.db
      .prepare(
        `INSERT INTO article
           (board_ename, title, url, author_uid, is_pinned, date, reply_count, last_reply,
            last_replier_uid, crawled_at, updated_at, url_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(url_hash) DO UPDATE SET
           title = excluded.title,
           is_pinned = excluded.is_pinned,
           date = excluded.date,
           reply_count = excluded.reply_count,
           last_reply = excluded.last_reply,
           last_replier_uid = excluded.last_replier_uid,
           updated_at = excluded.updated_at`,
      )
      .run(
        article.boardEname,
        article.title,
        article.url,
        article.authorUid ? findUserId(this.db, article.authorUid) : null,
        article.isPinned ? 1 : 0,
        article.date,
        article.replyCount,
        article.lastReply,
        article.lastReplierUid ? findUserId(this.db, article.lastReplierUid) : null,
        now,
        now,
        urlHash,
      );
    const row = this.db
      .prepare(`SELECT id FROM article WHERE url_hash = ?`)
      .get(urlHash) as { id: number } | undefined;
    if (row) this.fts.syncArticle(row.id, article.title);
    return row ? row.id : 0;
  }

  /** 批量 upsert 文章（列表页一批；单事务摊薄 FTS 写 fsync） */
  upsertArticles(articles: ArticleRow[]): number {
    return transaction(this.db, () => {
      let inserted = 0;
      for (const a of articles) {
        if (this.upsertArticle(a) > 0) inserted++;
      }
      return inserted;
    });
  }

  /** 根据 url 哈希查文章 id（判断是否已抓取，docs/02 §6 判重） */
  findArticleIdByUrl(url: string): number | null {
    const row = this.db
      .prepare(`SELECT id FROM article WHERE url_hash = ?`)
      .get(hashUrl(url)) as { id: number } | undefined;
    return row ? row.id : null;
  }

  /** 文章是否已有正文（post 表是否有该 article 行）— 正确判重（不依赖 author_uid） */
  hasThreadContent(articleId: number): boolean {
    const row = this.db
      .prepare(`SELECT 1 FROM post WHERE article_id = ? LIMIT 1`)
      .get(articleId) as { id: number } | undefined;
    return !!row;
  }

  /**
   * 本地搜索文章（article 表标题；优先 FTS5 bigram 索引，短词回退 LIKE）。
   *
   * 缓存命中路径：之前搜索/抓取落库过的文章，从这里秒回，无需联网、无需登录。
   *
   * @param keyword 关键字（FTS 短语匹配 + LIKE 兜底，大小写不敏感）
   * @param opts    { boardEnames?/boardEname? 限定版面；from?/to? 发帖日期窗口；
   *                 sort? recent/relevant；limit? 返回上限 }
   * @returns 命中文章行（含版块/标题/url/作者/日期/回复数）
   */
  searchArticles(
    keyword: string,
    opts: {
      boardEname?: string;
      boardEnames?: readonly string[];
      from?: string;
      to?: string;
      limit?: number;
      sort?: "recent" | "relevant";
    } = {},
  ): ArticleRow[] {
    const { limit, sort = "recent" } = opts;
    const useFts = shouldUseFts(keyword) && this.fts.enabled;

    const select = `
      SELECT a.board_ename, a.title, a.url, u.name AS author_raw,
             u.uid AS author_uid, a.is_pinned, a.date, a.reply_count,
             a.last_reply, u2.uid AS last_replier_uid, a.crawled_at
    `;
    const params: (string | number)[] = [];

    // FTS 路径：bigram 候选集 + LIKE 兜底（只在 FTS 命中的行上跑，保证正确性）。
    // bm25/rank 等 FTS 辅助函数须用 FTS 真实表名（不能用别名）。
    let sql: string;
    if (useFts) {
      sql = `${select}
        FROM article_fts
        JOIN article a ON a.id = article_fts.rowid
        LEFT JOIN user u ON u.id = a.author_uid
        LEFT JOIN user u2 ON u2.id = a.last_replier_uid
        WHERE article_fts MATCH ?
          AND a.title LIKE ?`;
      params.push(ftsPhraseQuery(keyword)!, `%${keyword}%`);
    } else {
      sql = `${select}
        FROM article a
        LEFT JOIN user u ON u.id = a.author_uid
        LEFT JOIN user u2 ON u2.id = a.last_replier_uid
        WHERE a.title LIKE ?`;
      params.push(`%${keyword}%`);
    }

    const filtered = appendCommonFilters(sql, params, opts, "a.date");
    sql = filtered.sql; // params 引用未变（原地 push）

    if (sort === "relevant" && useFts) {
      sql += ` ORDER BY bm25(article_fts) ASC`;
    } else if (sort === "relevant") {
      sql += ` ORDER BY CASE WHEN a.title LIKE ? THEN 0 ELSE 1 END, a.date DESC, a.id DESC`;
      params.push(`${keyword}%`);
    } else {
      sql += ` ORDER BY a.is_pinned DESC, a.date DESC, a.id DESC`;
    }

    const limited = appendLimit(sql, params, limit);
    sql = limited.sql;

    const rows = this.db.prepare(sql).all(...params) as unknown as Array<{
      board_ename: string;
      title: string;
      url: string;
      author_raw: string | null;
      author_uid: string | null;
      is_pinned: number;
      date: string;
      reply_count: number;
      last_reply: string;
      last_replier_uid: string | null;
      crawled_at: string;
    }>;
    return rows.map((r) => ({
      boardEname: r.board_ename,
      title: r.title,
      url: r.url,
      date: r.date || r.crawled_at.slice(0, 10),
      isPinned: !!r.is_pinned,
      authorUid: r.author_uid,
      authorRaw: r.author_raw ?? "",
      replyCount: r.reply_count,
      lastReply: r.last_reply,
      lastReplierUid: r.last_replier_uid,
    }));
  }
}
