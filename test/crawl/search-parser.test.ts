import { describe, it, expect } from "vitest";
import {
  parseSearchResults,
  keywordFromUrl,
  boardFromSearchUrl,
} from "../../src/crawl/search/parser.js";
import { HttpSearchRepository } from "../../src/crawl/search/repository.js";

// 合成测试数据（不包含真实论坛内容，避免泄露用户信息）
// 搜索结果表：table.board-list.tiz（多一个 .tiz class），行结构同文章列表
const RESULT_ROW = `<tr><td class="title_8">1.</td><td class="title_9"><a href="/article/Demo/1001">示例搜索命中</a></td><td class="title_10">2026-08-01</td><td class="title_12">|&ensp;<a href="/user/query/user_a" class="c63f">user_a</a></td><td class="title_11 middle">5</td><td class="title_10"><a href="/article/Demo/1001?p=1#a5" title="跳转至最后回复">2026-08-02</a></td><td class="title_12">|&ensp;<a href="/user/query/user_b" class="c09f">user_b</a></td></tr>`;

const ANON_RESULT_ROW = `<tr><td class="title_8 bg-odd">2.</td><td class="title_9 bg-odd"><a href="/article/Anon/2001">匿名搜索命中</a></td><td class="title_10 bg-odd">2026-08-03</td><td class="title_12 bg-odd">|&ensp;<a href="/user/query/IWhisper#123" class="c63f">IWhisper#123</a></td><td class="title_11 middle bg-odd">0</td><td class="title_10 bg-odd"><a href="/article/Anon/2001?p=1#a0" title="跳转至最后回复">2026-08-03</a></td><td class="title_12 bg-odd">|&ensp;<a href="/user/query/IWhisper#123" class="c09f">IWhisper#123</a></td></tr>`;

const PAGE = `<div class="b-content"><table class="board-list tiz" cellpadding="0" cellspacing="0">${RESULT_ROW}${ANON_RESULT_ROW}</table></div>`;

describe("crawl/search — parseSearchResults", () => {
  it("解析命中文章：标题/URL/作者/日期/回复数", () => {
    const rows = parseSearchResults("Demo", PAGE);
    expect(rows).toHaveLength(2);

    const r = rows[0]!;
    expect(r.title).toBe("示例搜索命中");
    expect(r.url).toBe("/article/Demo/1001");
    expect(r.boardEname).toBe("Demo");
    expect(r.date).toBe("2026-08-01");
    expect(r.authorRaw).toBe("user_a");
    expect(r.authorUid).toBe("user_a");
    expect(r.replyCount).toBe(5);
    expect(r.lastReplierUid).toBe("user_b");
  });

  it("搜索结果匿名作者：isAnon + uid=null", () => {
    const rows = parseSearchResults("Anon", PAGE);
    const anon = rows[1]!;
    expect(anon.title).toBe("匿名搜索命中");
    expect(anon.authorRaw).toBe("IWhisper#123");
    expect(anon.authorUid).toBeNull();
  });

  it("空结果表 → 空数组", () => {
    const empty = `<div class="b-content"><table class="board-list tiz"></table></div>`;
    expect(parseSearchResults("Demo", empty)).toHaveLength(0);
  });
});

describe("crawl/search — URL 辅助", () => {
  it("keywordFromUrl / boardFromSearchUrl", () => {
    expect(keywordFromUrl("/s/article?b=Demo&t1=%E7%BA%A2&p=1")).toBe("红");
    expect(boardFromSearchUrl("/s/article?t1=abc&b=Demo")).toBe("Demo");
    expect(boardFromSearchUrl("/s/article?t1=abc")).toBe("");
  });
});

describe("crawl/search — HttpSearchRepository.searchUrl", () => {
  it("版面内搜索：b + t1，中文 UTF-8 编码", () => {
    const repo = new HttpSearchRepository();
    const url = repo.searchUrl({ boardEname: "Demo", keyword: "红" });
    expect(url.startsWith("/s/article?")).toBe(true);
    expect(url).toContain("b=Demo");
    expect(url).toContain("t1=" + encodeURIComponent("红"));
    // URLSearchParams 空格 → %20
    expect(repo.searchUrl({ keyword: "a b" })).toContain("t1=a%20b");
  });

  it("全站搜索（无版块）：b 缺失但 au 仍存在", () => {
    const repo = new HttpSearchRepository();
    const url = repo.searchUrl({ keyword: "k" });
    expect(url.startsWith("/s/article?")).toBe(true);
    expect(url).not.toContain("b=");
    expect(url).toContain("t1=k");
    expect(url).toContain("au=");
  });

  it("搜索 URL 总带 au=（空或用户传值）", () => {
    const repo = new HttpSearchRepository();
    // 无 author → 空 au=
    expect(repo.searchUrl({ keyword: "k" })).toContain("au=");
    // 有 author → au 值编码
    expect(repo.searchUrl({ keyword: "k", author: "user_a" })).toContain("au=user_a");
  });
});
