import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveCookie, clearCookie } from "../../src/core/http-client.js";
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
  it("local 搜索返回分组结构 total + boards", async () => {
    const result = await searchArticlesUseCase({
      keyword: "示例",
      source: "local",
      boards: ["Demo"],
      tree,
    });
    expect(result.kind).toBe("results");
    if (result.kind !== "results") return;
    expect(result.source).toBe("local");
    // 无本地数据时 local 返回空
    expect(result.total).toBe(0);
    expect(result.boards).toEqual([]);
  });
});
