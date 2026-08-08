import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { searchThreads } from "../../src/application/use-case/search/search-threads.js";
import type { SearchRepository } from "../../src/crawl/search/repository.js";
import type { ThreadRepository } from "../../src/crawl/content/repository.js";
import type { ForumTreeNode } from "../../src/models/index.js";
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
    ],
  },
];

// ── 合成测试数据（不包含真实论坛内容） ──
const RESULT_ROW = `<tr><td class="title_8">1.</td><td class="title_9"><a href="/article/Demo/1001">示例命中</a></td><td class="title_10">2026-08-01</td><td class="title_12">|&ensp;<a href="/user/query/user_a" class="c63f">user_a</a></td><td class="title_11 middle">1</td><td class="title_10">2026-08-02</td><td class="title_12">|&ensp;<a href="/user/query/user_b" class="c09f">user_b</a></td></tr>`;

function resultPage(): string {
  return `<div class="b-content"><table class="board-list tiz"><tbody>${RESULT_ROW}</tbody></table></div>`;
}

// 详情页：首帖 + 一条评论
const DETAIL_PAGE = `<section id="body"><div class="b-head"><span class="n-left">文章主题: 示例命中</span></div><div class="b-content">
<a name="a0"></a><div class="a-wrap corner"><table class="article"><tbody><tr class="a-head"><td class="a-left"><span class="a-u-name"><a href="/user/query/user_a">user_a</a></span><span class="a-u-sex"><samp title="女生哦 离线" class="ico-pos-offline-woman"></samp></span></td><td><span class="a-pos">楼主</span></td></tr><tr class="a-body"><td class="a-left"></td><td class="a-content body1001"><div class="a-content-wrap">发信人: user_a (), 信区: Demo<br>标&nbsp;&nbsp;题: 示例命中<br>发信站: 示例论坛 (Thu Oct 19 11:04:35 2017), 站内<br><br>这是示例正文<br>--</div></td></tr></tbody></table></div>
<a name="a1"></a><div class="a-wrap corner"><table class="article"><tbody><tr class="a-head"><td class="a-left"><span class="a-u-name"><a href="/user/query/user_b">user_b</a></span><span class="a-u-sex"><samp title="女生哦 离线" class="ico-pos-offline-woman"></samp></span></td><td><span class="a-pos">沙发</span></td></tr><tr class="a-body"><td class="a-left"></td><td class="a-content body1002"><div class="a-content-wrap">发信人: user_b (user_b), 信区: Demo<br>发信站: 示例论坛 (Fri Oct 27 13:52:29 2017), 站内<br><br>示例评论内容<br>--</div></td></tr></tbody></table></div>
</div></section>`;

class FakeSearchRepo implements SearchRepository {
  searchUrl(opts: { boardEname?: string; keyword: string; author?: string }): string {
    let url = `/s/article?t1=${encodeURIComponent(opts.keyword)}&au=${opts.author ? encodeURIComponent(opts.author) : ""}`;
    if (opts.boardEname) url += `&b=${encodeURIComponent(opts.boardEname)}`;
    return url;
  }
  async fetch(_path: string): Promise<string> {
    return resultPage();
  }
}

class FakeThreadRepo implements ThreadRepository {
  threadUrl(boardName: string, articleId: string): string {
    return `/article/${boardName}/${articleId}`;
  }
  async fetch(path: string): Promise<string> {
    // 任意文章都返回同一详情页（测试数据只有一个候选）
    void path;
    return DETAIL_PAGE;
  }
}

describe("init/search — searchThreads", () => {
  beforeEach(() => setTestCookie());
  afterEach(() => clearCookie());

  it("版面内搜索 + 抓取正文：首帖与评论", async () => {
    const { scope, hits } = await searchThreads(
      "Demo",
      "示例",
      { tree: FAKE_TREE },
      { searchRepo: new FakeSearchRepo(), threadRepo: new FakeThreadRepo() },
    );

    expect(scope.label).toBe("Demo");
    expect(scope.kind).toBe("board");
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

  it("maxThreads=0 → 不抓正文（只返回空）", async () => {
    const { hits } = await searchThreads(
      "Demo",
      "示例",
      { maxThreads: 0, tree: FAKE_TREE },
      { searchRepo: new FakeSearchRepo(), threadRepo: new FakeThreadRepo() },
    );
    expect(hits).toHaveLength(0);
  });

  it("正文抓取并发：多命中并发且保序返回", async () => {
    // 两个版块 → 两个命中，正文抓取走并发池
    const tree: ForumTreeNode[] = [
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

    class MultiRepo extends FakeSearchRepo {
      async fetch(path: string): Promise<string> {
        await new Promise((r) => setTimeout(r, 5));
        return resultPage();
      }
    }
    class MultiThreadRepo extends FakeThreadRepo {
      async fetch(path: string): Promise<string> {
        await new Promise((r) => setTimeout(r, 5));
        return DETAIL_PAGE;
      }
    }

    const { hits } = await searchThreads(
      "sec-1",
      "示例",
      { tree, maxThreads: 10, concurrency: 2 },
      { searchRepo: new MultiRepo(), threadRepo: new MultiThreadRepo() },
    );
    expect(hits).toHaveLength(2);
    // 保序：第一个命中来自第一个版块
    expect(hits[0]!.articleId).toBe("1001");
  });
});
