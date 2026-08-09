import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ContentDb } from "../../src/storage/content-db.js";

/** 早期版本 user 表（含 profile JSON 列）的建表 SQL */
const LEGACY_USER_DDL = `
  CREATE TABLE user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    is_anon BOOLEAN NOT NULL DEFAULT 0,
    avatar TEXT, gender TEXT, constellation TEXT, qq TEXT, msn TEXT, homepage TEXT,
    level TEXT, title TEXT, post_count INTEGER, points INTEGER, vitality INTEGER,
    last_login TEXT, last_ip TEXT, status TEXT, is_online BOOLEAN NOT NULL DEFAULT 0,
    follow_num INTEGER NOT NULL DEFAULT 0, fans_num INTEGER NOT NULL DEFAULT 0,
    is_manager BOOLEAN NOT NULL DEFAULT 0,
    profile TEXT,
    profile_fetched_at TEXT,
    updated_at TEXT
  )
`;

describe("storage — user.profile 列删除迁移", () => {
  let tmpFile: string;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `content-db-profile-drop-${process.pid}-${Math.random().toString(36).slice(2)}.db`);
  });

  afterEach(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  it("旧 profile JSON 迁移到独立列，并删除 profile 列", () => {
    // 手工造旧库：含 profile 列 + 旧 JSON 数据
    const raw = new DatabaseSync(tmpFile);
    raw.exec(LEGACY_USER_DDL);
    raw
      .prepare(`INSERT INTO user (uid, name, profile) VALUES (?, ?, ?)`)
      .run("user_a", "旧名", JSON.stringify({ nickname: "新昵称", gender: "男生", level: "用户", points: "8" }));
    raw.close();

    // 打开 ContentDb → 触发迁移 + 删列
    const db = new ContentDb(tmpFile);
    db.close();

    // 用原始连接验证：profile 列已删除、独立列已迁移
    const verify = new DatabaseSync(tmpFile, { readOnly: true });
    try {
      const cols = (verify.prepare(`PRAGMA table_info(user)`).all() as Array<{ name: string }>).map((c) => c.name);
      expect(cols).not.toContain("profile");
      expect(cols).toContain("gender");
      expect(cols).toContain("level");

      const row = verify
        .prepare(`SELECT name, gender, level, points FROM user WHERE uid = ?`)
        .get("user_a") as { name: string; gender: string; level: string; points: number };
      expect(row).toEqual({ name: "新昵称", gender: "男生", level: "用户", points: 8 });
    } finally {
      verify.close();
    }
  });

  it("新库不创建 profile 列", () => {
    const db = new ContentDb(tmpFile);
    db.close();
    const verify = new DatabaseSync(tmpFile, { readOnly: true });
    try {
      const cols = (verify.prepare(`PRAGMA table_info(user)`).all() as Array<{ name: string }>).map((c) => c.name);
      expect(cols).not.toContain("profile");
    } finally {
      verify.close();
    }
  });
});
