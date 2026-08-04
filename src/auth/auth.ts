import axios from "axios";
import { load } from "cheerio";
import { config } from "../core/config.js";
import { decodeBody } from "../core/encoding.js";
import { saveCookie, getCookie, clearCookie } from "../core/http-client.js";

// ========== 类型 ==========

export interface LoginResult {
  /** AJAX 状态码 */
  ajaxSt: number;
  /** 用户昵称 */
  userName: string | undefined;
  /** 是否登录成功 */
  isLogin: boolean;
}

// ========== 登录 ==========

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept-Language": "zh-CN,zh;q=0.9",
};

/**
 * 登录目标论坛。
 *
 * 两步流程：
 * 1. GET /index 获取 guest Cookie
 * 2. POST /user/ajax_login.json 提交登录表单
 *
 * @returns 登录结果
 */
export async function login(): Promise<LoginResult> {
  // 1. 获取 guest cookie
  const r1 = await axios.get(`${config.baseUrl}/index`, {
    headers: DEFAULT_HEADERS,
    responseType: "arraybuffer",
    timeout: 15000,
  });
  saveCookie(r1);

  // 2. AJAX 登录
  const formData = new URLSearchParams();
  formData.append("id", config.userId);
  formData.append("passwd", config.userPassword);
  formData.append("mode", "0");
  formData.append("CookieDate", "2");

  const r2 = await axios.post(
    `${config.baseUrl}/user/ajax_login.json`,
    formData.toString(),
    {
      headers: {
        ...DEFAULT_HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json",
        Cookie: getCookie(),
      },
      responseType: "json",
      timeout: 15000,
      validateStatus: () => true,
    },
  );
  saveCookie(r2);

  const data = r2.data as {
    ajax_st: number;
    user_name?: string;
    is_login?: boolean;
  };

  return {
    ajaxSt: data.ajax_st,
    userName: data.user_name,
    isLogin: data.is_login ?? false,
  };
}

/** 检查是否已登录，未登录则抛出明确错误 */
export function requireLogin(): void {
  if (!getCookie()) {
    throw new Error("❌ 未登录，请先调用 forum-login 工具");
  }
}

/** 登出：清除 Cookie */
export function logout(): void {
  clearCookie();
}
