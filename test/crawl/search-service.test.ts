import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { searchBoardArticles, searchBoards } from "../../src/crawl/search/service.js";
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

/** 注入一个测试 cookie（saveCookie 需要 AxiosResponse 形态） */
function setTestCookie(): void {
  saveCookie({ headers: { "set-cookie": "test_cookie=1" } } as never);
}

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

describe("crawl/search — searchBoards（并发池）", () => {
  beforeEach(() => setTestCookie());
  afterEach(() => clearCookie());

  /** 记录 fetch 调用时在途并发峰值，并给每个版面打不同延迟 */
  class TrackedRepo implements SearchRepository {
    requested: string[] = [];
    inFlight = 0;
    peak = 0;

    searchUrl(opts: { boardEname?: string; keyword: string; author?: string }): string {
      let url = `/s/article?t1=${encodeURIComponent(opts.keyword)}&au=${opts.author ? encodeURIComponent(opts.author) : ""}`;
      if (opts.boardEname) url += `&b=${encodeURIComponent(opts.boardEname)}`;
      return url;
    }

    async fetch(path: string): Promise<string> {
      this.inFlight++;
      this.peak = Math.max(this.peak, this.inFlight);
      try {
        // 每个版面 10ms 延迟，制造重叠窗口（并发时 peak > 1）
        await new Promise((r) => setTimeout(r, 10));
        const board = path.match(/b=([^&]+)/)?.[1];
        if (board === "Demo") return resultPage(RESULT_ROW_1, RESULT_ROW_2);
        return resultPage();
      } finally {
        this.inFlight--;
      }
    }
  }

  it("并发度不超过 limit，且结果保序聚合", async () => {
    const repo = new TrackedRepo();
    const boards = ["Demo", "X1", "X2", "X3", "X4"];
    const hits = await searchBoards(boards, "示例", {}, 2, repo);

    expect(repo.peak).toBeLessThanOrEqual(2);
    // 只有 Demo 有命中；结果含 Demo 的 2 条且先于其他版面
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits[0]!.boardEname).toBe("Demo");
  });

  it("单版面失败不中断其他版面", async () => {
    class FlakyRepo extends TrackedRepo {
      async fetch(path: string): Promise<string> {
        if (path.includes("b=Fail")) throw new Error("fail board");
        return super.fetch(path);
      }
    }
    const repo = new FlakyRepo();
    const hits = await searchBoards(["Fail", "Demo"], "示例", {}, 2, repo);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits.every((h) => h.boardEname === "Demo")).toBe(true);
  });
});
