import { load } from "cheerio";
import { routes, selectors, fillRoute } from "../utils/config.js";
import { ajaxGet } from "../utils/http-client.js";
import { requireLogin } from "../auth/auth.js";
import type { Article } from "../utils/types.js";

/**
 * 爬取指定版块的文章列表（首页前 30 篇）。
 * 需要先登录。
 */
export async function fetchBoardArticles(
  boardName: string,
): Promise<Article[]> {
  requireLogin();

  const path = fillRoute(routes.board_articles, { boardName });
  const html = await ajaxGet(path);
  const $ = load(html);
  const articles: Article[] = [];
  const sel = selectors.article_list;

  $(sel.row_selector).each((_, tr) => {
    const $tr = $(tr);

    // 标题在普通列或置顶列
    let titleEl = $tr.find(sel.title_normal).first();
    if (!titleEl.length) titleEl = $tr.find(sel.title_pinned).first();
    const title = titleEl.text().trim();
    const url = titleEl.attr("href") || "";

    // 作者
    const $authorLinks = $tr.find(sel.author_link);
    const author = $authorLinks.first().text().trim();

    // 日期
    const dateMatch = $tr.text().match(new RegExp(sel.date_regex));
    const date = dateMatch ? dateMatch[0]! : "";

    if (title && url) {
      articles.push({ title, url, author, date });
    }
  });

  return articles;
}
