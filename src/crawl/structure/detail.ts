import { load } from "cheerio";
import type { AnyNode } from "domhandler";
import { selectors } from "../../core/config.js";
import type { Board } from "../../models/index.js";
import { extractName, extractHref, extractBoardEname } from "./parser.js";
import type { AjaxEntry } from "./repository.js";

/**
 * 将 section detail 页 HTML 解析为版块列表（只含静态字段）。
 *
 * HTML <table> 行同时包含分区行（二级目录）与版块行，
 * 而 entries 是已经过滤后的版块条目，因此【不能按索引一一对应】，
 * 必须先从每行 <a href="/board/{ename}"> 提取 ename 建索引，再按 ename 匹配。
 *
 * 只解析基本不变的静态字段（名称、版主）。
 * 流量数据（帖子数、主题数、在线人数）由 traffic 模块实时获取，不在此解析。
 *
 * @param html    section detail 页面 HTML
 * @param entries 该分区下所有版块的 AJAX 条目
 * @returns 版块列表（含名称、版主）
 */
export function parseSectionDetailHtml(
  html: string,
  entries: AjaxEntry[],
): Board[] {
  const $ = load(html);
  const sel = selectors.board_list;

  // 建立 HTML 行索引：版块 ename → <tr> 元素（.toArray() 返回 AnyNode，$(node) 可直接包装）
  const rowByEname = new Map<string, AnyNode>();
  $(sel.row_selector).each((_, tr) => {
    const $tr = $(tr);
    const href = $tr.find(sel.ename).find("a").first().attr("href") || "";
    const m = href.match(/\/board\/(.+)/);
    const ename = m ? m[1]!.trim() : "";
    if (ename) rowByEname.set(ename, tr);
  });

  const boards: Board[] = [];

  for (const entry of entries) {
    const name = extractName(entry.t);
    if (!name) continue;

    // 版块英文名：从 entry 的 t 字段 href 提取（AJAX 数据，权威来源）
    const entryEname = extractBoardEname(extractHref(entry.t));

    const tr = entryEname ? rowByEname.get(entryEname) : undefined;
    if (!tr) {
      // HTML 中无对应行（行数不足 / ename 匹配失败）→ 补充基本版块
      boards.push({
        name,
        ename: entryEname || `(${name})`,
        manager: [],
      });
      continue;
    }

    const $tr = $(tr);

    // 版主：title_2 单元格内可能含多个版主链接（<a href="/user/query/xxx">xxx</a> 用 <br> 分隔）
    // 逐个提取链接文本，避免 .text() 把多个名字粘连（如 "SYSOPyidiand2"）
    const managers = $tr
      .find(sel.manager)
      .find(sel.manager_link)
      .map((_, a) => $(a).text().trim())
      .get()
      .filter((m) => m.length > 0);

    boards.push({ name, ename: entryEname, manager: managers });
  }

  return boards;
}
