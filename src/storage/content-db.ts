import { createHash } from "crypto";
import { DatabaseSync } from "node:sqlite";
import { openDb, transaction } from "./db-common.js";
import type { ArticleRow, Post } from "../models/index.js";

/** SQLite 存储行类型（snake_case） */
interface UserRow {
  id: number;
  uid: string;
  name: string;
  is_anon: number;
  avatar: string | null;
  updated_at: string;
}

interface ArticleRow2 {
  id: number;
  board_ename: string;
  title: string;
  url: string;
  author_uid: number | null;
  is_pinned: number;
  crawled_at: string;
  updated_at: string;
  url_hash: string;
}

interface PostRow {
  id: number;
  article_id: number;
  parent_id: number | null;
  floor: number;
  kind: "article" | "reply";
  author_uid: number | null;
  author_raw: string;
  is_anon: number;
  content: string;
  images: string;
  post_time: string | null;
  crawled_at: string;
}

/** 建表/迁移 SQL（幂等） */
const MIGRATIONS = [
  // ── board：版块（含匿名标记） ──
  `
  CREATE TABLE IF NOT EXISTS board (
    ename        TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    is_anonymous BOOLEAN NOT NULL DEFAULT 0
  );
  `,
  // ── user：作者身份（uid 唯一，供 INSERT OR IGNORE 去重） ──
  `
  CREATE TABLE IF NOT EXISTS user (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    uid        TEXT NOT NULL UNIQUE,
    name       TEXT NOT NULL,
    is_anon    BOOLEAN NOT NULL DEFAULT 0,
    avatar     TEXT,
    updated_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_user_is_anon ON user (is_anon);
  `,
  // ── article：文章元数据（url_hash 唯一） ──
  `
  CREATE TABLE IF NOT EXISTS article (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    board_ename  TEXT NOT NULL REFERENCES board(ename),
    title        TEXT NOT NULL,
    url          TEXT NOT NULL,
    author_uid   INTEGER REFERENCES user(id),
    is_pinned    BOOLEAN NOT NULL DEFAULT 0,
    crawled_at   TEXT NOT NULL,
    updated_at   TEXT,
    url_hash     TEXT NOT NULL UNIQUE
  );
  CREATE INDEX IF NOT EXISTS idx_article_board_time ON article (board_ename, crawled_at);
  CREATE INDEX IF NOT EXISTS idx_article_author ON article (author_uid);
  `,
  // ── post：正文+评论（复合唯一去重） ──
  `
  CREATE TABLE IF NOT EXISTS post (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id INTEGER NOT NULL REFERENCES article(id),
    parent_id  INTEGER REFERENCES post(id),
    floor      INTEGER NOT NULL,
    kind       TEXT NOT NULL CHECK(kind IN ('article','reply')),
    author_uid INTEGER REFERENCES user(id),
    author_raw TEXT NOT NULL,
    is_anon    BOOLEAN NOT NULL DEFAULT 0,
    content    TEXT NOT NULL,
    images     TEXT NOT NULL DEFAULT '[]',
    post_time  TEXT,
    crawled_at TEXT NOT NULL,
    UNIQUE(article_id, kind, floor)
  );
  CREATE INDEX IF NOT EXISTS idx_post_article ON post (article_id);
  CREATE INDEX IF NOT EXISTS idx_post_author ON post (author_uid);
  `,
];

/**
 * 内容库（forum-content.db）。
 *
 * 职责：持久化文章/正文/评论/作者（docs/02 §3）。所有内容类数据共用此库，
 * 用外键 + 事务保证"文章+作者+评论"的原子写入。
 */
export class ContentDb {
  private db: DatabaseSync;

  constructor(dbPath?: string) {
    this.db = openDb(dbPath ?? "forum-content.db", MIGRATIONS);
  }

