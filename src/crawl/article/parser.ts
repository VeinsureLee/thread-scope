import { load } from "cheerio";
import { selectors } from "../../core/config.js";
import { parseAuthor } from "../user/index.js";
import type { ArticleRow } from "../../model/dto/index.js";

/**
 * 解析版块文章列表页（/board/{ename}，element-03）。
 *
 * 表格行 td 结构（docs/04 §1.3）：
 *   title_8   类型图标（置顶/普通/精华）
 *   title_9   标题链接 + threads-tab 多页标记
 *   title_10  发帖日期（纯日期）
 *   title_12  发帖人（第一个 a[href*="/user/query/"]）
 *   title_11  回复数
 *   title_10  最新回复日期/时间（第二个）
 *   title_12  最新回复人（第二个）
 *
 * 置顶识别：tr.top 或 .ico-pos-article-top 图标（docs/04 §1.3 — 修复旧 title_pinned 误用 .title_3）
 * 作者解析复用 crawl/user 身份解析（docs/01 §4.4）。
 *
 * @param boardName  版块英文名（article_row.board_ename 的来源）
 * @param html       版块文章列表页 HTML
 * @param rowSelector 行选择器覆盖（默认 article_list.row_selector；
 *                    搜索结果页表多 .tiz class，可传 selectors.search.result_table 收敛）
 * @returns 文章行列表
 */
export function parseArticleList(
  boardName: string,
  html: string,
  rowSelector?: string,
): ArticleRow[] {
  const $ = load(html);
  const sel = selectors.article_list;
  const rows: ArticleRow[] = [];

  $(rowSelector ?? sel.row_selector).each((_, tr) => {
    const $tr = $(tr);

    // 标题
    const $title = $tr.find(sel.title).first();
    const title = $title.text().trim();
    const url = $title.attr("href") || "";
    if (!title || !url) return; // 无标题/无链接 → 跳过

    // 置顶：行 class=top 或图标 ico-pos-article-top
    const isPinned =
      $tr.is(sel.pinned_row) ||
      $tr.find(sel.pinned_icon).length > 0;

    // 日期列（两个 .title_10：发帖日期 + 最新回复日期）
    const $dates = $tr.find(sel.date_cell);
    const date = $dates.first().text().trim();
    const lastReply = $dates.eq(1).text().trim();

    // 作者列（两个 .title_12：发帖人 + 最新回复人）
    const $authorCells = $tr.find(sel.author_cell);
    const $authorLink = $authorCells.first().find(sel.author_link).first();
    const authorName = $authorLink.text().trim();
    const authorHref = $authorLink.attr("href") || undefined;
    const author = parseAuthor(authorName || $authorCells.first().text().replace(/[|]/g, "").trim(), authorHref);

    // 最新回复人
    const $lastReplierLink = $authorCells.eq(1).find(sel.author_link).first();
    const lastReplier = parseAuthor(
      $lastReplierLink.text().trim(),
      $lastReplierLink.attr("href") || undefined,
    );

    // 回复数
    const replyText = $tr.find(sel.reply_count).first().text().trim();
    const replyCount = parseInt(replyText, 10) || 0;

    rows.push({
      boardEname: boardName,
      title,
      url,
      date,
      isPinned,
      authorUid: author.uid,
      authorRaw: author.name,
      replyCount,
      lastReply,
      lastReplierUid: lastReplier.uid,
    });
  });

  return rows;
}

/** 从文章 URL（/article/{board}/{id}）提取文章 ID（末段数字）；解析失败返回 null */
export function articleIdFromUrl(url: string): string | null {
  const m = url.match(/\/article\/[^/]+\/(\d+)/);
  return m ? m[1]! : null;
}

/** 从文章 URL 提取版块英文名（/article/{board}/{id}）；解析失败返回 null */
export function boardFromArticleUrl(url: string): string | null {
  const m = url.match(/\/article\/([^/]+)\/\d+/);
  return m ? m[1]! : null;
}
