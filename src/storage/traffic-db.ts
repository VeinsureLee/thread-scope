import { DatabaseSync } from "node:sqlite";
import * as fs from "fs";
import * as path from "path";
import { fromRoot } from "../core/paths.js";
import type { TrafficInfo, TrafficHistoryPoint } from "../model/dto/index.js";

/** 数据库文件路径（data/forum-traffic.db，锚定项目根） */
function dbFilePath(): string {
  const dir = fromRoot("data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "forum-traffic.db");
}

/** SQLite 存储行（snake_case，与 TS 命名不同） */
interface SnapshotRow {
  id: number;
  board_ename: string;
  board_name: string;
  crawled_at: string;
  online_users: number;
  today_posts: number;
  threads: number;
  posts: number;
}

/**
 * 流量数据库（基于 node:sqlite）。
 *
 * 职责：
 * - 持久化每次爬取的流量采样（traffic_snapshot 表）
 * - 每条采样一行 → 天然保留历史
 * - "当前值" = 每版面 crawled_at 最新的一行
 *
 * 未来可在此基础上加历史趋势查询。
 */
export class TrafficDb {
  private db: DatabaseSync;

  constructor(dbPath?: string) {
    this.db = new DatabaseSync(dbPath ?? dbFilePath());
    // 与 ContentDb 一致：WAL 模式，写采样与查询读不互斥
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS traffic_snapshot (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        board_ename  TEXT NOT NULL,
        board_name   TEXT NOT NULL,
        crawled_at   TEXT NOT NULL,
        online_users INTEGER NOT NULL DEFAULT 0,
        today_posts  INTEGER NOT NULL DEFAULT 0,
        threads      INTEGER NOT NULL DEFAULT 0,
        posts        INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_traffic_board_time
        ON traffic_snapshot (board_ename, crawled_at);
    `);
  }

  /** 写入一次采样（返回插入行 id） */
  insert(
    ename: string,
    name: string,
    traffic: TrafficInfo,
    crawledAt: string,
  ): number {
    const stmt = this.db.prepare(`
      INSERT INTO traffic_snapshot
        (board_ename, board_name, crawled_at, online_users, today_posts, threads, posts)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const res = stmt.run(
      ename,
      name,
      crawledAt,
      toInt(traffic.onlineUsers),
      toInt(traffic.todayPosts),
      toInt(traffic.threads),
      toInt(traffic.posts),
    );
    return Number(res.lastInsertRowid);
  }

  /** 批量写入一次采样（同一 crawled_at） */
  insertBatch(
    records: TrafficInfo[],
    crawledAt: string,
  ): { inserted: number; skipped: number } {
    let inserted = 0;
    let skipped = 0;
    for (const rec of records) {
      if (!rec.ename || !rec.name) {
        skipped++;
        continue;
      }
      this.insert(rec.ename, rec.name, rec, crawledAt);
      inserted++;
    }
    return { inserted, skipped };
  }

  /** 获取所有版面的最新流量（每版面一行，按 ename 排序） */
  getLatestAll(): TrafficInfo[] {
    const rows = this.db
      .prepare(`
        SELECT t.*
        FROM traffic_snapshot t
        JOIN (
          SELECT board_ename, MAX(id) AS max_id
          FROM traffic_snapshot
          GROUP BY board_ename
        ) latest ON latest.board_ename = t.board_ename AND latest.max_id = t.id
        ORDER BY t.board_ename
      `)
      .all() as unknown as SnapshotRow[];
    return rows.map(rowToTrafficInfo);
  }

  /** 获取单版面最新流量；无记录返回 null */
  getLatest(ename: string): TrafficInfo | null {
    const rows = this.db
      .prepare(`
        SELECT * FROM traffic_snapshot
        WHERE board_ename = ?
        ORDER BY id DESC
        LIMIT 1
      `)
      .all(ename) as unknown as SnapshotRow[];
    return rows.length > 0 ? rowToTrafficInfo(rows[0]!) : null;
  }

  /** 查询单版面历史流量（按时间升序），可限定时间范围 */
  queryHistory(
    ename: string,
    opts: { from?: string; to?: string; limit?: number } = {},
  ): TrafficHistoryPoint[] {
    let sql = `
      SELECT crawled_at, online_users, today_posts, threads, posts
      FROM traffic_snapshot
      WHERE board_ename = ?
    `;
    const params: (string | number)[] = [ename];
    if (opts.from) {
      sql += ` AND crawled_at >= ?`;
      params.push(opts.from);
    }
    if (opts.to) {
      sql += ` AND crawled_at <= ?`;
      params.push(opts.to);
    }
    sql += ` ORDER BY crawled_at ASC`;
    if (opts.limit) {
      sql += ` LIMIT ?`;
      params.push(opts.limit);
    }
    const rows = this.db.prepare(sql).all(...params) as unknown as Array<{
      crawled_at: string;
      online_users: number;
      today_posts: number;
      threads: number;
      posts: number;
    }>;
    return rows.map((r) => ({
      crawledAt: r.crawled_at,
      onlineUsers: r.online_users,
      todayPosts: r.today_posts,
      threads: r.threads,
      posts: r.posts,
    }));
  }

  /** 维护统计：采样行数 + 采样时间区间（维护脚本输出用） */
  stats(): { snapshots: number; earliest: string | null; latest: string | null } {
    const agg = this.db
      .prepare(
        `SELECT count(*) AS c, MIN(crawled_at) AS min_t, MAX(crawled_at) AS max_t FROM traffic_snapshot`,
      )
      .get() as { c: number; min_t: string | null; max_t: string | null };
    return { snapshots: agg.c, earliest: agg.min_t, latest: agg.max_t };
  }

  /** 关闭连接 */
  close(): void {
    this.db.close();
  }
}

/** 字符串数字 → int（空串/非法 → 0） */
function toInt(s: string): number {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

/** SQLite 行 → TrafficInfo */
function rowToTrafficInfo(r: SnapshotRow): TrafficInfo {
  return {
    ename: r.board_ename,
    name: r.board_name,
    onlineUsers: String(r.online_users),
    todayPosts: String(r.today_posts),
    threads: String(r.threads),
    posts: String(r.posts),
  };
}
