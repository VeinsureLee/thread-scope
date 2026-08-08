import { describe, it, expect } from "vitest";
import { HttpSearchRepository } from "../../src/crawl/search/repository.js";

/**
 * 按作者搜索 URL 构造（bug 回归测试）。
 *
 * 2026-08-08 用户报告：按 authorID 搜索时输出 `关键字: undefined`，
 * 实际搜索能返回 20 条结果，但输出显示错误。URL 构造本身正确：
 * - 有 author 无 keyword → 省略 t1，只拼 au（`/s/article?b=X&au=uid`）
 * - 有 keyword → 拼 t1 + au
 * 此处锁定 URL 语义，防止回归。
 */
describe("crawl/search — searchUrl（按作者搜索）", () => {
  const repo = new HttpSearchRepository();

  it("作者搜索（无关键字）→ 省略 t1，只拼 au", () => {
    const url = repo.searchUrl({ boardEname: "Demo", keyword: "", author: "user_a" });
    expect(url).toBe("/s/article?b=Demo&au=user_a");
    expect(url).not.toContain("t1=");
  });

  it("关键字搜索 → t1 + au（au 恒存在）", () => {
    const url = repo.searchUrl({ boardEname: "Demo", keyword: "考研", author: undefined });
    expect(url).toBe("/s/article?b=Demo&t1=%E8%80%83%E7%A0%94&au=");
  });

  it("作者 + 关键字 → 两者都拼", () => {
    const url = repo.searchUrl({ boardEname: "Demo", keyword: "考研", author: "user_a" });
    expect(url).toBe("/s/article?b=Demo&t1=%E8%80%83%E7%A0%94&au=user_a");
  });
});
