import { load } from "cheerio";
import type { User, UserProfile } from "../../models/index.js";
import { selectors } from "../../core/config.js";
import { uidFromHref, isAnonLink } from "../common/parser-kit.js";

/**
 * 从"作者名 + 作者链接 href"解析出作者身份（列表页/搜索页通用）。
 *
 * 身份解析是【唯一权威】，供 article / content 复用（docs/01 §4.4）。
 *
 * 匿名规则（docs/04 §1.7）：
 * - 列表页：匿名作者【有】链接，但 href 为 /user/query/IWhisper#数字 → isAnon=true，uid=null
 * - 实名：有 /user/query/{uid} 链接 → isAnon=false，uid={uid}
 * - 无链接：isAnon=false，uid=null（authorRaw 仍保留显示名）
 *
 * @returns 作者身份；uid 为 null 表示不可作为持久身份写入 user 表
 */
export function parseAuthor(
  name: string,
  href: string | undefined,
): { uid: string | null; name: string; isAnon: boolean } {
  const trimmed = name.trim();

  // 匿名：链接是 /user/query/IWhisper#数字，或名称本身是 IWhisper#数字
  if (isAnonLink(href) || /^IWhisper#\d+$/.test(trimmed)) {
    return { uid: null, name: trimmed, isAnon: true };
  }

  const uid = uidFromHref(href);
  return { uid, name: trimmed, isAnon: false };
}

/**
 * 从用户资料弹窗 HTML（/user/query/{uid}，element-05）解析用户资料。
 *
 * @param uid 用户 ID（如 "user_a"）
 * @param html 弹窗 HTML（含 section.u-query）
 */
export function parseUserProfile(uid: string, html: string): UserProfile {
  const $ = load(html);
  const $section = $(selectors.user_profile.wrap);
  if ($section.length === 0) {
    throw new Error(`用户资料解析失败: section.u-query 未找到 (uid=${uid})`);
  }

  // 提取 dl 内的 dt→dd 键值对
  const dlMap = (dlSel: string): Record<string, string> => {
    const map: Record<string, string> = {};
    $section.find(dlSel).each((_, dl) => {
      const $dl = $(dl);
      $dl.children("dt").each((i, dt) => {
        const key = $(dt).text().replace(/[：:]/g, "").trim();
        const value = $dl.children("dd").eq(i).text().trim();
        if (key) map[key] = value;
      });
    });
    return map;
  };

  const base = dlMap("article.u-info dl");
  const detail = dlMap("article.u-detail dl");

  return {
    uid,
    nickname: base["昵 称"] ?? base["昵称"] ?? "",
    gender: base["性 别"] ?? "",
    constellation: base["星 座"] ?? "",
    qq: base["QQ"] ?? "",
    msn: base["MSN"] ?? "",
    homepage: base["主 页"] ?? "",
    level: detail["论坛等级"] ?? "",
    title: detail["特殊头衔"] ?? "",
    postCount: detail["帖子总数"] ?? "",
    points: detail["积分"] ?? "",
    vitality: detail["生命力"] ?? "",
    lastLogin: detail["上次登录"] ?? "",
    lastIp: detail["最后访问IP"] ?? "",
    onlineStatus: detail["当前状态"] ?? "",
  };
}

/**
 * 将 UserProfile 转换为 User（供落库 upsertUser 使用）。
 * 仅当 uid 有效时才有意义（匿名 uid 为 null 时调用方不应调用）。
 */
export function profileToUser(profile: UserProfile): User {
  return {
    uid: profile.uid,
    name: profile.nickname || profile.uid,
    isAnon: false,
    avatar: null,
    profile,
    updatedAt: new Date().toISOString(),
  };
}