  // ════════════ 写入 ════════════

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
   * 作者写入：INSERT OR IGNORE（不查了再插，docs/02 §4.1）。
   * 依赖 uid UNIQUE。返回 user 行 id（新插入或已存在）。
   */
  upsertUser(user: { uid: string; name: string; isAnon?: boolean; avatar?: string | null }): number {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT OR IGNORE INTO user (uid, name, is_anon, avatar, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(user.uid, user.name, user.isAnon ? 1 : 0, user.avatar ?? null, now);
    const row = this.db
      .prepare(`SELECT id FROM user WHERE uid = ?`)
      .get(user.uid) as { id: number } | undefined;
    return row ? row.id : 0;
  }

  /** 批量 upsert 作者（同事务内调用，返回 uid→id 映射） */
  upsertUsers(users: Array<{ uid: string; name: string; isAnon?: boolean }>): Map<string, number> {
    const map = new Map<string, number>();
    for (const u of users) {
      map.set(u.uid, this.upsertUser(u));
    }
    return map;
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
           (board_ename, title, url, author_uid, is_pinned, crawled_at, updated_at, url_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(url_hash) DO UPDATE SET
           title = excluded.title,
           is_pinned = excluded.is_pinned,
           updated_at = excluded.updated_at`,
      )
      .run(
        article.boardEname,
        article.title,
        article.url,
        article.authorUid ? findUserId(this.db, article.authorUid) : null,
        article.isPinned ? 1 : 0,
        now,
        now,
        urlHash,
      );
    const row = this.db
      .prepare(`SELECT id FROM article WHERE url_hash = ?`)
      .get(urlHash) as { id: number } | undefined;
    return row ? row.id : 0;
  }

  /** 批量 upsert 文章（列表页一批） */
  upsertArticles(articles: ArticleRow[]): number {
    let inserted = 0;
    for (const a of articles) {
      if (this.upsertArticle(a) > 0) inserted++;
    }
    return inserted;
  }

  /**
   * 原子写入一篇文章的正文 + 评论 + 作者（docs/02 §4.1、§6）。
   * 单个事务：作者 INSERT OR IGNORE → 文章 upsert → posts（首帖+评论）。
   *
   * @returns 文章行 id（article 表）；失败/无作者信息时仍会写入 posts
   */
  saveThread(
    boardEname: string,
    articleMeta: { url: string; title: string },
    authors: Array<{ uid: string; name: string; isAnon?: boolean }>,
    firstPost: Post,
    replies: Post[],
  ): number {
    return transaction(this.db, () => {
      // 1. 作者
      const uidMap = this.upsertUsers(authors.filter((a) => a.uid));

      // 2. 文章（url_hash 为去重锚点）
      const urlHash = hashUrl(articleMeta.url);
      const now = new Date().toISOString();
      this.db
        .prepare(
          `INSERT OR IGNORE INTO article
             (board_ename, title, url, author_uid, is_pinned, crawled_at, updated_at, url_hash)
           VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
        )
        .run(boardEname, articleMeta.title, articleMeta.url, null, now, now, urlHash);
      const articleRow = this.db
        .prepare(`SELECT id FROM article WHERE url_hash = ?`)
        .get(urlHash) as { id: number } | undefined;
      if (!articleRow) return 0;
      const articleId = articleRow.id;

      // 3. posts
      const insertPost = this.db.prepare(
        `INSERT OR IGNORE INTO post
           (article_id, parent_id, floor, kind, author_uid, author_raw, is_anon, content, images, post_time, crawled_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const p of [firstPost, ...replies]) {
        insertPost.run(
          articleId,
          p.parentId ?? null,
          p.floor,
          p.kind,
          p.authorUid ? (uidMap.get(p.authorUid) ?? null) : null,
          p.authorRaw,
          p.isAnon ? 1 : 0,
          p.content,
          JSON.stringify(p.images),
          p.postTime,
          now,
        );
      }

      return articleId;
    });
  }

  // ════════════ 读取 ════════════

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

  /** 获取一篇文章的全部楼层（按楼层升序） */
  getThreadPosts(articleId: number): Post[] {
    const rows = this.db
      .prepare(
        `SELECT p.*, u.uid AS author_uid_str
         FROM post p
         LEFT JOIN user u ON u.id = p.author_uid
         WHERE p.article_id = ?
         ORDER BY p.floor ASC`,
      )
      .all(articleId) as unknown as Array<PostRow & { author_uid_str: string | null }>;
    return rows.map(rowToPost);
  }

  /** 查询用户的 uid → 数据库 user id */
  getUserId(uid: string): number | null {
    const row = this.db.prepare(`SELECT id FROM user WHERE uid = ?`).get(uid) as { id: number } | undefined;
    return row ? row.id : null;
  }

  /** 关闭连接 */
  close(): void {
    this.db.close();
  }
}

/** url → sha1 哈希（与 parser-kit 的 hashUrl 一致） */
function hashUrl(url: string): string {
  return createHash("sha1").update(url).digest("hex");
}

/** 按 uid 查 user id（无则返回 null） */
function findUserId(db: DatabaseSync, uid: string): number | null {
  const row = db.prepare(`SELECT id FROM user WHERE uid = ?`).get(uid) as { id: number } | undefined;
  return row ? row.id : null;
}

/** SQLite 行 → Post */
function rowToPost(r: PostRow & { author_uid_str: string | null }): Post {
  return {
    floor: r.floor,
    kind: r.kind,
    authorUid: r.author_uid_str,
    authorRaw: r.author_raw,
    isAnon: !!r.is_anon,
    content: r.content,
    images: safeParseImages(r.images),
    postTime: r.post_time,
    posText: "",
  };
}

/** 解析 images JSON（异常回退空数组） */
function safeParseImages(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}
