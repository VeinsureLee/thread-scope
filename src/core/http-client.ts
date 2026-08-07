import axios, { type AxiosResponse } from "axios";
import { forum, http, routes, secrets } from "./config.js";
import { decodeBody } from "./encoding.js";

// ========== Cookie 管理 ==========

/** 模块级 Cookie 状态 */
let globalCookie = "";

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
  // 新 Set-Cookie：`name=value`（丢弃 Path/Max-Age 等元数据），同名键覆盖旧值
  for (const c of cookies) {
    const kv = c.split(";")[0]!.trim();
    const idx = kv.indexOf("=");
    if (idx > 0) map.set(kv.slice(0, idx), kv.slice(idx + 1));
  }
  // 重新拼装（保持插入顺序，重复键以最后值为准）
  globalCookie = [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

/** 获取当前保存的 Cookie 字符串 */
export function getCookie(): string {
  return globalCookie;
}

/** 清除所有 Cookie */
export function clearCookie(): void {
  globalCookie = "";
}

// ========== HTTP 请求 ==========

/**
 * 发起论坛 AJAX 请求（带 X-Requested-With 头和 Cookie）。
 */
export async function ajaxGet(path: string): Promise<string> {
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
