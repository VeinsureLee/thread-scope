import { describe, it, expect } from "vitest";
import { load } from "cheerio";

/**
 * 集成测试：用本地 HTML fixture 验证 HTML 解析逻辑。
 *
 * 这些测试不访问网络，仅验证 cheerio 选择器的正确性。
 * 论坛 HTML 结构变更时修改这些 fixture 和测试即可。
 */

// 模拟版块列表页面 HTML（分区页面结构）
const SECTION_HTML = `
<html>
<body>
<table class="board-list">
  <tbody>
    <tr>
      <td class="title_1"><a href="/board/example">招聘信息</a> (example)</td>
      <td class="title_2">板主: admin</td>
      <td class="title_6">12345</td>
      <td class="title_7">67890</td>
    </tr>
    <tr>
      <td class="title_1"><a href="/board/example2">兼职实习</a> (example2)</td>
      <td class="title_2">板主: admin</td>
      <td class="title_6">5432</td>
      <td class="title_7">21098</td>
    </tr>
    <tr>
      <!-- 空行：无版块名 -->
      <td class="title_1"></td>
      <td class="title_2"></td>
      <td class="title_6"></td>
      <td class="title_7"></td>
    </tr>
  </tbody>
</table>
</body>
</html>
`;

// 模拟文章列表页面 HTML
const ARTICLE_LIST_HTML = `
<html>
<body>
<table class="board-list">
  <tbody>
    <tr>
      <td class="title_9"><a href="/article/example/123">【校招】字节跳动内推</a></td>
      <td><a href="/user/query/alice">alice</a></td>
      <td>2025-01-15 14:30:00</td>
    </tr>
    <tr>
      <td class="title_9"><a href="/article/example/456">【内推】华为秋招</a></td>
      <td><a href="/user/query/bob">bob</a></td>
      <td>2025-01-16 10:20:00</td>
    </tr>
    <tr class="top">
      <td class="title_3"><a href="/article/example/789">【公告】发帖规范</a></td>
      <td><a href="/user/query/admin">admin</a></td>
      <td>2024-06-01 08:00:00</td>
    </tr>
    <tr>
      <!-- 无标题行 -->
      <td class="title_9"></td>
      <td></td>
      <td></td>
    </tr>
  </tbody>
</table>
</body>
</html>
`;

describe("HTML 解析 (cheerio)", () => {
  // ========== 版块列表解析 ==========
  describe("版块列表", () => {
    it("解析版块名称和英文名", () => {
      const $ = load(SECTION_HTML);
      const boards: { name: string; ename: string }[] = [];

      $("table.board-list tbody tr").each((_, tr) => {
        const $tr = $(tr);
        const name = $tr.find(".title_1 a").first().text().trim();
        const ename = $tr
          .find(".title_1")
          .text()
          .trim()
          .replace(name, "")
          .trim();
        if (name) boards.push({ name, ename });
      });

      expect(boards).toHaveLength(2);
      expect(boards[0]).toEqual({ name: "招聘信息", ename: "(example)" });
      expect(boards[1]).toEqual({ name: "兼职实习", ename: "(example2)" });
    });

    it("解析版主和统计信息", () => {
      const $ = load(SECTION_HTML);
      const firstRow = $("table.board-list tbody tr").first();
      const manager = firstRow.find(".title_2").text().trim();
      const threads = firstRow.find(".title_6").text().trim();
      const posts = firstRow.find(".title_7").text().trim();

      expect(manager).toContain("admin");
      expect(threads).toBe("12345");
      expect(posts).toBe("67890");
    });

    it("跳过空行（无版块名称）", () => {
      const $ = load(SECTION_HTML);
      let count = 0;
      $("table.board-list tbody tr").each((_, tr) => {
        const name = $(tr).find(".title_1 a").first().text().trim();
        if (name) count++;
      });
      expect(count).toBe(2); // 第三行空，不计入
    });
  });

  // ========== 文章列表解析 ==========
  describe("文章列表", () => {
    it("解析标题和 URL（title_9 列）", () => {
      const $ = load(ARTICLE_LIST_HTML);
      const firstTitle = $("table.board-list tbody tr")
        .first()
        .find(".title_9 a")
        .first();

      expect(firstTitle.text().trim()).toBe("【校招】字节跳动内推");
      expect(firstTitle.attr("href")).toBe("/article/example/123");
    });

    it("解析 title_3 列（置顶帖/公告帖）", () => {
      const $ = load(ARTICLE_LIST_HTML);
      // 找第三行的 title_3 link
      const trs = $("table.board-list tbody tr").toArray();
      const thirdRow = $(trs[2]!);
      const titleEl = thirdRow.find(".title_3 a").first();

      expect(titleEl.text().trim()).toBe("【公告】发帖规范");
      expect(titleEl.attr("href")).toBe("/article/example/789");
    });

    it("解析作者（通过 /user/query/ 链接）", () => {
      const $ = load(ARTICLE_LIST_HTML);
      const authors: string[] = [];
      $('a[href*="/user/query/"]').each((_, el) => {
        const text = $(el).text().trim();
        if (text) authors.push(text);
      });

      expect(authors).toContain("alice");
      expect(authors).toContain("bob");
      expect(authors).toContain("admin");
    });

    it("提取日期时间（YYYY-MM-DD HH:mm:ss 格式）", () => {
      const $ = load(ARTICLE_LIST_HTML);
      const text = $("table.board-list tbody tr").first().text();
      const match = text.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);

      expect(match).not.toBeNull();
      expect(match![0]).toBe("2025-01-15 14:30:00");
    });

    it("解析完整文章列表结构", () => {
      const $ = load(ARTICLE_LIST_HTML);
      const articles: { title: string; url: string; author: string; date: string }[] = [];

      $("table.board-list tbody tr").each((_, tr) => {
        const $tr = $(tr);
        let titleEl = $tr.find(".title_9 a").first();
        if (!titleEl.length) titleEl = $tr.find(".title_3 a").first();
        const title = titleEl.text().trim();
        const url = titleEl.attr("href") || "";
        const author = $tr.find('a[href*="/user/query/"]').first().text().trim();
        const dateMatch = $tr.text().match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
        const date = dateMatch ? dateMatch[0] : "";

        if (title && url) {
          articles.push({ title, url, author, date });
        }
      });

      expect(articles).toHaveLength(3);
      expect(articles[0]!.title).toBe("【校招】字节跳动内推");
      expect(articles[0]!.url).toBe("/article/example/123");
      expect(articles[0]!.author).toBe("alice");
      expect(articles[2]!.title).toBe("【公告】发帖规范");
      expect(articles[2]!.url).toBe("/article/example/789");
    });

    it("跳过无标题行", () => {
      const $ = load(ARTICLE_LIST_HTML);
      let nonTitles = 0;
      $("table.board-list tbody tr").each((_, tr) => {
        const $tr = $(tr);
        let titleEl = $tr.find(".title_9 a").first();
        if (!titleEl.length) titleEl = $tr.find(".title_3 a").first();
        const title = titleEl.text().trim();
        if (!title) nonTitles++;
      });
      expect(nonTitles).toBe(1); // 第四行无标题
    });
  });
});
