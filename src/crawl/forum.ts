import { load } from "cheerio";
import { config } from "../core/config.js";
import { ajaxGet } from "../core/http-client.js";
import { requireLogin } from "../auth/auth.js";
import type { Section, Board, Article } from "../core/types.js";

// ========== 分区 ==========

/**
 * 获取论坛首页的所有分区列表。
 * 需要先登录。
 */
export async function fetchSections(): Promise<Section[]> {
  requireLogin();

  const secJson = await ajaxGet(
    `/section/ajax_list.json?uid=${config.userId}&root=list-section`,
  );
  const sections = JSON.parse(secJson) as { t: string; id: string }[];
  return sections.map((sec) => {
    const m = sec.t.match(/>(.+?)</);
    const name = m ? m[1]! : sec.t;
    return { id: sec.id, name };
  });
}

// ========== 版块 ==========

/**
 * 获取指定分区下的所有版块列表。
 * 需要先登录。
 *
 * @param sectionId - 分区 ID
 */
export async function fetchBoardsInSection(
  sectionId: string,
): Promise<Board[]> {
  requireLogin();

  const secHtml = await ajaxGet(`/section/${sectionId}`);
  const $sec = load(secHtml);
  const boards: Board[] = [];

  $sec("table.board-list tbody tr").each((_, tr) => {
    const $tr = $sec(tr);
    const name = $tr.find(".title_1 a").first().text().trim();
    const ename = $tr
      .find(".title_1")
      .text()
      .trim()
      .replace(name, "")
      .trim();
    const manager = $tr.find(".title_2").text().trim().replace(/\s+/g, " ");
    const threads = $tr.find(".title_6").text().trim();
    const posts = $tr.find(".title_7").text().trim();
    if (name) {
      boards.push({ name, ename, manager, posts, threads });
    }
  });

  return boards;
}

// ========== 文章 ==========

/**
 * 爬取指定版块的文章列表（首页前 30 篇）。
 * 需要先登录。
 *
 * @param boardName - 版块英文名
 */
export async function fetchBoardArticles(
  boardName: string,
): Promise<Article[]> {
  requireLogin();

  const html = await ajaxGet(`/board/${boardName}`);
  const $ = load(html);
  const articles: Article[] = [];

  $("table.board-list tbody tr, table.t-con tbody tr").each((_, tr) => {
    const $tr = $(tr);
    // 标题在 title_9 或 title_3 列
    let titleEl = $tr.find(".title_9 a").first();
    if (!titleEl.length) titleEl = $tr.find(".title_3 a").first();
    const title = titleEl.text().trim();
    const url = titleEl.attr("href") || "";
    // 作者
    const $authorLinks = $tr.find('a[href*="/user/query/"]');
    const author = $authorLinks.first().text().trim();
    // 日期
    const dateMatch = $tr
      .text()
      .match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
    const date = dateMatch ? dateMatch[0]! : "";

    if (title && url) {
      articles.push({ title, url, author, date });
    }
  });

  return articles;
}

// ========== 未来扩展 ==========

/**
 * 【计划中】爬取帖子正文及回复。
 */
// export async function fetchThreadDetail(threadUrl: string): Promise<ThreadDetail> { ... }

/**
 * 【计划中】获取版块统计信息（在线人数等）。
 */
// export async function fetchBoardStats(boardName: string): Promise<BoardStats> { ... }
