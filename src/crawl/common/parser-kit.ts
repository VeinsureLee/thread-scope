import * as crypto from "crypto";
import type { CheerioAPI } from "cheerio";
import { selectors } from "../../core/config.js";

// ============================================================
// parser-kit：跨领域共享的解析小工具（docs/01 §4.2）
// ============================================================
// - url 哈希（article 去重锚点）
// - 作者链接 → uid
// - 详情页英文时间解析（如 "Thu Oct 19 11:04:35 2017"）
// - 匿名识别（列表页 / 详情页两套信号，见 selectors.anonymous）
// 不含任何领域业务，供各领域 parser 组合使用。
// ============================================================

/** 计算 url 的确定性哈希（sha1），作为 article 去重锚点 */
export function hashUrl(url: string): string {
  return crypto.createHash("sha1").update(url).digest("hex");
}

/**
 * 从作者链接 href 提取用户 ID（uid）。
 * 链接形如 "/user/query/user_a"、"https://example.com/user/query/xxx"。
 * 匿名链接 "/user/query/IWhisper#938" → 返回 "IWhisper#938"（配合 isAnonLink 判断匿名）。
 */
export function uidFromHref(href: string | undefined): string | null {
  if (!href) return null;
  const m = href.match(/\/user\/query\/([^?#]+)/);
  return m ? m[1]! : null;
}

/** 判断作者链接是否为"匿名占位链接"（悄悄话版，href 含 /user/query/IWhisper#数字） */
export function isAnonLink(href: string | undefined): boolean {
  if (!href) return false;
  // uid_regex 形如 "/user/query/IWhisper#\d+"，直接对原始 href 匹配
  return new RegExp(selectors.anonymous.uid_regex).test(href);
}

/** 判断一个作者显示名是否为匿名占位名（IWhisper#数字） */
export function isAnonName(name: string): boolean {
  return new RegExp(selectors.anonymous.name_regex).test(name.trim());
}

/**
 * 详情页匿名判断（推荐用法）。
 *
 * 页面差异（docs/04 §1.7）：
 * - 列表页/搜索：匿名作者【有】链接，但 href 为 /user/query/IWhisper#数字 → 用 isAnonLink
 * - 详情页：匿名作者【无】链接，且 .a-u-sex 内存在隐藏图标 → 用本函数
 *
 * ⚠ 重要：不能仅凭 class "ico-pos-offline-hide" 判匿名——普通用户的"性别保密"图标
 * 也是该 class（title="性别保密哦 离线"）。真正的匿名信号是
 * title="隐藏" 且【无】作者链接。
 *
 * @param $        已加载文档（避免重复 load）
 * @param name     作者显示名
 * @param hasLink  是否解析到作者链接（详情页为 a 链接存在性）
 * @param sexSamp  .a-u-sex samp 元素（详情页性别图标，可选）
 * @returns 是否匿名
 */
export function isAnonymousWith$(
  $: CheerioAPI,
  name: string,
  hasLink: boolean,
  sexSamp: ReturnType<CheerioAPI> | undefined = undefined,
): boolean {
  // 1. 名称本身匹配匿名占位名（IWhisper#数字）
  if (isAnonName(name)) return true;
  // 2. 详情页信号：title="隐藏"（真正的匿名隐藏图标）；性别保密(title="性别保密哦 离线")不算
  if (sexSamp && sexSamp.length > 0) {
    const title = sexSamp.attr("title") || "";
    if (title.includes(selectors.anonymous.hide_title)) {
      return true;
    }
  }
  return false;
}

/** 判断内容文本是否带"匿名天使的家"来源标记（详情页正文首行的权威信号） */
export function isAnonSource(content: string): boolean {
  return content.includes(selectors.anonymous.from_anon);
}

/**
 * 解析详情页发帖时间：如 "北邮人论坛 (Thu Oct 19 11:04:35 2017), 站内" → ISO 本地字符串。
 * 无法解析返回 null。
 */
export function parsePostTime(text: string): string | null {
  const m = text.match(
    /\(([A-Z][a-z]{2})\s+([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(\d{4})\)/,
  );
  if (!m) return null;

  const MONTHS: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };
  const month = MONTHS[m[2]!];
  if (!month) return null;

  const day = m[3]!.padStart(2, "0");
  const time = `${m[4]}:${m[5]}:${m[6]}`;
  const year = m[7];
  // 本地时区 ISO 字符串（与现有 crawled_at 一致）
  return `${year}-${month}-${day}T${time}`;
}
