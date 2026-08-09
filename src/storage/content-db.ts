import { createHash } from "crypto";
import { DatabaseSync } from "node:sqlite";
import { openDb, transaction } from "./db-common.js";
import type { ArticleRow, Post } from "../model/dto/index.js";
import type { Thread } from "../model/index.js";
import { flattenArticleNodes } from "./mapper/thread-mapper.js";

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
  date: string;
  reply_count: number;
  last_reply: string;
  last_replier_uid: number | null;
}

interface PostRow {
  id: number;
  article_id: number;
  parent_id: number | null;
  parent_floor?: number | null;
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
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    uid                 TEXT NOT NULL UNIQUE,
    name                TEXT NOT NULL,
    is_anon             BOOLEAN NOT NULL DEFAULT 0,
    avatar              TEXT,
    gender              TEXT,
    constellation       TEXT,
    qq                  TEXT,
    msn                 TEXT,
    homepage            TEXT,
    level               TEXT,
    title               TEXT,
    post_count          INTEGER,
    points              INTEGER,
    vitality            INTEGER,
    last_login          TEXT,
    last_ip             TEXT,
    status              TEXT,
    is_online           BOOLEAN NOT NULL DEFAULT 0,
    follow_num          INTEGER NOT NULL DEFAULT 0,
    fans_num            INTEGER NOT NULL DEFAULT 0,
    is_manager          BOOLEAN NOT NULL DEFAULT 0,
    profile             TEXT,
    profile_fetched_at  TEXT,
    updated_at          TEXT
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
    date         TEXT NOT NULL DEFAULT '',
    reply_count  INTEGER NOT NULL DEFAULT 0,
    last_reply   TEXT NOT NULL DEFAULT '',
    last_replier_uid INTEGER REFERENCES user(id),
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
    this.ensureUserColumns();
    this.ensureArticleColumns();
  }

  /**
   * 用户表补列迁移（幂等）。
   *
   * docs/06 用户体系重构：profile JSON 拆成独立字段。早期 user 表只有
   * id/uid/name/is_anon/avatar/updated_at；逐步加 profile/profile_fetched_at 及
   * 全部独立字段。SQLite 的 ALTER TABLE ADD COLUMN 无 IF NOT EXISTS，
   * 故逐列检查 PRAGMA table_info 再补。已有 profile JSON 旧数据迁移拆到新字段。
   */
  private ensureUserColumns(): void {
    const cols = this.db
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
      ["profile", "TEXT"],
      ["profile_fetched_at", "TEXT"],
      ["updated_at", "TEXT"],
    ];
    for (const [name, type] of newColumns) {
      if (!existing.has(name)) {
        this.db.exec(`ALTER TABLE user ADD COLUMN ${name} ${type};`);
      }
    }
    // is_manager 索引（需列存在才建）
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_user_is_manager ON user (is_manager);`);

    // 旧数据迁移：profile JSON → 独立字段（仅当 profile 列有值且关键字段为空时）
    this.migrateProfileJson();
  }

  /** 文章概览字段迁移（幂等），兼容早期只保存标题/URL 的 article 表。 */
  private ensureArticleColumns(): void {
    const cols = this.db
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
      if (!existing.has(name)) this.db.exec(`ALTER TABLE article ADD COLUMN ${name} ${type};`);
    }
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_article_last_reply ON article (last_reply);`);
  }

  /** 旧 user.profile JSON → 独立字段（幂等：关键字段已填则跳过） */
  private migrateProfileJson(): void {
    const rows = this.db
      .prepare(`SELECT uid, profile FROM user WHERE profile IS NOT NULL`)
      .all() as unknown as Array<{ uid: string; profile: string }>;
    for (const row of rows) {
      let p: {
        nickname?: string; avatar?: string; gender?: string; constellation?: string;
        qq?: string; msn?: string; homepage?: string; level?: string;
        title?: string[]; postCount?: string; points?: string; vitality?: string;
        lastLogin?: string; lastIp?: string; onlineStatus?: string;
        isOnline?: boolean; followNum?: number; fansNum?: number;
      };
      try {
        p = JSON.parse(row.profile) as typeof p;
      } catch {
        continue;
      }
      const num = (v: unknown): number | null => {
        if (v == null || v === "") return null;
        const n = Number(String(v).replace(/[^\d-]/g, ""));
        return Number.isNaN(n) ? null : n;
      };
      const params: Array<string | number | null> = [
        p.nickname ?? null, p.nickname ?? null, p.nickname ?? null,
        p.avatar ?? null, p.avatar ?? null,
        p.gender ?? null, p.gender ?? null,
        p.constellation ?? null, p.constellation ?? null,
        p.qq ?? null, p.qq ?? null,
        p.msn ?? null, p.msn ?? null,
        p.homepage ?? null, p.homepage ?? null,
        p.level ?? null, p.level ?? null,
        p.title ? JSON.stringify(p.title) : null, p.title ? JSON.stringify(p.title) : null,
        num(p.postCount), num(p.postCount),
        num(p.points), num(p.points),
        num(p.vitality), num(p.vitality),
        p.lastLogin ?? null, p.lastLogin ?? null,
        p.lastIp ?? null, p.lastIp ?? null,
        p.onlineStatus ?? null, p.onlineStatus ?? null,
        p.isOnline == null ? null : (p.isOnline ? 1 : 0), p.isOnline == null ? null : (p.isOnline ? 1 : 0),
        p.followNum ?? null, p.followNum ?? null,
        p.fansNum ?? null, p.fansNum ?? null,
        row.uid,
      ];
      this.db
        .prepare(
          `UPDATE user SET
             name = CASE WHEN ? IS NOT NULL AND ? != '' THEN ? ELSE name END,
             avatar = CASE WHEN ? IS NOT NULL THEN ? ELSE avatar END,
             gender = CASE WHEN ? IS NOT NULL THEN ? ELSE gender END,
             constellation = CASE WHEN ? IS NOT NULL THEN ? ELSE constellation END,
             qq = CASE WHEN ? IS NOT NULL THEN ? ELSE qq END,
             msn = CASE WHEN ? IS NOT NULL THEN ? ELSE msn END,
             homepage = CASE WHEN ? IS NOT NULL THEN ? ELSE homepage END,
             level = CASE WHEN ? IS NOT NULL THEN ? ELSE level END,
             title = CASE WHEN ? IS NOT NULL THEN ? ELSE title END,
             post_count = CASE WHEN ? IS NOT NULL THEN ? ELSE post_count END,
             points = CASE WHEN ? IS NOT NULL THEN ? ELSE points END,
             vitality = CASE WHEN ? IS NOT NULL THEN ? ELSE vitality END,
             last_login = CASE WHEN ? IS NOT NULL THEN ? ELSE last_login END,
             last_ip = CASE WHEN ? IS NOT NULL THEN ? ELSE last_ip END,
             status = CASE WHEN ? IS NOT NULL THEN ? ELSE status END,
             is_online = CASE WHEN ? IS NOT NULL THEN ? ELSE is_online END,
             follow_num = CASE WHEN ? IS NOT NULL THEN ? ELSE follow_num END,
             fans_num = CASE WHEN ? IS NOT NULL THEN ? ELSE fans_num END
           WHERE uid = ?`,
        )
        .run(...params);
    }
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
   *
   * docs/06 用户体系重构：接收展开的 UserProfile 字段（含 is_manager），逐列写；
   * 不再塞整个 profile JSON。
   *
   * @param user { uid, name, isAnon?, profile?, profileFetchedAt? }
   *             profile 存在时展开写入各独立字段（等级/积分等覆盖更新）
   */
  upsertUser(user: {
    uid: string;
    name: string;
    isAnon?: boolean;
    profile?: unknown | null;
    profileFetchedAt?: string | null;
  }): number {
    const now = new Date().toISOString();
    const p = (user.profile ?? null) as (Record<string, unknown> & {
      avatar?: string; gender?: string; constellation?: string;
      qq?: string; msn?: string; homepage?: string; level?: string;
      title?: string[]; postCount?: string; points?: string; vitality?: string;
      lastLogin?: string; lastIp?: string; onlineStatus?: string;
      isOnline?: boolean; followNum?: number; fansNum?: number;
    }) | null;
    const fetchedAt = user.profileFetchedAt ?? (p ? now : null);

    const num = (v: unknown): number | null => {
      if (v == null || v === "") return null;
      const n = Number(String(v).replace(/[^\d-]/g, ""));
      return Number.isNaN(n) ? null : n;
    };
    const titleJson = p?.title && p.title.length > 0 ? JSON.stringify(p.title) : null;

    // 首次插入带 profile；已存在则仅当带 profile 时覆盖（避免基础身份 upsert 清掉资料）
    this.db
      .prepare(
        `INSERT INTO user
           (uid, name, is_anon, avatar, gender, constellation, qq, msn, homepage,
            level, title, post_count, points, vitality, last_login, last_ip, status,
            is_online, follow_num, fans_num, is_manager, profile_fetched_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(uid) DO UPDATE SET
           -- 仅当传入 name 非 uid 回退时才覆盖（列表页 authorRaw 常为真实昵称；
           -- 但裸身份 upsert 若只有 uid 回退名，保留已有的更完整昵称）
           name = CASE WHEN excluded.name = excluded.uid THEN user.name ELSE excluded.name END,
           avatar = COALESCE(excluded.avatar, user.avatar),
           gender = COALESCE(excluded.gender, user.gender),
           constellation = COALESCE(excluded.constellation, user.constellation),
           qq = COALESCE(excluded.qq, user.qq),
           msn = COALESCE(excluded.msn, user.msn),
           homepage = COALESCE(excluded.homepage, user.homepage),
           level = COALESCE(excluded.level, user.level),
           title = COALESCE(excluded.title, user.title),
           post_count = COALESCE(excluded.post_count, user.post_count),
           points = COALESCE(excluded.points, user.points),
           vitality = COALESCE(excluded.vitality, user.vitality),
           last_login = COALESCE(excluded.last_login, user.last_login),
           last_ip = COALESCE(excluded.last_ip, user.last_ip),
           status = COALESCE(excluded.status, user.status),
           is_online = COALESCE(excluded.is_online, user.is_online),
           follow_num = COALESCE(excluded.follow_num, user.follow_num),
           fans_num = COALESCE(excluded.fans_num, user.fans_num),
           is_manager = MAX(user.is_manager, excluded.is_manager),
           updated_at = excluded.updated_at`,
      )
      .run(
        user.uid,
        user.name,
        user.isAnon ? 1 : 0,
        p?.avatar ?? null,
        p?.gender ?? null,
        p?.constellation ?? null,
        p?.qq ?? null,
        p?.msn ?? null,
        p?.homepage ?? null,
        p?.level ?? null,
        titleJson,
        num(p?.postCount),
        num(p?.points),
        num(p?.vitality),
        p?.lastLogin ?? null,
        p?.lastIp ?? null,
        p?.onlineStatus ?? null,
        p?.isOnline ? 1 : 0,
        p?.followNum ?? 0,
        p?.fansNum ?? 0,
        0, // is_manager：init 版主落库用 upsertUserProfile 单独置位
        fetchedAt,
        now,
      );
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

  /**
   * 写入新的 Thread 聚合模型。
   *
   * 与旧 saveThread 保持并存：旧调用方仍使用扁平 Post；新 Controller 使用
   * Thread/ArticleNode，并在写入时把 ArticleNode.parentId 映射为 post 表的整数主键。
   */
  saveThreadModel(thread: Thread): number {
    return transaction(this.db, () => {
      this.upsertBoard(thread.boardEname, thread.boardEname, false);

      const nodes = flattenArticleNodes(thread.root);

      const authors = new Map<string, { uid: string; name: string }>();
      if (thread.overview.author) {
        authors.set(thread.overview.author.uid, {
          uid: thread.overview.author.uid,
          name: thread.overview.author.displayName,
        });
      }
      if (thread.overview.lastReplier) {
        authors.set(thread.overview.lastReplier.uid, {
          uid: thread.overview.lastReplier.uid,
          name: thread.overview.lastReplier.displayName,
        });
      }
      for (const node of nodes) {
        if (node.author) {
          authors.set(node.author.uid, {
            uid: node.author.uid,
            name: node.author.displayName,
          });
        }
      }
      const uidMap = this.upsertUsers([...authors.values()]);
      const overview = thread.overview;
      const now = new Date().toISOString();
      const urlHash = hashUrl(overview.url);
      this.db
        .prepare(
          `INSERT INTO article
             (board_ename, title, url, author_uid, is_pinned, date, reply_count, last_reply,
              last_replier_uid, crawled_at, updated_at, url_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(url_hash) DO UPDATE SET
             title = excluded.title,
             author_uid = excluded.author_uid,
             is_pinned = excluded.is_pinned,
             date = excluded.date,
             reply_count = excluded.reply_count,
             last_reply = excluded.last_reply,
             last_replier_uid = excluded.last_replier_uid,
             updated_at = excluded.updated_at`,
        )
        .run(
          overview.boardEname,
          overview.title,
          overview.url,
          overview.author ? (uidMap.get(overview.author.uid) ?? null) : null,
          overview.isPinned ? 1 : 0,
          overview.date,
          overview.replyCount,
          overview.lastReplyAt ?? "",
          overview.lastReplier ? (uidMap.get(overview.lastReplier.uid) ?? null) : null,
          now,
          now,
          urlHash,
        );
      const articleRow = this.db
        .prepare(`SELECT id FROM article WHERE url_hash = ?`)
        .get(urlHash) as { id: number } | undefined;
      if (!articleRow) return 0;

      const postIds = new Map<string, number>();
      const insertPost = this.db.prepare(
        `INSERT INTO post
           (article_id, parent_id, floor, kind, author_uid, author_raw, is_anon,
            content, images, post_time, crawled_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(article_id, kind, floor) DO UPDATE SET
           parent_id = excluded.parent_id,
           author_uid = excluded.author_uid,
           author_raw = excluded.author_raw,
           is_anon = excluded.is_anon,
           content = excluded.content,
           images = excluded.images,
           post_time = excluded.post_time,
           crawled_at = excluded.crawled_at`,
      );
      for (const node of nodes) {
        const parentDbId = node.parentId ? (postIds.get(node.parentId) ?? null) : null;
        insertPost.run(
          articleRow.id,
          parentDbId,
          node.forumFloor,
          node.kind,
          node.author ? (uidMap.get(node.author.uid) ?? null) : null,
          node.authorRaw,
          node.isAnonymous ? 1 : 0,
          node.content,
          JSON.stringify(node.images),
          node.postedAt,
          now,
        );
        const postRow = this.db
          .prepare(`SELECT id FROM post WHERE article_id = ? AND kind = ? AND floor = ?`)
          .get(articleRow.id, node.kind, node.forumFloor) as { id: number } | undefined;
        if (postRow) postIds.set(node.id, postRow.id);
      }
      return articleRow.id;
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
         `SELECT p.*, parent.floor AS parent_floor, u.uid AS author_uid_str
          FROM post p
          LEFT JOIN post parent ON parent.id = p.parent_id
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

  // ════════════ 用户资料（docs/06 §5） ════════════

  /**
   * 覆盖写入用户完整资料（L2，query.json + tquery 合并后的 UserProfile）。
   *
   * docs/06 用户体系重构：profile 拆成独立字段逐列写，不再存 JSON。
   * 等级/积分会变，覆盖更新。uid 可能不在 user 表（批量工具从外部传入的 uid），
   * 用 UPSERT 独立建行，name 回退为 uid。
   */
  upsertUserProfile(uid: string, profile: unknown, fetchedAt = new Date().toISOString()): void {
    const p = profile as (Record<string, unknown> & {
      nickname?: string; avatar?: string; gender?: string; constellation?: string;
      qq?: string; msn?: string; homepage?: string; level?: string;
      title?: string[]; postCount?: string; points?: string; vitality?: string;
      lastLogin?: string; lastIp?: string; onlineStatus?: string;
      isOnline?: boolean; followNum?: number; fansNum?: number;
    }) | null | undefined;
    const name = p?.nickname || uid;
    const titleJson = p?.title && p.title.length > 0 ? JSON.stringify(p.title) : null;
    const num = (v: unknown): number | null => {
      if (v == null || v === "") return null;
      const n = Number(String(v).replace(/[^\d-]/g, ""));
      return Number.isNaN(n) ? null : n;
    };

    this.db
      .prepare(
        `INSERT INTO user
           (uid, name, is_anon, avatar, gender, constellation, qq, msn, homepage,
            level, title, post_count, points, vitality, last_login, last_ip, status,
            is_online, follow_num, fans_num, updated_at, profile_fetched_at)
         VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(uid) DO UPDATE SET
           name = excluded.name,
           avatar = COALESCE(excluded.avatar, user.avatar),
           gender = COALESCE(excluded.gender, user.gender),
           constellation = COALESCE(excluded.constellation, user.constellation),
           qq = COALESCE(excluded.qq, user.qq),
           msn = COALESCE(excluded.msn, user.msn),
           homepage = COALESCE(excluded.homepage, user.homepage),
           level = COALESCE(excluded.level, user.level),
           title = COALESCE(excluded.title, user.title),
           post_count = COALESCE(excluded.post_count, user.post_count),
           points = COALESCE(excluded.points, user.points),
           vitality = COALESCE(excluded.vitality, user.vitality),
           last_login = COALESCE(excluded.last_login, user.last_login),
           last_ip = COALESCE(excluded.last_ip, user.last_ip),
           status = COALESCE(excluded.status, user.status),
           is_online = COALESCE(excluded.is_online, user.is_online),
           follow_num = COALESCE(excluded.follow_num, user.follow_num),
           fans_num = COALESCE(excluded.fans_num, user.fans_num),
           updated_at = excluded.updated_at,
           profile_fetched_at = excluded.profile_fetched_at`,
      )
      .run(
        uid, name,
        p?.avatar ?? null,
        p?.gender ?? null,
        p?.constellation ?? null,
        p?.qq ?? null,
        p?.msn ?? null,
        p?.homepage ?? null,
        p?.level ?? null,
        titleJson,
        num(p?.postCount),
        num(p?.points),
        num(p?.vitality),
        p?.lastLogin ?? null,
        p?.lastIp ?? null,
        p?.onlineStatus ?? null,
        p?.isOnline ? 1 : 0,
        p?.followNum ?? 0,
        p?.fansNum ?? 0,
        new Date().toISOString(),
        fetchedAt,
      );
  }

  /** 标记用户为版主（is_manager=1） */
  setUserManager(uid: string): void {
    this.db
      .prepare(`UPDATE user SET is_manager = 1, updated_at = ? WHERE uid = ?`)
      .run(new Date().toISOString(), uid);
  }

  /** 查询用户是否为版主 */
  isManager(uid: string): boolean {
    const row = this.db
      .prepare(`SELECT is_manager FROM user WHERE uid = ?`)
      .get(uid) as { is_manager: number } | undefined;
    return row ? !!row.is_manager : false;
  }

  /** 读取用户资料（逐列组装 UserProfile；无该用户/无资料返回 null） */
  getUserProfile(uid: string): unknown | null {
    const row = this.db
      .prepare(`SELECT * FROM user WHERE uid = ?`)
      .get(uid) as
      | {
          uid: string;
          name: string;
          is_anon: number;
          avatar: string | null;
          gender: string | null;
          constellation: string | null;
          qq: string | null;
          msn: string | null;
          homepage: string | null;
          level: string | null;
          title: string | null;
          post_count: number | null;
          points: number | null;
          vitality: number | null;
          last_login: string | null;
          last_ip: string | null;
          status: string | null;
          is_online: number;
          follow_num: number;
          fans_num: number;
          is_manager: number;
          profile_fetched_at: string | null;
        }
      | undefined;
    if (!row) return null;

    let title: string[] = [];
    if (row.title) {
      try {
        const parsed = JSON.parse(row.title);
        if (Array.isArray(parsed)) title = parsed as string[];
      } catch {
        title = [];
      }
    }

    return {
      uid: row.uid,
      nickname: row.name,
      gender: row.gender ?? "",
      constellation: row.constellation ?? "",
      qq: row.qq ?? "",
      msn: row.msn ?? "",
      homepage: row.homepage ?? "",
      avatar: row.avatar ?? "",
      level: row.level ?? "",
      title,
      postCount: row.post_count != null ? `${row.post_count}篇` : "",
      points: row.points != null ? String(row.points) : "",
      vitality: row.vitality != null ? String(row.vitality) : "",
      lastLogin: row.last_login ?? "",
      lastIp: row.last_ip ?? "",
      onlineStatus: row.status ?? "",
      isOnline: !!row.is_online,
      followNum: row.follow_num ?? 0,
      fansNum: row.fans_num ?? 0,
      fetchedAt: row.profile_fetched_at ?? new Date().toISOString(),
    };
  }

  /** 用户资料抓取时间（profile_fetched_at；无则 null，供 TTL 判断） */
  getUserProfileFetchedAt(uid: string): string | null {
    const row = this.db
      .prepare(`SELECT profile_fetched_at FROM user WHERE uid = ?`)
      .get(uid) as { profile_fetched_at: string | null } | undefined;
    return row ? row.profile_fetched_at : null;
  }

  /** 全部真实 uid（含资料状态），供批量抓取工具收集目标；匿名占位名不入 user 表故无需过滤 */
  getAllUserUids(): string[] {
    const rows = this.db
      .prepare(`SELECT uid FROM user ORDER BY uid ASC`)
      .all() as unknown as Array<{ uid: string }>;
    return rows.map((r) => r.uid);
  }

  /** 全部 uid + profile_fetched_at（供头衔全量更新 TTL 判断；无资料也含，其 fetched_at 为 null） */
  getAllUserUidsWithFetchedAt(): Array<{ uid: string; profileFetchedAt: string | null }> {
    const rows = this.db
      .prepare(`SELECT uid, profile_fetched_at FROM user ORDER BY uid ASC`)
      .all() as unknown as Array<{ uid: string; profile_fetched_at: string | null }>;
    return rows.map((r) => ({ uid: r.uid, profileFetchedAt: r.profile_fetched_at }));
  }

  /**
   * 用户 ↔ 帖子/评论 关联查询（docs/06 §6.2，复用外键，不新增工具）。
   *
   * uid → user.id → article.author_uid / post.author_uid → 该用户全部发帖与楼层。
   *
   * @returns 用户全部发言：文章（kind=article）与评论（kind=reply）
   */
  getUserThreads(
    uid: string,
    opts: { boardEname?: string; limit?: number } = {},
  ): Array<{
    boardEname: string;
    articleTitle: string;
    articleUrl: string;
    floor: number;
    kind: "article" | "reply";
    postTime: string | null;
    content: string;
  }> {
    const userId = this.getUserId(uid);
    if (!userId) return [];

    let sql = `
      SELECT a.board_ename, a.title AS article_title, a.url AS article_url,
             p.floor, p.kind, p.post_time, p.content
      FROM post p
      JOIN article a ON a.id = p.article_id
      WHERE p.author_uid = ?
    `;
    const params: (string | number)[] = [userId];
    if (opts.boardEname) {
      sql += ` AND a.board_ename = ?`;
      params.push(opts.boardEname);
    }
    sql += ` ORDER BY p.post_time DESC`;
    if (opts.limit) {
      sql += ` LIMIT ?`;
      params.push(opts.limit);
    }
    const rows = this.db.prepare(sql).all(...params) as unknown as Array<{
      board_ename: string;
      article_title: string;
      article_url: string;
      floor: number;
      kind: "article" | "reply";
      post_time: string | null;
      content: string;
    }>;
    return rows.map((r) => ({
      boardEname: r.board_ename,
      articleTitle: r.article_title,
      articleUrl: r.article_url,
      floor: r.floor,
      kind: r.kind,
      postTime: r.post_time,
      content: r.content,
    }));
  }

  // ════════════ 本地搜索（缓存命中：先查库，再决定是否联网） ════════════

  /**
   * 本地搜索文章（article 表，标题 LIKE 匹配）。
   *
   * 缓存命中路径：之前搜索/抓取落库过的文章，从这里秒回，无需联网、无需登录。
   *
   * @param keyword 关键字（LIKE 通配符自动包裹，大小写不敏感）
   * @param opts    { boardEname? 限定版面；limit? 返回上限 }
   * @returns 命中文章行（含版块/标题/url/作者/日期/回复数）
   */
  searchArticles(
    keyword: string,
    opts: { boardEname?: string; limit?: number } = {},
  ): ArticleRow[] {
    let sql = `
      SELECT a.board_ename, a.title, a.url, u.name AS author_raw,
             u.uid AS author_uid, a.is_pinned, a.date, a.reply_count,
             a.last_reply, u2.uid AS last_replier_uid, a.crawled_at
      FROM article a
      LEFT JOIN user u ON u.id = a.author_uid
      LEFT JOIN user u2 ON u2.id = a.last_replier_uid
      WHERE a.title LIKE ?
    `;
    const params: (string | number)[] = [`%${keyword}%`];
    if (opts.boardEname) {
      sql += ` AND a.board_ename = ?`;
      params.push(opts.boardEname);
    }
    sql += ` ORDER BY a.crawled_at DESC`;
    if (opts.limit) {
      sql += ` LIMIT ?`;
      params.push(opts.limit);
    }
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

  /**
   * 本地搜索帖子正文（post 表，content LIKE 匹配）。
   *
   * 缓存命中路径：之前抓取落库过的帖子正文，从这里秒回。
   *
   * @param keyword 关键字
   * @param opts    { boardEname? 限定版面；limit? 返回上限 }
   * @returns 命中楼层（含所属文章标题/url、楼层号、正文、作者）
   */
  searchThreadsContent(
    keyword: string,
    opts: { boardEname?: string; limit?: number } = {},
  ): Array<{
    boardEname: string;
    articleTitle: string;
    articleUrl: string;
    floor: number;
    kind: "article" | "reply";
    authorRaw: string;
    content: string;
    postTime: string | null;
  }> {
    let sql = `
      SELECT a.board_ename, a.title AS article_title, a.url AS article_url,
             p.floor, p.kind, p.author_raw, p.content, p.post_time
      FROM post p
      JOIN article a ON a.id = p.article_id
      WHERE p.content LIKE ?
    `;
    const params: (string | number)[] = [`%${keyword}%`];
    if (opts.boardEname) {
      sql += ` AND a.board_ename = ?`;
      params.push(opts.boardEname);
    }
    sql += ` ORDER BY p.crawled_at DESC`;
    if (opts.limit) {
      sql += ` LIMIT ?`;
      params.push(opts.limit);
    }
    const rows = this.db.prepare(sql).all(...params) as unknown as Array<{
      board_ename: string;
      article_title: string;
      article_url: string;
      floor: number;
      kind: "article" | "reply";
      author_raw: string;
      content: string;
      post_time: string | null;
    }>;
    return rows.map((r) => ({
      boardEname: r.board_ename,
      articleTitle: r.article_title,
      articleUrl: r.article_url,
      floor: r.floor,
      kind: r.kind,
      authorRaw: r.author_raw,
      content: r.content,
      postTime: r.post_time,
    }));
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
    parentId: r.parent_floor ?? null,
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
