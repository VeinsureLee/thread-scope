import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { searchThreads } from "../../src/application/use-case/search/search-threads.js";
import type { SearchRepository } from "../../src/crawl/search/repository.js";
import type { ThreadRepository } from "../../src/crawl/content/repository.js";
import type { ForumTreeNode } from "../../src/model/dto/index.js";
import { saveCookie, clearCookie } from "../../src/core/http-client.js";

/** 注入一个测试 cookie（saveCookie 需要 AxiosResponse 形态） */
function setTestCookie(): void {
  saveCookie({ headers: { "set-cookie": "test_cookie=1" } } as never);
}

/** 合成论坛树（避免真实网络） */
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
      {
        id: "board-Demo2",
        name: "示例版二",
        type: "board",
        level: 2,
        board: { name: "示例版二", ename: "Demo2", manager: [] },
      },
    ],
  },
];

// ── 合成测试数据（不包含真实论坛内容） ──
function resultRow(ename: string, id: string, title: string): string {
  return `<tr><td class="title_8">1.</td><td class="title_9"><a href="/article/${ename}/${id}">${title}</a></td><td class="title_10">2026-08-01</td><td class="title_12">|&ensp;<a href="/user/query/user_a" class="c63f">user_a</a></td><td class="title_11 middle">1</td><td class="title_10">2026-08-02</td><td class="title_12">|&ensp;<a href="/user/query/user_b" class="c09f">user_b</a></td></tr>`;
}
const RESULT_ROW = resultRow("Demo", "1001", "示例命中");
const RESULT_ROW_2 = resultRow("Demo", "1002", "示例命中二");

function resultPage(rows = RESULT_ROW): string {
  return `<div class="b-content"><table class="board-list tiz"><tbody>${rows}</tbody></table></div>`;
}

/** 每个版块返回 2 条命中的页面（URL 带版块名）。 */
function twoRowsFor(ename: string): string {
  return resultPage(resultRow(ename, "1001", "示例命中") + resultRow(ename, "1002", "示例命中二"));
}

// 详情页：首帖 + 一条评论
const DETAIL_PAGE = `<section id="body"><div class="b-head"><span class="n-left">文章主题: 示例命中</span></div><div class="b-content">
<a name="a0"></a><div class="a-wrap corner"><table class="article"><tbody><tr class="a-head"><td class="a-left"><span class="a-u-name"><a href="/user/query/user_a">user_a</a></span><span class="a-u-sex"><samp title="女生哦 离线" class="ico-pos-offline-woman"></samp></span></td><td><span class="a-pos">楼主</span></td></tr><tr class="a-body"><td class="a-left"></td><td class="a-content body1001"><div class="a-content-wrap">发信人: user_a (), 信区: Demo<br>标&nbsp;&nbsp;题: 示例命中<br>发信站: 示例论坛 (Thu Oct 19 11:04:35 2017), 站内<br><br>这是示例正文<br>--</div></td></tr></tbody></table></div>
<a name="a1"></a><div class="a-wrap corner"><table class="article"><tbody><tr class="a-head"><td class="a-left"><span class="a-u-name"><a href="/user/query/user_b">user_b</a></span><span class="a-u-sex"><samp title="女生哦 离线" class="ico-pos-offline-woman"></samp></span></td><td><span class="a-pos">沙发</span></td></tr><tr class="a-body"><td class="a-left"></td><td class="a-content body1002"><div class="a-content-wrap">发信人: user_b (user_b), 信区: Demo<br>发信站: 示例论坛 (Fri Oct 27 13:52:29 2017), 站内<br><br>示例评论内容<br>--</div></td></tr></tbody></table></div>
</div></section>`;

class FakeSearchRepo implements SearchRepository {
  constructor(private boardRows: Record<string, string> = {}) {}
  searchUrl(opts: { boardEname?: string; keyword: string; author?: string }): string {
    let url = `/s/article?t1=${encodeURIComponent(opts.keyword)}&au=${opts.author ? encodeURIComponent(opts.author) : ""}`;
    if (opts.boardEname) url += `&b=${encodeURIComponent(opts.boardEname)}`;
    return url;
  }
  async fetch(path: string): Promise<string> {
    const board = path.match(/b=([^&]+)/)?.[1];
    return this.boardRows[board ?? ""] ?? resultPage();
  }
}

class FakeThreadRepo implements ThreadRepository {
  threadUrl(boardName: string, articleId: string): string {
    return `/article/${boardName}/${articleId}`;
  }
  async fetch(path: string): Promise<string> {
    void path;
    return DETAIL_PAGE;
  }
}

describe("init/search — searchThreads", () => {
  beforeEach(() => setTestCookie());
  afterEach(() => clearCookie());

  it("指定版面搜索 + 抓取正文：首帖与评论", async () => {
    const { scope, hits } = await searchThreads(
      ["Demo"],
      "示例",
      { tree: FAKE_TREE },
      { searchRepo: new FakeSearchRepo(), threadRepo: new FakeThreadRepo() },
    );

    expect(scope.kind).toBe("custom");
    expect(hits).toHaveLength(1);
    const hit = hits[0]!;
    expect(hit.boardEname).toBe("Demo");
    expect(hit.articleId).toBe("1001");
    expect(hit.title).toBe("示例命中");
    expect(hit.firstPost.authorUid).toBe("user_a");
    expect(hit.firstPost.content).toContain("这是示例正文");
    expect(hit.replies).toHaveLength(1);
    expect(hit.replies[0]!.authorUid).toBe("user_b");
  });

  it("每版最多 maxThreadsPerBoard 条：两版各 2 条命中时各限 1 条", async () => {
    const rows: Record<string, string> = {
      Demo: twoRowsFor("Demo"),
      Demo2: twoRowsFor("Demo2"),
    };
    const { hits } = await searchThreads(
      ["Demo", "Demo2"],
      "示例",
      { tree: FAKE_TREE, maxThreadsPerBoard: 1 },
      { searchRepo: new FakeSearchRepo(rows), threadRepo: new FakeThreadRepo() },
    );
    expect(hits).toHaveLength(2); // 每版限 1 条 → 共 2
    // 保序：Demo 先
    expect(hits[0]!.boardEname).toBe("Demo");
    expect(hits[1]!.boardEname).toBe("Demo2");
  });

  it("全部版面默认上限 100（all 模式）", async () => {
    const { scope, hits } = await searchThreads(
      undefined,
      "示例",
      { tree: FAKE_TREE },
      { searchRepo: new FakeSearchRepo(), threadRepo: new FakeThreadRepo() },
    );
    expect(scope.kind).toBe("all");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("正文抓取并发：多命中并发且保序返回", async () => {
    class MultiRepo extends FakeSearchRepo {
      async fetch(path: string): Promise<string> {
        await new Promise((r) => setTimeout(r, 5));
        return super.fetch(path);
      }
    }
    class MultiThreadRepo extends FakeThreadRepo {
      async fetch(path: string): Promise<string> {
        await new Promise((r) => setTimeout(r, 5));
        return DETAIL_PAGE;
      }
    }

    const { hits } = await searchThreads(
      ["Demo", "Demo2"],
      "示例",
      { tree: FAKE_TREE, maxThreadsPerBoard: 1, concurrency: 2 },
      { searchRepo: new MultiRepo(), threadRepo: new MultiThreadRepo() },
    );
    expect(hits).toHaveLength(2);
    // 保序：第一个命中来自第一个版块
    expect(hits[0]!.boardEname).toBe("Demo");
  });
});
