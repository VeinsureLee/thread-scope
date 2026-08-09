import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { collectBoardManagers, collectBoardNodes, initForum, initStructure, initManagers, initBoardArticles } from "../../src/application/use-case/init/init-forum.js";
import type { ArticleRow, ForumTreeNode } from "../../src/model/dto/index.js";
import { saveCookie, clearCookie } from "../../src/core/http-client.js";

// ── 合成测试树（不包含真实论坛内容） ──
const TREE: ForumTreeNode[] = [
  {
    id: "sec-0",
    name: "示例分区",
    type: "section",
    level: 1,
    children: [
      {
        id: "board-Demo",
        name: "示例版",
        type: "board",
        level: 2,
        board: { name: "示例版", ename: "Demo", manager: ["user_a", "user_b"] },
      },
      {
        id: "board-Demo2",
        name: "示例版2",
        type: "board",
        level: 2,
        board: { name: "示例版2", ename: "Demo2", manager: ["user_a", "user_c"] },
      },
      {
        id: "sec-0-0",
        name: "子分区",
        type: "section",
        level: 2,
        children: [
          {
            id: "board-Demo3",
            name: "示例版3",
            type: "board",
            level: 3,
            board: { name: "示例版3", ename: "Demo3", manager: ["user_d"] },
          },
        ],
      },
    ],
  },
];

describe("init — collectBoardManagers / collectBoardNodes", () => {
  it("收集全部版主 uid（跨版去重）", () => {
    expect(collectBoardManagers(TREE).sort()).toEqual(["user_a", "user_b", "user_c", "user_d"]);
  });

  it("收集全部版块节点（含嵌套分区）", () => {
    const boards = collectBoardNodes(TREE);
    expect(boards.map((b) => b.board.ename)).toEqual(["Demo", "Demo2", "Demo3"]);
  });

  it("空树 → 空结果", () => {
    expect(collectBoardManagers([])).toEqual([]);
    expect(collectBoardNodes([])).toEqual([]);
  });
});

