import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { searchBoardArticles, searchAndSnapshot } from "../../src/crawl/search/service.js";
import type { SearchRepository } from "../../src/crawl/search/repository.js";

// TrafficDb 打桩：getLatestAll 返回空 → 默认范围回退到论坛树前 N 版（确定性测试）
vi.mock("../../src/storage/traffic-db.js", () => {
  return {
    TrafficDb: class {
      getLatestAll(): never[] {
        return [];
      }
      close(): void {}
    },
  };
});

// ── 合成测试数据（不包含真实论坛内容） ──
const RESULT_ROW_1 = `<tr><td class="title_8">1.</td><td class="title_9"><a href="/article/Demo/1001">示例命中一</a></td><td class="title_10">2026-08-01</td><td class="title_12">|&ensp;<a href="/user/query/user_a" class="c63f">user_a</a></td><td class="title_11 middle">0</td><td class="title_10">2026-08-01</td><td class="title_12">|&ensp;<a href="/user/query/user_a" class="c09f">user_a</a></td></tr>`;
const RESULT_ROW_2 = `<tr><td class="title_8">2.</td><td class="title_9"><a href="/article/Demo/1002">示例命中二</a></td><td class="title_10">2026-08-02</td><td class="title_12">|&ensp;<a href="/user/query/user_b" class="c63f">user_b</a></td><td class="title_11 middle">1</td><td class="title_10">2026-08-03</td><td class="title_12">|&ensp;<a href="/user/query/user_c" class="c09f">user_c</a></td></tr>`;

function resultPage(...rows: string[]): string {
  return `<div class="b-content"><table class="board-list tiz"><tbody>${rows.join("")}</tbody></table></div>`;
}

/** 首页 + 第 2 页的 fake 仓库（跨页翻页） */
class FakeSearchRepo implements SearchRepository {
  requested: string[] = [];
  constructor(private boardName: string) {}

  searchUrl(opts: { boardEname?: string; keyword: string; author?: string }): string {
    let url = `/s/article?t1=${encodeURIComponent(opts.keyword)}&au=${opts.author ? encodeURIComponent(opts.author) : ""}`;
    if (opts.boardEname) url += `&b=${encodeURIComponent(opts.boardEname)}`;
    return url;
  }

  async fetch(path: string): Promise<string> {
    this.requested.push(path);
    if (this.boardName === "Demo") {
      if (path.includes("p=2")) return resultPage(RESULT_ROW_2);
      return resultPage(RESULT_ROW_1, RESULT_ROW_2);
    }
    return resultPage(); // 其他版面 → 无结果
  }
}

// 登录状态：直接注入假 cookie（绕过 requireLogin）
import { saveCookie, clearCookie } from "../../src/core/http-client.js";
import type { ForumTreeNode } from "../../src/models/index.js";

/** 注入一个测试 cookie（saveCookie 需要 AxiosResponse 形态） */
function setTestCookie(): void {
  saveCookie({ headers: { "set-cookie": "test_cookie=1" } } as never);
}

/** 合成论坛树：Demo 版块（避免真实网络） */
const FAKE_TREE: ForumTreeNode[] = [
  {
    id: "sec-1",
    name: "示例分区",
    type: "section",
    level: 1,
    children: [
      {
        id: "board-Demo",
        name: "示例版",
        type: "board",
        level: 2,
        board: { name: "示例版", ename: "Demo", manager: [] },
      },
    ],
  },
];

describe("crawl/search — searchBoardArticles", () => {
  beforeEach(() => setTestCookie());
  afterEach(() => clearCookie());

  it("单版面搜索：解析命中，跨页去重", async () => {
    const repo = new FakeSearchRepo("Demo");
    const hits = await searchBoardArticles("Demo", "示例", { maxPages: 2 }, repo);

    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.boardEname === "Demo")).toBe(true);

    // 跨页去重：首页与第 2 页都出现 1002，只保留一次
    const urls = hits.map((h) => h.row.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("searchUrl 含 b 与 t1，翻页路径透传给 fetch", async () => {
    const repo = new FakeSearchRepo("Demo");
    const hits = await searchBoardArticles("Demo", "示例", { maxPages: 2 }, repo);
    expect(repo.requested.length).toBeGreaterThanOrEqual(1);
    expect(repo.requested[0]).toContain("b=Demo");
    expect(repo.requested[0]).toContain("t1=" + encodeURIComponent("示例"));
    expect(hits.length).toBeGreaterThan(0);
  });
});

describe("crawl/search — searchAndSnapshot（快照 append-only）", () => {
  let tmpFile: string;

  beforeEach(() => {
    setTestCookie();
    tmpFile = path.join(os.tmpdir(), `search-snapshot-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  });

  afterEach(() => {
    clearCookie();
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  it("写入一条快照记录；重复调用追加；默认范围=流量前N版", async () => {
    const repo = new FakeSearchRepo("Demo");
    await searchAndSnapshot(
      { keyword: "示例", maxPages: 2, tree: FAKE_TREE },
      tmpFile,
      repo,
    );
    await searchAndSnapshot(
      { keyword: "示例", maxPages: 2, tree: FAKE_TREE },
      tmpFile,
      repo,
    );

    const records = JSON.parse(fs.readFileSync(tmpFile, "utf-8")) as Array<{ keyword: string; scope: string; hitCount: number }>;
    expect(records).toHaveLength(2);
    expect(records[0]!.keyword).toBe("示例");
    expect(records[0]!.scope).toBe("流量前1版");
    expect(records[0]!.hitCount).toBeGreaterThan(0);
  });
});
