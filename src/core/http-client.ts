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
  const kv = cookies.map((c) => c.split(";")[0]!).join("; ");
  globalCookie = globalCookie ? `${globalCookie}; ${kv}` : kv;
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
