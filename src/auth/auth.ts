import axios from "axios";
import {
  forum,
  http,
  routes,
  loginRules,
  secrets,
} from "../core/config.js";
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

// ========== 表单构造 ==========

/** 根据 login.yaml 的 form_fields 构造 URLSearchParams */
function buildLoginForm(): URLSearchParams {
  const params = new URLSearchParams();
  for (const field of loginRules.form_fields) {
    switch (field.type) {
      case "credential":
        if (field.name === "id") params.append(field.name, secrets.userId);
        else if (field.name === "passwd")
          params.append(field.name, secrets.userPassword);
        break;
      case "fixed":
        if (field.value !== undefined) params.append(field.name, field.value);
        break;
    }
  }
  return params;
}

// ========== 登录 ==========

/**
 * 登录目标论坛。
 *
 * 流程由 config/rules/login.yaml 中的 flow 定义：
 * 1. GET {routes.index} 获取 guest Cookie
 * 2. POST {routes.login} 提交登录表单
 */
export async function login(): Promise<LoginResult> {
  // 1. 获取 guest cookie
  const r1 = await axios.get(`${forum.base_url}${routes.index}`, {
    headers: http.headers,
    responseType: "arraybuffer",
    timeout: http.timeout_ms,
  });
  saveCookie(r1);

  // 2. AJAX 登录
  const formData = buildLoginForm();

  const r2 = await axios.post(
    `${forum.base_url}${routes.login}`,
    formData.toString(),
    {
      headers: {
        ...http.headers,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json",
        Cookie: getCookie(),
      },
      responseType: "json",
      timeout: http.timeout_ms,
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
