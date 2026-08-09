import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ContentDb } from "../../src/storage/content-db.js";

describe("storage — ContentDb FTS5 全文搜索", () => {
  let tmpFile: string;
  let db: ContentDb;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `content-db-fts-test-${process.pid}-${Math.random().toString(36).slice(2)}.db`);
    db = new ContentDb(tmpFile);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  function addArticle(ename: string, title: string, date: string, url: string): void {
    db.upsertBoard(ename, ename, false);
    db.upsertArticle({
      boardEname: ename,
      title,
      url,
      date,
      isPinned: false,
      authorUid: null,
      authorRaw: "u",
      replyCount: 0,
      lastReply: "",
      lastReplierUid: null,
    });
  }

  it("写入同步 + 中文 FTS 命中（2 字关键词）", () => {
    addArticle("Demo", "邮电大学招生简章", "2026-01-01", "/article/Demo/1");
    addArticle("Demo", "毕业季租房信息汇总", "2026-02-01", "/article/Demo/2");

    expect(db.searchArticles("邮电")).toHaveLength(1);
    expect(db.searchArticles("招生")).toHaveLength(1);
    expect(db.searchArticles("毕业季")).toHaveLength(1);
    expect(db.searchArticles("租房")).toHaveLength(1);
    expect(db.searchArticles("无关")).toHaveLength(0);
  });

  it("1 字关键词回退 LIKE，FTS 2 字命中", () => {
    addArticle("Demo", "考研经验分享", "2026-01-01", "/article/Demo/1");
    addArticle("Demo", "考研资料免费送", "2026-02-01", "/article/Demo/2");

    expect(db.searchArticles("资")).toHaveLength(1); // 1 字 → LIKE
    expect(db.searchArticles("考研")).toHaveLength(2); // 2 字 → FTS
  });

  it("boards 过滤 + from/to 时间窗口", () => {
    addArticle("Demo", "示例甲标题", "2024-05-01", "/article/Demo/1");
    addArticle("Demo", "示例乙标题", "2026-05-01", "/article/Demo/2");
    addArticle("Other", "示例丙标题", "2025-05-01", "/article/Other/3");

    expect(db.searchArticles("示例", { boardEnames: ["Other"] })).toHaveLength(1);
    const windowed = db.searchArticles("示例", { from: "2025-01-01", to: "2025-12-31" });
    expect(windowed).toHaveLength(1);
    expect(windowed[0]!.title).toBe("示例丙标题");
    expect(
      db.searchArticles("示例", { boardEnames: ["Demo"], from: "2024-01-01", to: "2024-12-31" }),
    ).toHaveLength(1);
  });

  it("recent 排序：置顶优先 + 发帖日期降序", () => {
    db.upsertBoard("Demo", "示例版", false);
    db.upsertArticle({
      boardEname: "Demo", title: "旧帖", url: "/article/Demo/1", date: "2024-01-01",
      isPinned: false, authorUid: null, authorRaw: "u", replyCount: 0, lastReply: "", lastReplierUid: null,
    });
    db.upsertArticle({
      boardEname: "Demo", title: "置顶帖", url: "/article/Demo/2", date: "2023-01-01",
      isPinned: true, authorUid: null, authorRaw: "u", replyCount: 0, lastReply: "", lastReplierUid: null,
    });
    db.upsertArticle({
      boardEname: "Demo", title: "新帖", url: "/article/Demo/3", date: "2026-01-01",
      isPinned: false, authorUid: null, authorRaw: "u", replyCount: 0, lastReply: "", lastReplierUid: null,
    });

    const hits = db.searchArticles("帖", { sort: "recent" });
    expect(hits.map((h) => h.title)).toEqual(["置顶帖", "新帖", "旧帖"]);
  });

  it("relevant 排序：FTS bm25 让高频命中排前", () => {
    db.upsertBoard("Demo", "示例版", false);
    db.upsertArticle({
      boardEname: "Demo", title: "考研", url: "/article/Demo/1", date: "2026-02-01",
      isPinned: false, authorUid: null, authorRaw: "u", replyCount: 0, lastReply: "", lastReplierUid: null,
    });
    db.upsertArticle({
      boardEname: "Demo", title: "考研考研考研考研", url: "/article/Demo/2", date: "2026-01-01",
      isPinned: false, authorUid: null, authorRaw: "u", replyCount: 0, lastReply: "", lastReplierUid: null,
    });

    const hits = db.searchArticles("考研", { sort: "relevant" });
    expect(hits[0]!.title).toBe("考研考研考研考研");
  });

  it("post_fts：正文搜索（FTS + 短词 LIKE）", () => {
    db.upsertBoard("Demo", "示例版", false);
    db.saveThread(
      "Demo",
      { url: "/article/Demo/4001", title: "考研经验帖" },
      [],
      {
        floor: 1, kind: "article", authorUid: null, authorRaw: "a",
        isAnon: false, content: "这是关于计算机考研的复习心得", images: [], postTime: "2026-01-01T10:00:00", posText: "楼主",
      },
      [],
    );

    expect(db.searchThreadsContent("计算机考研")).toHaveLength(1);
    expect(db.searchThreadsContent("考研")).toHaveLength(1);
    expect(db.searchThreadsContent("心")).toHaveLength(1); // 1 字 → LIKE
    expect(db.searchThreadsContent("不存在的词")).toHaveLength(0);
  });

  it("存量回填：先写数据再重开连接，FTS 命中", () => {
    addArticle("Demo", "回填测试标题", "2026-01-01", "/article/Demo/99");
    db.close();
    db = new ContentDb(tmpFile); // 重开 → 空 FTS 表触发回填
    expect(db.searchArticles("回填")).toHaveLength(1);
  });
});
