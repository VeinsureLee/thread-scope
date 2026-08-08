import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveCookie, clearCookie } from "../../src/core/http-client.js";
import { searchArticlesInScope } from "../../src/application/use-case/search/search-articles.js";
import type { SearchRepository } from "../../src/crawl/search/index.js";
import type { ForumTreeNode } from "../../src/models/index.js";

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

class FakeSearchRepository implements SearchRepository {
  requested: string[] = [];

  searchUrl(opts: { boardEname?: string; keyword: string; author?: string }): string {
    return `/search?b=${opts.boardEname ?? ""}&t1=${opts.keyword}&au=${opts.author ?? ""}`;
  }

  async fetch(path: string): Promise<string> {
    this.requested.push(path);
    if (path.includes("Other")) return `<table class="board-list tiz"><tbody></tbody></table>`;
    return `<table class="board-list tiz"><tbody><tr><td class="title_8">1.</td><td class="title_9"><a href="/article/Demo/1001">示例命中</a></td><td class="title_10">2026-01-01</td><td class="title_12">user_1</td><td class="title_11 middle">0</td><td class="title_10">2026-01-01</td><td class="title_12">user_1</td></tr></tbody></table>`;
  }
}

describe("SearchArticlesUseCase", () => {
  beforeEach(() => saveCookie({ headers: { "set-cookie": "synthetic=1" } } as never));
  afterEach(() => clearCookie());

  it("使用 ForumNode 任务计划，只搜索 scope 中的版面", async () => {
    const repo = new FakeSearchRepository();
    const hits = await searchArticlesInScope(tree, {
      kind: "section",
      boardEname: null,
      boards: ["Demo"],
      label: "示例分区",
    }, {
      authorUid: "user_1",
      maxPages: 1,
      concurrency: 1,
      repo,
    });
    expect(hits).toHaveLength(1);
    expect(repo.requested[0]).toContain("Demo");
    expect(repo.requested.some((path) => path.includes("Other"))).toBe(false);
  });
});
