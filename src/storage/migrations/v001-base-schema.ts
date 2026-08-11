import type { DatabaseSync } from "node:sqlite";

/**
 * v1 — 基础 schema：board / user / article / post 建表 + 索引。
 *
 * 幂等（CREATE TABLE/INDEX IF NOT EXISTS），兼容旧库首次升级直接跳过重复结构。
 * FTS 虚拟表不在此建：它是可降级的加速器，归 FtsIndex（见 content/fts-index.ts）。
 */
export function migrateV001(db: DatabaseSync): void {
  db.exec(`
    -- ── board：版块（含匿名标记） ──
    CREATE TABLE IF NOT EXISTS board (
      ename        TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      is_anonymous BOOLEAN NOT NULL DEFAULT 0
    );

    -- ── user：作者身份（uid 唯一，供 INSERT OR IGNORE 去重） ──
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
      profile_fetched_at  TEXT,
      updated_at          TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_user_is_anon ON user (is_anon);

    -- ── article：文章元数据（url_hash 唯一） ──
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

    -- ── post：正文+评论（复合唯一去重） ──
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
  `);
}
