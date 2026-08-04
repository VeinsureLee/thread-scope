import axios, { type AxiosResponse } from "axios";
import { config } from "../core/config.js";
import { decodeBody } from "../core/encoding.js";

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

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept-Language": "zh-CN,zh;q=0.9",
};

/**
 * 发起论坛 AJAX 请求（带 X-Requested-With 头和 Cookie）。
 */
export async function ajaxGet(path: string): Promise<string> {
  const url = path.includes("?")
    ? `${config.baseUrl}${path}`
    : `${config.baseUrl}${path}?_uid=${config.userId}`;

  const resp = await axios.get(url, {
    headers: {
      ...DEFAULT_HEADERS,
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${config.baseUrl}/default`,
      Cookie: globalCookie,
    },
    responseType: "arraybuffer",
    timeout: 15000,
    validateStatus: () => true,
  });
  saveCookie(resp);
  return decodeBody(resp);
}
