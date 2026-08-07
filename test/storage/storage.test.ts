import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readJson, writeJson, appendArrayEntry } from "../../src/storage/store.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// 用 tmp 目录隔离测试数据（避免与 live 测试争抢真实 data/ 目录）
let TMP_DIR = "";
function tmpPath(name: string): string {
  return path.join(TMP_DIR, name);
}

describe("JSON 存储 (store)", () => {
  beforeEach(() => {
    TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "store-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(TMP_DIR)) fs.rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("writeJson 写入并 readJson 读回", () => {
    writeJson(tmpPath("test.json"), { hello: "world" });
    const data = readJson<{ hello: string }>(tmpPath("test.json"));
    expect(data).toEqual({ hello: "world" });
  });

  it("readJson 对不存在的文件返回 null", () => {
    const data = readJson(tmpPath("nonexistent.json"));
    expect(data).toBeNull();
  });

  it("writeJson 覆盖已有文件", () => {
    writeJson(tmpPath("test.json"), { version: 1 });
    writeJson(tmpPath("test.json"), { version: 2 });
    const data = readJson<{ version: number }>(tmpPath("test.json"));
    expect(data).toEqual({ version: 2 });
  });

  it("readJson 对损坏的 JSON 返回 null", () => {
    fs.writeFileSync(tmpPath("corrupt.json"), "{ not valid json", "utf-8");
    const data = readJson(tmpPath("corrupt.json"));
    expect(data).toBeNull();
  });

  it("writeJson 写入数组", () => {
    writeJson(tmpPath("arr.json"), [1, 2, 3]);
    const data = readJson<number[]>(tmpPath("arr.json"));
    expect(data).toEqual([1, 2, 3]);
  });

  it("writeJson 写入嵌套结构", () => {
    const forum = {
      sections: [{ id: "1", name: "校园板块", boards: [{ name: "example" }] }],
    };
    writeJson(tmpPath("structure.json"), forum);
    const data = readJson<typeof forum>(tmpPath("structure.json"));
    expect(data).toEqual(forum);
  });

  it("appendArrayEntry 追加记录（append-only）", () => {
    const f = tmpPath("snap.json");
    appendArrayEntry(f, { k: 1 });
    appendArrayEntry(f, { k: 2 });
    const data = readJson<Array<{ k: number }>>(f);
    expect(data).toEqual([{ k: 1 }, { k: 2 }]);
  });
});
