import { load } from "cheerio";
import { selectors } from "../../core/config.js";
import type { TrafficInfo } from "../../model/dto/index.js";

/**
 * 从 section detail HTML（带 ?count=1）中解析指定版块的流量信息。
 *
 * @param html         section detail 页面 HTML
 * @param boardEnames  需要获取流量的版块英文名集合（已清理括号）
 * @param boardNames   需要获取流量的版块中文名集合（纯中文名，如 "悄悄话"）
 * @returns 匹配到的流量信息列表
 */
export function parseSectionTraffic(
  html: string,
  boardEnames: Set<string>,
  boardNames?: Set<string>,
): TrafficInfo[] {
  const $ = load(html);
  const rows = $(selectors.board_list.row_selector).toArray();
  const result: TrafficInfo[] = [];
  const sel = selectors.board_stats;

  for (const row of rows) {
    const $tr = $(row);
    const $nameCell = $tr.find(selectors.board_list.ename).first();

    // 中文名：从 <a> 标签文本提取（如 <a href="/board/Beauty">美容护肤</a> → "美容护肤"）
    const name = $nameCell.find("a").first().text().trim();

    // 英文名：优先从 <a href="/board/Beauty"> 提取，fallback 到纯文本模式
    const href = $nameCell.find("a").first().attr("href") || "";
    const boardMatch = href.match(/\/board\/(.+)/);
    const ename = boardMatch
      ? boardMatch[1]!.trim()
      : $nameCell.text().trim().replace(name, "").trim().replace(/[()（）]/g, "");

    // 按 ename 匹配（含括号清理），若 ename 为空则回退到按中文名匹配
    const enameMatch = boardEnames.has(ename) || boardEnames.has(ename.replace(/[()]/g, ""));
    const nameMatch = boardNames ? boardNames.has(name) : false;
    if (!enameMatch && !nameMatch) continue;
    if (!name && !ename) continue;

    const todayPosts = sel.today_posts
      ? $tr.find(sel.today_posts).text().trim()
      : "";
    const threads = $tr.find(selectors.board_list.threads).text().trim();
    const posts = $tr.find(selectors.board_list.posts).text().trim();
    const onlineUsers = sel.online_users
      ? $tr.find(sel.online_users).text().trim()
      : "";

    result.push({ ename, name, onlineUsers, todayPosts, threads, posts });
  }

  return result;
}
