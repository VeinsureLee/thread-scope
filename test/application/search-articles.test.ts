import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { saveCookie, clearCookie } from "../../src/core/http-client.js";
import { ContentDb } from "../../src/storage/content-db.js";
import { searchBoardsGrouped } from "../../src/application/use-case/search/search-boards.js";
import { searchArticlesUseCase } from "../../src/application/use-case/search/search-articles-use-case.js";
import type { SearchRepository } from "../../src/crawl/search/index.js";
import type { ForumTreeNode } from "../../src/model/dto/index.js";

const tree: ForumTreeNode[] = [
  {
    id: "sec-demo",
    name: "示例分区",
    type: "section",
    level: 1,
    children: [
      { id: "board-Demo", name: "示例甲", type: "board", level: 2, board: { name: "示例甲", ename: "Demo", manager: [] } },
      { id: "board-Other", name: "示例乙", type: "board", level: 2, board: { name: "示例乙", ename: "Other", manager: [] } },
    ],
  },
];

function resultRow(id: string): string {
  return `<tr><td class="title_8">1.</td><td class="title_9"><a href="/article/Demo/${id}">示例命中</a></td><td class="title_10">2026-01-01</td><td class="title_12">user_1</td><td class="title_11 middle">0</td><td class="title_10">2026-01-01</td><td class="title_12">user_1</td></tr>`;
}

class FakeSearchRepository implements SearchRepository {
  requested: string[] = [];

  searchUrl(opts: { boardEname?: string; keyword: string; author?: string }): string {
    return `/search?b=${opts.boardEname ?? ""}&t1=${opts.keyword}&au=${opts.author ?? ""}`;
  }

  async fetch(path: string): Promise<string> {
    this.requested.push(path);
    if (path.includes("Other")) return `<table class="board-list tiz"><tbody></tbody></table>`;
    return `<table class="board-list tiz"><tbody>${resultRow("1001")}${resultRow("1002")}</tbody></table>`;
  }
}

describe("searchBoardsGrouped（按版分组并发搜索）", () => {
  beforeEach(() => saveCookie({ headers: { "set-cookie": "synthetic=1" } } as never));
  afterEach(() => clearCookie());

  it("使用 ForumNode 任务计划，只搜索指定版面并按版分组计数", async () => {
    const repo = new FakeSearchRepository();
    const groups = await searchBoardsGrouped(
      ["Demo"],
      "示例",
      { author: "user_1", maxPages: 1 },
      1,
      tree,
      repo,
    );

    expect(repo.requested[0]).toContain("Demo");
    expect(repo.requested.some((path) => path.includes("Other"))).toBe(false);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.boardEname).toBe("Demo");
    expect(groups[0]!.count).toBe(2);
    expect(groups[0]!.items).toHaveLength(2);
  });

  it("无命中的版面跳过（不进入结果组）", async () => {
    const repo = new FakeSearchRepository();
    const groups = await searchBoardsGrouped(["Demo", "Other"], "示例", {}, 2, tree, repo);
    // Other 无命中 → 只返回 Demo 组
    expect(groups.map((g) => g.boardEname)).toEqual(["Demo"]);
  });
});

describe("searchArticlesUseCase（本地路径按版分组）", () => {
  it("local 搜索返回按版分组结构（total + boards）", async () => {
    const result = await searchArticlesUseCase({
      keyword: "示例",
      source: "local",
      boards: ["Demo"],
      tree,
    });
    expect(result.kind).toBe("results");
    if (result.kind !== "results") return;
    expect(result.source).toBe("local");
    // 分组结构契约（不依赖真实库内容）：total 为数字，boards 为分组数组，每组含 boardEname/count/items
    expect(typeof result.total).toBe("number");
    expect(Array.isArray(result.boards)).toBe(true);
    for (const group of result.boards) {
      expect(typeof group.boardEname).toBe("string");
      expect(typeof group.count).toBe("number");
      expect(Array.isArray(group.items)).toBe(true);
      expect(group.items.length).toBe(group.count);
    }
  });

  it("local 搜索：maxResults/每版上限截断 + truncated 信号 + boards 过滤", async () => {
    const tmpFile = path.join(os.tmpdir(), `search-articles-${process.pid}-${Math.random().toString(36).slice(2)}.db`);
    const db = new ContentDb(tmpFile);
    try {
      db.upsertBoard("Demo", "示例甲", false);
      db.upsertBoard("Other", "示例乙", false);
      for (let i = 1; i <= 5; i++) {
        db.upsertArticle({
          boardEname: "Demo", title: `示例标题${i}`, url: `/article/Demo/${i}`,
          date: "2026-01-01", isPinned: false, authorUid: null, authorRaw: "u",
          replyCount: 0, lastReply: "", lastReplierUid: null,
        });
        db.upsertArticle({
          boardEname: "Other", title: `示例标题${i}`, url: `/article/Other/${i}`,
          date: "2026-01-01", isPinned: false, authorUid: null, authorRaw: "u",
          replyCount: 0, lastReply: "", lastReplierUid: null,
        });
      }

      const result = await searchArticlesUseCase({
        keyword: "示例",
        source: "local",
        boards: ["Demo", "Other"],
        maxResults: 3,
        maxItems: 2,
        tree,
        store: db,
      });
      expect(result.kind).toBe("results");
      if (result.kind !== "results") return;
      expect(result.truncated).toBe(true); // 每版 5 条 > 2，截断
      expect(result.total).toBeLessThanOrEqual(3);
      expect(result.boards.length).toBeGreaterThan(0);
      for (const group of result.boards) {
        expect(group.count).toBeLessThanOrEqual(2);
      }
    } finally {
      db.close();
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });
});
