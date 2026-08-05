/**
 * 将 AJAX 返回的 id（如 "sec-0"）转为 HTML 页需要的 sectionId（如 "0"）。
 * 同时把从 href 提取的值（如 "0"）直接转为页面可用的数字格式。
 */
export function toSectionHtmlId(ajaxId: string): string {
  // "sec-0" → "0", "sec-BBSLOG" → "BBSLOG"
  return ajaxId.replace(/^sec-/, "");
}
