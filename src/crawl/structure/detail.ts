import { load } from "cheerio";
import { selectors } from "../../core/config.js";
import type { Board } from "../../models/index.js";
import { extractName } from "./parser.js";
import type { AjaxEntry } from "./repository.js";

/**
 * 将 section detail 页 HTML 解析为版块列表。
 *
 * 注意：AJAX JSON 返回的条目顺序与 HTML <table> 行顺序一致，
 * 因此按索引一一对应匹配。
 *
 * @param html    section detail 页面 HTML
 * @param entries 该分区下所有版块的 AJAX 条目
 * @returns 版块列表（含板主、主题数、帖子数等）
 */
export function parseSectionDetailHtml(
  html: string,
  entries: AjaxEntry[],
): Board[] {
  const $ = load(html);
  const sel = selectors.board_list;

  const rows = $(sel.row_selector).toArray();
  const boards: Board[] = [];

  for (let i = 0; i < Math.min(entries.length, rows.length); i++) {
    const entry = entries[i]!;
    const $tr = $(rows[i]!);

    const name = extractName(entry.t);
    if (!name) continue;

    // 英文名：优先从 <a> 的 href 中提取 /board/{ename}
    const $a = $tr.find(sel.ename).find("a").first();
    const href = $a.attr("href") || "";
    const boardMatch = href.match(/\/board\/(.+)/);
    const ename = boardMatch
      ? boardMatch[1]!.trim()
      : $tr.find(sel.ename).text().trim().replace(name, "").trim();
    const manager = $tr
      .find(sel.manager)
      .text()
      .trim()
      .replace(/\s+/g, " ");
    const threads = $tr.find(sel.threads).text().trim();
    const posts = $tr.find(sel.posts).text().trim();

    const statsSel = selectors.board_stats.online_users;
    const onlineUsers = statsSel
      ? $tr.find(statsSel).text().trim()
      : undefined;

    boards.push({ name, ename, manager, posts, threads, onlineUsers });
  }

  // 如果 HTML 行数不够，用 entry 补充基本版块
  for (let i = rows.length; i < entries.length; i++) {
    const entry = entries[i]!;
    const name = extractName(entry.t);
    if (!name) continue;
    boards.push({
      name,
      ename: `(${name})`,
      manager: "",
      posts: "",
      threads: "",
    });
  }

  return boards;
}
