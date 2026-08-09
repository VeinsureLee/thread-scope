import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { TrafficDb } from "../../src/storage/traffic-db.js";
import type { TrafficInfo } from "../../src/model/dto/index.js";

/** 构造测试用 TrafficInfo */
function rec(ename: string, name: string, o: string, t: string, th: string, p: string): TrafficInfo {
  return { ename, name, onlineUsers: o, todayPosts: t, threads: th, posts: p };
}

describe("TrafficDb（node:sqlite 快照+历史）", () => {
  let tmpFile: string;
  let db: TrafficDb;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `traffic-db-test-${process.pid}-${Math.random().toString(36).slice(2)}.db`);
    db = new TrafficDb(tmpFile);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  it("insert 后 getLatest 返回该版面最新值", () => {
    db.insert("b1", "版块一", rec("b1", "版块一", "1", "2", "100", "200"), "2026-08-06T00:00:00.000Z");
    db.insert("b1", "版块一", rec("b1", "版块一", "5", "8", "150", "300"), "2026-08-06T01:00:00.000Z");

    const latest = db.getLatest("b1");
    expect(latest).not.toBeNull();
    expect(latest!.onlineUsers).toBe("5");
    expect(latest!.todayPosts).toBe("8");
    expect(latest!.threads).toBe("150");
    expect(latest!.posts).toBe("300");
  });

  it("insertBatch 批量写入，getLatestAll 每版面一行", () => {
    const records = [
      rec("b1", "版块一", "1", "2", "100", "200"),
      rec("b2", "版块二", "3", "4", "50", "60"),
    ];
    db.insertBatch(records, "2026-08-06T00:00:00.000Z");

    const all = db.getLatestAll();
    expect(all).toHaveLength(2);
    const byEname = new Map(all.map((r) => [r.ename, r]));
    expect(byEname.get("b1")!.posts).toBe("200");
    expect(byEname.get("b2")!.posts).toBe("60");
  });

  it("getLatestAll 对同一版面多次采样只取最新", () => {
    db.insert("b1", "版块一", rec("b1", "版块一", "1", "2", "100", "200"), "2026-08-06T00:00:00.000Z");
    db.insert("b1", "版块一", rec("b1", "版块一", "9", "9", "999", "999"), "2026-08-06T02:00:00.000Z");

    const all = db.getLatestAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.onlineUsers).toBe("9");
  });

  it("getLatest 无记录返回 null", () => {
    expect(db.getLatest("nope")).toBeNull();
  });

  it("queryHistory 按时间升序返回全部采样", () => {
    db.insert("b1", "版块一", rec("b1", "版块一", "1", "2", "100", "200"), "2026-08-06T00:00:00.000Z");
    db.insert("b1", "版块一", rec("b1", "版块一", "5", "8", "150", "300"), "2026-08-06T01:00:00.000Z");
    db.insert("b1", "版块一", rec("b1", "版块一", "7", "9", "170", "320"), "2026-08-06T02:00:00.000Z");

    const hist = db.queryHistory("b1");
    expect(hist).toHaveLength(3);
    expect(hist[0]!.onlineUsers).toBe(1);
    expect(hist[1]!.onlineUsers).toBe(5);
    expect(hist[2]!.onlineUsers).toBe(7);
    // 升序
    expect(hist[0]!.crawledAt < hist[1]!.crawledAt).toBe(true);
  });

  it("queryHistory 支持时间范围与 limit", () => {
    db.insert("b1", "版块一", rec("b1", "版块一", "1", "2", "100", "200"), "2026-08-06T00:00:00.000Z");
    db.insert("b1", "版块一", rec("b1", "版块一", "5", "8", "150", "300"), "2026-08-06T01:00:00.000Z");
    db.insert("b1", "版块一", rec("b1", "版块一", "7", "9", "170", "320"), "2026-08-06T02:00:00.000Z");

    const inRange = db.queryHistory("b1", { from: "2026-08-06T00:30:00.000Z", to: "2026-08-06T01:30:00.000Z" });
    expect(inRange).toHaveLength(1);
    expect(inRange[0]!.onlineUsers).toBe(5);

    const limited = db.queryHistory("b1", { limit: 2 });
    expect(limited).toHaveLength(2);
  });

  it("空值字符串转为 0 存储", () => {
    db.insert("b1", "版块一", rec("b1", "版块一", "", "", "", ""), "2026-08-06T00:00:00.000Z");
    const latest = db.getLatest("b1")!;
    expect(latest.onlineUsers).toBe("0");
    expect(latest.posts).toBe("0");
  });
});
