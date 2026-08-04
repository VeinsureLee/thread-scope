import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readJson, writeJson } from "../../src/storage/store.js";
import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");

function cleanDataDir() {
  if (fs.existsSync(DATA_DIR)) {
    const files = fs.readdirSync(DATA_DIR);
    for (const f of files) {
      fs.unlinkSync(path.join(DATA_DIR, f));
    }
  }
}

describe("JSON 存储 (store)", () => {
  beforeEach(() => {
    cleanDataDir();
  });

  afterEach(() => {
    cleanDataDir();
  });

  it("writeJson 写入并 readJson 读回", () => {
    writeJson("test.json", { hello: "world" });
    const data = readJson<{ hello: string }>("test.json");
    expect(data).toEqual({ hello: "world" });
  });

  it("readJson 对不存在的文件返回 null", () => {
    const data = readJson("nonexistent.json");
    expect(data).toBeNull();
  });

  it("writeJson 覆盖已有文件", () => {
    writeJson("test.json", { version: 1 });
    writeJson("test.json", { version: 2 });
    const data = readJson<{ version: number }>("test.json");
    expect(data).toEqual({ version: 2 });
  });

  it("readJson 对损坏的 JSON 返回 null", () => {
    const dir = path.resolve(process.cwd(), "data");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "corrupt.json"), "{ not valid json", "utf-8");
    const data = readJson("corrupt.json");
    expect(data).toBeNull();
    fs.unlinkSync(path.join(dir, "corrupt.json"));
  });

  it("writeJson 写入数组", () => {
    writeJson("arr.json", [1, 2, 3]);
    const data = readJson<number[]>("arr.json");
    expect(data).toEqual([1, 2, 3]);
  });

  it("writeJson 写入嵌套结构", () => {
    const forum = {
      sections: [{ id: "1", name: "校园板块", boards: [{ name: "example" }] }],
    };
    writeJson("structure.json", forum);
    const data = readJson<typeof forum>("structure.json");
    expect(data).toEqual(forum);
  });
});
