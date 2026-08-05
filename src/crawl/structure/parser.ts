import { selectors } from "../../core/config.js";

const HREF_REGEX = new RegExp(selectors.section_ajax.href_regex);

/** 从 t 字段 HTML 中提取 href 属性值 */
export function extractHref(t: string): string {
  const m = t.match(HREF_REGEX);
  return m ? m[1]! : "";
}

/** 判断 t 字段的 href 是否指向版块（/board/xxx） */
export function isBoardHref(href: string): boolean {
  return href.includes(selectors.section_ajax.board_href_keyword);
}

/** 判断 t 字段的 href 是否指向分区（/section/xxx） */
export function isSectionHref(href: string): boolean {
  return href.includes(selectors.section_ajax.section_href_keyword);
}

/** 从 /board/{ename} href 中提取版块英文名 */
export function extractBoardEname(href: string): string {
  const m = href.match(/\/board\/(.+)/);
  return m ? m[1]! : "";
}

/** 从 t 字段的 HTML 中提取中文名称 */
export function extractName(t: string): string {
  const m = t.match(selectors.section_ajax.name_regex);
  return m ? m[1]! : t;
}