describe("init — initForum（爬版主落库）", () => {
  let tmpDbFile: string;
  let tmpStructureFile: string;

  beforeEach(() => {
    saveCookie({ headers: { "set-cookie": "test_cookie=1" } } as never);
    tmpDbFile = path.join(os.tmpdir(), `init-db-test-${process.pid}-${Math.random().toString(36).slice(2)}.db`);
    tmpStructureFile = path.join(os.tmpdir(), `init-structure-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  });

  afterEach(() => {
    clearCookie();
    vi.restoreAllMocks();
    if (fs.existsSync(tmpDbFile)) fs.unlinkSync(tmpDbFile);
    if (fs.existsSync(tmpStructureFile)) fs.unlinkSync(tmpStructureFile);
  });

  it("爬版主资料并落库（user 实体 + is_manager 标记 + 头衔）", async () => {
    // mock 结构树
    const structure = await import("../../src/crawl/structure/index.js");
    vi.spyOn(structure, "fetchForumTree").mockResolvedValue(TREE);

    // mock 用户资料抓取
    const user = await import("../../src/crawl/user/index.js");
    vi.spyOn(user, "fetchUserProfile").mockImplementation(async (uid: string) => ({
      uid,
      nickname: `昵称_${uid}`,
      gender: "男生",
      constellation: "天秤座",
      qq: "", msn: "", homepage: "",
      avatar: "", level: "版主", title: [], postCount: "0篇", points: "0",
      vitality: "0", lastLogin: "", lastIp: "", onlineStatus: "",
      isOnline: false, followNum: 0, fansNum: 0, fetchedAt: new Date().toISOString(),
    }));
    // mock 头衔批量查询（避免真实网络）
    vi.spyOn(user, "fetchUserTitles").mockResolvedValue(
      new Map([["user_a", ["示例头衔"]]]),
    );

    // mock 各版块首页文章（避免真实网络）
    const article = await import("../../src/crawl/article/index.js");
    const rows: ArticleRow[] = [
      {
        boardEname: "Demo", title: "示例首页帖", url: "/article/Demo/9001",
        date: "2026-08-01", isPinned: true, authorUid: "user_a", authorRaw: "user_a",
        replyCount: 0, lastReply: "", lastReplierUid: null,
      },
    ];
    vi.spyOn(article, "fetchBoardArticles").mockResolvedValue(rows);

    // 真实 ContentDb + 临时路径（db 和 structure 都不污染真实数据）
    const result = await initForum(tmpDbFile, tmpStructureFile, { withArticles: true });
    expect(result.managers).toBe(4);
    expect(result.managersFetched).toBe(4);
    expect(result.boards).toBe(3);
    expect(result.sections).toBe(2);
    // 各版块首页文章：3 个版块均成功抓取（Demo/Demo2/Demo3）
    expect(result.articlesFetched).toBe(3);
    expect(result.articlesFailed).toBe(0);
    expect(result.errors).toEqual([]);

    // 验证落库：user 实体 + is_manager 标记 + 头衔
    const { ContentDb } = await import("../../src/storage/content-db.js");
    const db = new ContentDb(tmpDbFile);
    try {
      const uids = db.getAllUserUids();
      expect(uids.sort()).toEqual(["user_a", "user_b", "user_c", "user_d"]);
      // profile 已写入（拆分的独立字段）
      const profile = db.getUserProfile("user_a") as { nickname: string; title: string[] };
      expect(profile.nickname).toBe("昵称_user_a");
      expect(profile.title).toEqual(["示例头衔"]); // tquery 头衔已补
      // is_manager 标记
      expect(db.isManager("user_a")).toBe(true);
      expect(db.isManager("user_b")).toBe(true);
      // 首页文章落库
      expect(db.findArticleIdByUrl("/article/Demo/9001")).not.toBeNull();
    } finally {
      db.close();
    }
  });

  it("版主资料抓取失败 → 记入 errors，不中断其他", async () => {
    const structure = await import("../../src/crawl/structure/index.js");
    vi.spyOn(structure, "fetchForumTree").mockResolvedValue(TREE);

    const user = await import("../../src/crawl/user/index.js");
    vi.spyOn(user, "fetchUserProfile").mockImplementation(async (uid: string) => {
      if (uid === "user_b") throw new Error("网络失败");
      return {
        uid, nickname: `昵称_${uid}`, gender: "", constellation: "",
        qq: "", msn: "", homepage: "", avatar: "", level: "版主", title: [],
        postCount: "0", points: "0", vitality: "0", lastLogin: "", lastIp: "",
        onlineStatus: "", isOnline: false, followNum: 0, fansNum: 0,
        fetchedAt: new Date().toISOString(),
      };
    });
    vi.spyOn(user, "fetchUserTitles").mockResolvedValue(new Map());

    // mock 各版块首页文章（避免真实网络）
    const article = await import("../../src/crawl/article/index.js");
    vi.spyOn(article, "fetchBoardArticles").mockResolvedValue([]);

    const result = await initForum(tmpDbFile, tmpStructureFile, { withArticles: true });
    expect(result.managersFetched).toBe(3); // user_b 失败
    expect(result.errors.some((e) => e.includes("user_b"))).toBe(true);
  });
});

describe("init — 拆分模块（initStructure / initManagers / initBoardArticles）", () => {
  let tmpDbFile: string;
  let tmpStructureFile: string;

  beforeEach(() => {
    saveCookie({ headers: { "set-cookie": "test_cookie=1" } } as never);
    tmpDbFile = path.join(os.tmpdir(), `init-split-test-${process.pid}-${Math.random().toString(36).slice(2)}.db`);
    tmpStructureFile = path.join(os.tmpdir(), `init-split-structure-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  });

  afterEach(() => {
    clearCookie();
    vi.restoreAllMocks();
    if (fs.existsSync(tmpDbFile)) fs.unlinkSync(tmpDbFile);
    if (fs.existsSync(tmpStructureFile)) fs.unlinkSync(tmpStructureFile);
  });

  it("initStructure 只爬树结构并写缓存（轻量，不含文章）", async () => {
    const structure = await import("../../src/crawl/structure/index.js");
    vi.spyOn(structure, "fetchForumTree").mockResolvedValue(TREE);

    const result = await initStructure(tmpStructureFile);
    expect(result.sections).toBe(2);
    expect(result.boards).toBe(3);
    expect(result.errors).toEqual([]);
    // 缓存文件已写入
    expect(fs.existsSync(tmpStructureFile)).toBe(true);
  });

  it("initManagers 只处理版主资料/头衔，不抓首页文章", async () => {
    const structure = await import("../../src/crawl/structure/index.js");
    vi.spyOn(structure, "fetchForumTree").mockResolvedValue(TREE);

    const user = await import("../../src/crawl/user/index.js");
    vi.spyOn(user, "fetchUserProfile").mockImplementation(async (uid: string) => ({
      uid, nickname: `昵称_${uid}`, gender: "", constellation: "",
      qq: "", msn: "", homepage: "", avatar: "", level: "版主", title: [],
      postCount: "", points: "", vitality: "", lastLogin: "", lastIp: "",
      onlineStatus: "", isOnline: false, followNum: 0, fansNum: 0,
      fetchedAt: new Date().toISOString(),
    }));
    vi.spyOn(user, "fetchUserTitles").mockResolvedValue(new Map([["user_a", ["示例头衔"]]]));

    // 首页文章不应被调用
    const article = await import("../../src/crawl/article/index.js");
    const articleSpy = vi.spyOn(article, "fetchBoardArticles");

    const { ContentDb } = await import("../../src/storage/content-db.js");
    const db = new ContentDb(tmpDbFile);
    try {
      const result = await initManagers({ store: db });
      expect(result.managers).toBe(4);
      expect(result.managersFetched).toBe(4);
      expect(articleSpy).not.toHaveBeenCalled();
    } finally {
      db.close();
    }
  });

  it("initBoardArticles 只抓首页文章落库", async () => {
    const structure = await import("../../src/crawl/structure/index.js");
    vi.spyOn(structure, "fetchForumTree").mockResolvedValue(TREE);

    const article = await import("../../src/crawl/article/index.js");
    const rows: ArticleRow[] = [
      {
        boardEname: "Demo", title: "示例首页帖", url: "/article/Demo/9001",
        date: "2026-08-01", isPinned: true, authorUid: "user_a", authorRaw: "user_a",
        replyCount: 0, lastReply: "", lastReplierUid: null,
      },
    ];
    vi.spyOn(article, "fetchBoardArticles").mockResolvedValue(rows);

    const { ContentDb } = await import("../../src/storage/content-db.js");
    const db = new ContentDb(tmpDbFile);
    try {
      const result = await initBoardArticles({ store: db });
      expect(result.articlesFetched).toBe(3);
      expect(result.articlesFailed).toBe(0);
    } finally {
      db.close();
    }
  });

  it("initForum 默认不抓首页（withArticles=false）", async () => {
    const structure = await import("../../src/crawl/structure/index.js");
    vi.spyOn(structure, "fetchForumTree").mockResolvedValue(TREE);

    const user = await import("../../src/crawl/user/index.js");
    vi.spyOn(user, "fetchUserProfile").mockImplementation(async (uid: string) => ({
      uid, nickname: `昵称_${uid}`, gender: "", constellation: "",
      qq: "", msn: "", homepage: "", avatar: "", level: "版主", title: [],
      postCount: "", points: "", vitality: "", lastLogin: "", lastIp: "",
      onlineStatus: "", isOnline: false, followNum: 0, fansNum: 0,
      fetchedAt: new Date().toISOString(),
    }));
    vi.spyOn(user, "fetchUserTitles").mockResolvedValue(new Map());

    const article = await import("../../src/crawl/article/index.js");
    const articleSpy = vi.spyOn(article, "fetchBoardArticles");

    const result = await initForum(tmpDbFile, tmpStructureFile);
    expect(result.withArticles).toBe(false);
    expect(result.articlesFetched).toBe(0);
    expect(articleSpy).not.toHaveBeenCalled();
    expect(result.sections).toBe(2);
    expect(result.boards).toBe(3);
    expect(result.managersFetched).toBe(4);
  });
});
