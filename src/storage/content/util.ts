import { createHash } from "crypto";
import type { DatabaseSync } from "node:sqlite";

/** url → sha1 哈希（与 parser-kit 的 hashUrl 一致） */
export function hashUrl(url: string): string {
  return createHash("sha1").update(url).digest("hex");
}

/** 按 uid 查 user id（无则返回 null） */
export function findUserId(db: DatabaseSync, uid: string): number | null {
  const row = db
    .prepare(`SELECT id FROM user WHERE uid = ?`)
    .get(uid) as { id: number } | undefined;
  return row ? row.id : null;
}
