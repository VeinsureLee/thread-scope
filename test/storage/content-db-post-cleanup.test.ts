import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ContentDb } from "../../src/storage/content-db.js";

// 合成脏帖（早期原始块格式：头部 + 正文 + 来源尾部）
const DIRTY_CONTENT =
  "发信人: user_a (), 信区: Demo\n" +
  "标  题: 示例帖\n" +
  "发信站: 示例论坛 (Thu Oct 19 11:04:35 2017), 站内\n\n" +
  "这是示例正文\n" +
  "--\n" +
  "※ 来源:·示例论坛手机客户端 bbs.example.cn·[FROM: 1.2.3.*]";

describe("storage — 帖子正文清洗迁移 + client/ip 持久化", () => {
  let tmpFile: string;
  let db: ContentDb;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `content-db-cleanup-test-${process.pid}-${Math.random().toString(36).slice(2)}.db`);
    db = new ContentDb(tmpFile);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  it("saveThread 持久化 client/ip，searchThreadsContent 返回", () => {
    db.upsertBoard("Demo", "示例版", false);
    db.saveThread(
      "Demo",
      { url: "/article/Demo/5001", title: "示例帖" },
      [],
      {
        floor: 1, kind: "article", authorUid: null, authorRaw: "a",
        isAnon: false, content: "这是示例正文", images: [], postTime: "2026-01-01T10:00:00",
        client: "手机客户端", ip: "1.2.3.*", posText: "楼主",
      },
      [],
    );
    const hits = db.searchThreadsContent("示例");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.content).toBe("这是示例正文");
    expect(hits[0]!.client).toBe("手机客户端");
    expect(hits[0]!.ip).toBe("1.2.3.*");
  });

  it("旧帖清洗：重开连接后 content 去头去尾 + 提取 client/ip + FTS 重建", () => {
    db.upsertBoard("Demo", "示例版", false);
    db.saveThread(
      "Demo",
      { url: "/article/Demo/5002", title: "示例帖" },
      [],
      {
        floor: 1, kind: "article", authorUid: null, authorRaw: "a",
        isAnon: false, content: DIRTY_CONTENT, images: [], postTime: null, posText: "楼主",
      },
      [],
    );
    db.close();
    db = new ContentDb(tmpFile); // 重开 → cleanLegacyPosts

    const hits = db.searchThreadsContent("示例");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.content).toBe("这是示例正文"); // 头部/尾部剥离
    expect(hits[0]!.content).not.toContain("发信人:");
    expect(hits[0]!.client).toBe("手机客户端");
    expect(hits[0]!.ip).toBe("1.2.3.*");
    expect(hits[0]!.postTime).toBe("2017-10-19T11:04:35"); // 头部时间仍提取

    // 幂等：再次重开不重复清洗
    db.close();
    db = new ContentDb(tmpFile);
    const hits2 = db.searchThreadsContent("示例");
    expect(hits2).toHaveLength(1);
    expect(hits2[0]!.content).toBe("这是示例正文");
  });
});
