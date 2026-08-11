import type { DatabaseSync } from "node:sqlite";

/**
 * 用户域仓储：作者身份 + 资料（user 表）。
 * 无跨域依赖；SQL 与行类型集中在 user 域内。
 */
export class UserRepo {
  constructor(private db: DatabaseSync) {}

  /** 查询用户的 uid → 数据库 user id */
  getUserId(uid: string): number | null {
    const row = this.db.prepare(`SELECT id FROM user WHERE uid = ?`).get(uid) as { id: number } | undefined;
    return row ? row.id : null;
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
}
