import { describe, it, expect } from "vitest";
import { parseArticleList, articleIdFromUrl, boardFromArticleUrl } from "../../src/crawl/article/parser.js";
import { hashUrl } from "../../src/crawl/common/parser-kit.js";

// 合成测试数据（不包含真实论坛内容，避免泄露用户信息）
const PINNED_ROW = `<tr class="top"><td class="title_8"><a target="_blank" href="/article/Demo/1001" title="在新窗口打开此主题"><samp class="tag ico-pos-article-top"></samp></a></td><td class="title_9"><a href="/article/Demo/1001">置顶示例帖</a><span class="threads-tab">[<a href="/article/Demo/1001?p=2">2</a><a href="/article/Demo/1001?p=3">3</a>]</span></td><td class="title_10">2026-08-01</td><td class="title_12">|&ensp;<a href="/user/query/user_a" class="c63f">user_a</a></td><td class="title_11 middle">12</td><td class="title_10"><a href="/article/Demo/1001?p=3#a12" title="跳转至最后回复">2026-08-02</a></td><td class="title_12">|&ensp;<a href="/user/query/user_b" class="c09f">user_b</a></td></tr>`;

const NORMAL_ROW = `<tr><td class="title_8 bg-odd"><a target="_blank" href="/article/Demo/1002" title="在新窗口打开此主题"><samp class="tag ico-pos-article-normal"></samp></a></td><td class="title_9 bg-odd"><a href="/article/Demo/1002">普通示例帖</a></td><td class="title_10 bg-odd">2026-08-03</td><td class="title_12 bg-odd">|&ensp;<a href="/user/query/user_c" class="c63f">user_c</a></td><td class="title_11 middle bg-odd">3</td><td class="title_10 bg-odd"><a href="/article/Demo/1002?p=1#a3" title="跳转至最后回复">2026-08-03</a></td><td class="title_12 bg-odd">|&ensp;<a href="/user/query/user_d" class="c09f">user_d</a></td></tr>`;

function makeTable(rows: string[]): string {
  return `<table class="board-list"><tbody>${rows.join("")}</tbody></table>`;
}

describe("crawl/article — parseArticleList", () => {
  it("解析普通帖：标题/URL/日期/作者/回复数", () => {
    const rows = parseArticleList("Demo", makeTable([NORMAL_ROW]));
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.title).toBe("普通示例帖");
    expect(r.url).toBe("/article/Demo/1002");
    expect(r.date).toBe("2026-08-03");
    expect(r.isPinned).toBe(false);
    expect(r.authorRaw).toBe("user_c");
    expect(r.authorUid).toBe("user_c");
    expect(r.replyCount).toBe(3);
    expect(r.lastReply).toBe("2026-08-03");
    expect(r.lastReplierUid).toBe("user_d");
  });

  it("解析置顶帖：isPinned=true", () => {
    const rows = parseArticleList("Demo", makeTable([PINNED_ROW]));
    const r = rows[0]!;
    expect(r.isPinned).toBe(true);
    expect(r.title).toBe("置顶示例帖");
    expect(r.authorUid).toBe("user_a");
    expect(r.replyCount).toBe(12);
    expect(r.lastReply).toBe("2026-08-02");
    expect(r.lastReplierUid).toBe("user_b");
  });

  it("空表格 → 空数组", () => {
    expect(parseArticleList("Demo", makeTable([]))).toHaveLength(0);
  });

  it("无标题行被跳过", () => {
    const row = `<tr><td class="title_9"><a href="">空标题</a></td></tr>`;
    expect(parseArticleList("Demo", makeTable([row]))).toHaveLength(0);
  });
});

describe("crawl/article — url 辅助", () => {
  it("articleIdFromUrl 提取数字 ID", () => {
    expect(articleIdFromUrl("/article/Demo/1001")).toBe("1001");
    expect(articleIdFromUrl("/article/Anon/2002")).toBe("2002");
    expect(articleIdFromUrl("/board/Demo")).toBeNull();
  });

  it("boardFromArticleUrl 提取版块", () => {
    expect(boardFromArticleUrl("/article/Demo/1001")).toBe("Demo");
    expect(boardFromArticleUrl("/article/Anon/2002")).toBe("Anon");
  });

  it("hashUrl 稳定且定长", () => {
    const h1 = hashUrl("/article/Demo/1001");
    const h2 = hashUrl("/article/Demo/1001");
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(40); // sha1 hex
  });
});
