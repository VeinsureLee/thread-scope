import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ContentDb } from "../../src/storage/content-db.js";

describe("storage — ContentDb", () => {
  let tmpFile: string;
  let db: ContentDb;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `content-db-test-${process.pid}-${Math.random().toString(36).slice(2)}.db`);
    db = new ContentDb(tmpFile);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  it("upsertBoard：幂等（重复插入不报错）", () => {
    db.upsertBoard("Demo", "示例版", false);
    db.upsertBoard("Demo", "示例版", false); // 重复 → ON CONFLICT 更新
    expect(db.getUserId("_nonexistent_")).toBeNull(); // 表存在即可
  });

  it("upsertUser：INSERT OR IGNORE 去重，uid 唯一", () => {
    const id1 = db.upsertUser({ uid: "user_a", name: "user_a" });
    const id2 = db.upsertUser({ uid: "user_a", name: "user_a" });
    expect(id1).toBe(id2); // 同一行
    expect(id1).toBeGreaterThan(0);
  });

  it("upsertArticle + findArticleIdByUrl 判重", () => {
    db.upsertBoard("Demo", "示例版", false);
    const row = {
      boardEname: "Demo",
      title: "示例帖",
      url: "/article/Demo/1001",
      date: "2026-08-01",
      isPinned: false,
      authorUid: "user_a",
      authorRaw: "user_a",
      replyCount: 1,
      lastReply: "2026-08-02",
      lastReplierUid: "user_b",
    };
    const id = db.upsertArticle(row);
    expect(id).toBeGreaterThan(0);
    expect(db.findArticleIdByUrl("/article/Demo/1001")).toBe(id);
    // 重复插入 → 更新而非新增（返回同一 id）
    expect(db.upsertArticle({ ...row, title: "示例帖2" })).toBe(id);
  });

  it("saveThread：原子写入 作者+文章+首帖+评论", () => {
    db.upsertBoard("Anon", "匿名版", true);

    const articleId = db.saveThread(
      "Anon",
      { url: "/article/Anon/2001", title: "测试帖" },
      [{ uid: "user_a", name: "user_a" }],
      {
        floor: 1, kind: "article", authorUid: null, authorRaw: "IWhisper#123",
        isAnon: true, content: "正文内容", images: ["/att/x"], postTime: "2026-08-06T17:36:52", posText: "楼主",
      },
      [
        {
          floor: 2, kind: "reply", authorUid: "user_a", authorRaw: "user_a",
          isAnon: false, content: "评论", images: [], postTime: null, posText: "沙发",
        },
      ],
    );
    expect(articleId).toBeGreaterThan(0);

    expect(db.hasThreadContent(articleId)).toBe(true);

    const posts = db.getThreadPosts(articleId);
    expect(posts).toHaveLength(2);
    expect(posts[0]!.kind).toBe("article");
    expect(posts[0]!.isAnon).toBe(true);
    expect(posts[0]!.authorUid).toBeNull();
    expect(posts[1]!.authorUid).toBe("user_a");
    expect(posts[0]!.images).toEqual(["/att/x"]);
  });

  it("saveThread：重复写入幂等（UNIQUE 复合键）", () => {
    db.upsertBoard("Demo", "示例版", false);
    const meta = { url: "/article/Demo/1", title: "t" };
    const post = {
      floor: 1, kind: "article" as const, authorUid: null, authorRaw: "a",
      isAnon: false, content: "c", images: [], postTime: null, posText: "楼主",
    };
    db.saveThread("Demo", meta, [], post, []);
    db.saveThread("Demo", meta, [], post, []);
    expect(db.getThreadPosts(db.findArticleIdByUrl(meta.url)!)).toHaveLength(1);
  });

  it("searchArticles：本地搜索文章（标题 LIKE）", () => {
    db.upsertBoard("Demo", "示例版", false);
    db.upsertArticle({
      boardEname: "Demo",
      title: "北京邮电大学招生",
      url: "/article/Demo/3001",
      date: "2026-08-01",
      isPinned: false,
      authorUid: null,
      authorRaw: "someone",
      replyCount: 0,
      lastReply: "",
      lastReplierUid: null,
    });
    db.upsertArticle({
      boardEname: "Demo",
      title: "无关标题",
      url: "/article/Demo/3002",
      date: "2026-08-02",
      isPinned: false,
      authorUid: null,
      authorRaw: "someone2",
      replyCount: 0,
      lastReply: "",
      lastReplierUid: null,
    });

    const hits = db.searchArticles("邮电");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.title).toBe("北京邮电大学招生");
    expect(hits[0]!.boardEname).toBe("Demo");

    // boardEname 限定
    expect(db.searchArticles("招生", { boardEname: "Other" })).toHaveLength(0);
    expect(db.searchArticles("招生", { boardEname: "Demo" })).toHaveLength(1);
  });

  it("searchThreadsContent：本地搜索帖子正文（content LIKE）", () => {
    db.upsertBoard("Demo", "示例版", false);
    db.saveThread(
      "Demo",
      { url: "/article/Demo/4001", title: "考研经验帖" },
      [],
      {
        floor: 1, kind: "article", authorUid: null, authorRaw: "a",
        isAnon: false, content: "这是关于计算机考研的复习心得", images: [], postTime: null, posText: "楼主",
      },
      [],
    );

    const hits = db.searchThreadsContent("计算机考研");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.articleTitle).toBe("考研经验帖");
    expect(hits[0]!.kind).toBe("article");
    expect(hits[0]!.content).toContain("计算机考研");
  });
});
