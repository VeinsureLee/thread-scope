import type { DatabaseSync } from "node:sqlite";

/**
 * v3 — 删除历史遗留的 user.profile JSON 列。
 *
 * profile 拆成独立字段后该列已无写入（业务只写独立列、从独立列组装），
 * 仅有旧数据残留。先 migrateProfileJson 把旧 JSON 拆进独立列（v2 已补列），
 * 再 DROP COLUMN。幂等：列不存在时跳过。
 */
export function migrateV003(db: DatabaseSync): void {
  const cols = db
    .prepare(`PRAGMA table_info(user)`)
    .all() as unknown as Array<{ name: string }>;
  const hasProfile = cols.some((c) => c.name === "profile");
  if (!hasProfile) return;
  // 旧 JSON → 独立列（须在 DROP 前完成）
  migrateProfileJson(db);
  db.exec(`ALTER TABLE user DROP COLUMN profile;`);
}

/** 旧 user.profile JSON → 独立字段（幂等：关键字段已填则跳过） */
function migrateProfileJson(db: DatabaseSync): void {
  const rows = db
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
    db.prepare(
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
    ).run(...params);
  }
}
