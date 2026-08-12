import axios, { type AxiosResponse } from "axios";
import * as fs from "fs";
import * as path from "path";
import { forum, http, routes, secrets } from "./config.js";
import { decodeBody } from "./encoding.js";
import { fromRoot } from "./paths.js";

// ========== Cookie 管理 ==========

/** 会话 Cookie 持久化文件（data/ 已 gitignore；仅本机可读） */
const COOKIE_FILE = fromRoot("data/session-cookie.txt");

/** 从本地文件恢复会话 Cookie（启动自动恢复，免每次手动登录） */
function loadCookieFromDisk(): string {
  try {
    if (!fs.existsSync(COOKIE_FILE)) return "";
    return fs.readFileSync(COOKIE_FILE, "utf-8").trim();
  } catch {
    return "";
  }
}

/** 写盘当前 Cookie（权限 600；失败静默，不阻断请求） */
function persistCookieToDisk(cookie: string): void {
  try {
    fs.mkdirSync(path.dirname(COOKIE_FILE), { recursive: true });
    fs.writeFileSync(COOKIE_FILE, cookie, { mode: 0o600 });
  } catch {
    // 只读目录 / 磁盘错误等：登录态不持久化，不影响本次请求
  }
}

/** 删除本地会话 Cookie 文件（登出/检测到过期时） */
function removeCookieFile(): void {
  try {
    if (fs.existsSync(COOKIE_FILE)) fs.unlinkSync(COOKIE_FILE);
  } catch {
    // 忽略删除失败
  }
}

/** 模块级 Cookie 状态（启动时优先从本地文件恢复） */
let globalCookie = loadCookieFromDisk();

// ========== 登录闸门（防止登录竞态） ==========
//
// 背景：forum-login 与爬树/搜索等请求并行时，
// 旧 cookie 请求的响应 Set-Cookie（guest 会话）会覆盖 login 刚写入的登录
// cookie，导致后续请求静默落到“未登录错误页”（200 但无内容，解析出空结果）。
// 修复：login 期间独占闸门，所有 ajaxGet/ajaxPost 等待；login 结束放行。

/** 登录进行中的闸门（非空表示 login 未结束，其他请求必须等待） */
let loginGate: Promise<void> | null = null;
/** 释放闸门（由 unlockLoginGate 调用） */
let releaseLoginGate: (() => void) | null = null;

/** 获取登录闸门：标记登录进行中（幂等，重复调用不重建） */
export function lockLoginGate(): void {
  if (!loginGate) {
    loginGate = new Promise((resolve) => {
      releaseLoginGate = resolve;
    });
  }
}

/** 释放登录闸门：登录结束，放行等待中的请求 */
export function unlockLoginGate(): void {
  releaseLoginGate?.();
  releaseLoginGate = null;
  loginGate = null;
}

/** 等待登录闸门释放（登录期间阻塞所有对外请求） */
async function waitLoginGate(): Promise<void> {
  while (loginGate) await loginGate;
}

/** 登录会话键（受保护）：已登录时，非登录响应不得覆盖（防止旧请求响应污染登录态） */
const LOGIN_COOKIE_KEYS = [
  "nforum[UTMPUSERID]",
  "nforum[UTMPKEY]",
  "nforum[UTMPNUM]",
  "nforum[PASSWORD]",
];

/** 从响应 Set-Cookie 头中提取并合并 Cookie */
export function saveCookie(resp: AxiosResponse): void {
  const setCookie = resp.headers["set-cookie"];
  if (!setCookie) return;
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];

  const map = new Map<string, string>();
  // 现有 cookie（保持原有顺序与首键优先级：后面同名键覆盖前面）
  for (const part of globalCookie.split("; ")) {
    const idx = part.indexOf("=");
    if (idx > 0) map.set(part.slice(0, idx), part.slice(idx + 1));
  }
  // 登录态保护：当前已登录（含 PASSWORD 登录键）时，只有响应自身携带
  // PASSWORD（新一轮登录）才允许覆盖登录会话键；普通页面/未登录页的
  // guest Set-Cookie 不得覆盖（否则在途旧请求的响应会污染新登录态，
  // 见 test/core/login-race.test.ts）。
  const isLoggedIn = map.has("nforum[PASSWORD]");
  const respHasLogin = cookies.some((c) => c.trim().startsWith("nforum[PASSWORD]="));
  // 新 Set-Cookie：`name=value`（丢弃 Path/Max-Age 等元数据），同名键覆盖旧值
  for (const c of cookies) {
    const kv = c.split(";")[0]!.trim();
    const idx = kv.indexOf("=");
    if (idx <= 0) continue;
    const key = kv.slice(0, idx);
    if (isLoggedIn && !respHasLogin && LOGIN_COOKIE_KEYS.includes(key)) continue;
    map.set(key, kv.slice(idx + 1));
  }
  // 重新拼装（保持插入顺序，重复键以最后值为准）
  globalCookie = [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  persistCookieToDisk(globalCookie);
}

/** 获取当前保存的 Cookie 字符串 */
export function getCookie(): string {
  return globalCookie;
}

/** 清除所有 Cookie（并删除本地持久化文件） */
export function clearCookie(): void {
  globalCookie = "";
  removeCookieFile();
}

// ========== HTTP 请求 ==========

/**
 * 发起论坛 AJAX 请求（带 X-Requested-With 头和 Cookie）。
 */
export async function ajaxGet(path: string): Promise<string> {
  await waitLoginGate();
  const separator = path.includes("?") ? "&" : "?";
  const url = `${forum.base_url}${path}${separator}_uid=${secrets.userId}`;

  const resp = await axios.get(url, {
    headers: {
      ...http.headers,
      ...http.ajax_headers,
      Referer: `${forum.base_url}${forum.default_path}`,
      Cookie: globalCookie,
    },
    responseType: "arraybuffer",
    timeout: http.timeout_ms,
    validateStatus: () => true,
  });
  saveCookie(resp);
  return decodeBody(resp);
}

/**
 * 发起论坛 AJAX POST 请求（表单 body，带 X-Requested-With 头和 Cookie）。
 *
 * 用途（docs/06 §2.4）：特殊头衔接口 `/user/ajax_tquery.json` 为 POST，
 * body 为 `list[]=uid1&list[]=uid2`（jQuery 数组序列化）。与 ajaxGet 对称，
 * 同样走编码解码 + Cookie 管理 + 限速队列（调用方经 PageFetcher）。
 */
export async function ajaxPost(path: string, body: string): Promise<string> {
  await waitLoginGate();
  const separator = path.includes("?") ? "&" : "?";
  const url = `${forum.base_url}${path}${separator}_uid=${secrets.userId}`;

  const resp = await axios.post(url, body, {
    headers: {
      ...http.headers,
      ...http.ajax_headers,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Referer: `${forum.base_url}${forum.default_path}`,
      Cookie: globalCookie,
    },
    responseType: "arraybuffer",
    timeout: http.timeout_ms,
    validateStatus: () => true,
  });
  saveCookie(resp);
  return decodeBody(resp);
}