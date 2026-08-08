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

// ============================================================
// 用户资料解析（docs/06 §2.2 / §2.4）
//
// 数据源：
// - query.json  `/user/query/{uid}.json`（GET，单 uid，需登录）→ 主体字段
// - tquery      `/user/ajax_tquery.json`（POST list[]=uid，批量，需登录）→ 特殊头衔
// 旧版解析弹窗 HTML（section.u-query）的方式已废弃——该弹窗内容实际由 query.json
// 渲染，且直接 GET `/user/query/{uid}` 返回模板错误，故改为解析 JSON。
// ============================================================

/** query.json 原始响应（可空字段已标注） */
interface QueryJson {
  id: string;
  user_name?: string;
  face_url?: string;
  gender?: string; // "m" | "f"
  astro?: string;
  qq?: string;
  msn?: string;
  home_page?: string;
  level?: string;
  post_count?: number;
  score?: number;
  life?: number;
  last_login_time?: number; // unix 秒
  last_login_ip?: string;
  is_online?: boolean;
  follow_num?: number;
  fans_num?: number;
  status?: string;
  ajax_st: number;
}

/** tquery 原始响应（头衔批量） */
interface TQueryJson {
  data: Array<{ uid: string; path: Array<{ name?: string }> }> | false;
}

/**
 * 从 query.json 原始 JSON 解析用户资料（主体字段，不含特殊头衔）。
 *
 * 特殊头衔（title）由 tquery 提供，经 parseUserTitles 合并；本函数产出其余字段。
 *
 * @param uid  用户 ID
 * @param raw  query.json 原始响应字符串（GBK 已由 ajaxGet 解码）
 * @returns 解析后的 UserProfile（title 为空数组，fetchedAt 当前时间）
 */
export function parseUserProfile(uid: string, raw: string): UserProfile {
  const json = JSON.parse(raw) as QueryJson;
  if (json.ajax_st !== 1) {
    throw new Error(`用户资料接口返回失败 (uid=${uid}, ajax_st=${json.ajax_st})`);
  }

  const now = new Date().toISOString();
  const postCount = typeof json.post_count === "number" ? `${json.post_count}篇` : "";
  const lastLogin = typeof json.last_login_time === "number"
    ? new Date(json.last_login_time * 1000).toISOString()
    : "";

  return {
    uid,
    nickname: json.user_name ?? "",
    gender: genderText(json.gender),
    constellation: json.astro ?? "",
    qq: json.qq ?? "",
    msn: json.msn ?? "",
    homepage: json.home_page ?? "",
    avatar: json.face_url ?? "",
    level: json.level ?? "",
    title: [],
    postCount,
    points: typeof json.score === "number" ? String(json.score) : "",
    vitality: typeof json.life === "number" ? String(json.life) : "",
    lastLogin,
    lastIp: json.last_login_ip ?? "",
    onlineStatus: json.status ?? "",
    isOnline: json.is_online ?? false,
    followNum: json.follow_num ?? 0,
    fansNum: json.fans_num ?? 0,
    fetchedAt: now,
  };
}

/**
 * 从 tquery 原始 JSON 提取特殊头衔名列表（可多个）。
 *
 * @param uid 用户 ID
 * @param raw tquery 原始响应字符串
 * @returns 头衔名数组；无头衔用户（data:false 或不在 data 里）返回空数组
 */
export function parseUserTitles(uid: string, raw: string): string[] {
  const json = JSON.parse(raw) as TQueryJson;
  if (!json.data) return [];
  const entry = json.data.find((d) => d.uid === uid);
  if (!entry) return [];
  return entry.path
    .map((p) => p.name ?? "")
    .filter((n) => n.length > 0);
}

/** 合并 query.json 主体资料 + tquery 特殊头衔 → 完整 UserProfile */
export function mergeTitles(profile: UserProfile, titles: string[]): UserProfile {
  return { ...profile, title: titles };
}

/** gender 编码 → 中文（m/f → 男生/女生；未知空） */
function genderText(g: string | undefined): string {
  if (g === "m") return "男生";
  if (g === "f") return "女生";
  return "";
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
    avatar: profile.avatar || null,
    profile,
    updatedAt: new Date().toISOString(),
  };
}

/** 供测试/其他模块判断 uid 是否为匿名占位名（IWhisper#数字）。用 name_regex（纯名匹配），非链接 uid_regex。 */
export function isAnonUid(uid: string): boolean {
  return new RegExp(selectors.anonymous.name_regex).test(uid);
}
