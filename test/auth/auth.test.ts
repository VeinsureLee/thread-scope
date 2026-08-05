import { describe, it, expect, beforeEach } from "vitest";
import { requireLogin, logout } from "../../src/auth/auth.js";
import { getCookie, saveCookie } from "../../src/utils/http-client.js";

describe("认证守卫 (auth)", () => {
  beforeEach(() => {
    logout(); // 清除 Cookie 状态
  });

  it("requireLogin 在未登录时抛出错误", () => {
    expect(() => requireLogin()).toThrow("❌ 未登录");
    expect(() => requireLogin()).toThrow("forum-login");
  });

  it("requireLogin 在已登录时不抛出", () => {
    // 模拟保存一个 cookie
    const mockResp = {
      headers: { "set-cookie": "nforum[UTMPUSERID]=abc; path=/" },
    } as any;
    saveCookie(mockResp);
    expect(() => requireLogin()).not.toThrow();
  });

  it("logout 后 requireLogin 重新抛出错误", () => {
    const mockResp = {
      headers: { "set-cookie": "a=1; path=/" },
    } as any;
    saveCookie(mockResp);
    expect(() => requireLogin()).not.toThrow();

    logout();
    expect(() => requireLogin()).toThrow("❌ 未登录");
  });

  it("多次调用 requireLogin 不影响状态", () => {
    const mockResp = {
      headers: { "set-cookie": "a=1; path=/" },
    } as any;
    saveCookie(mockResp);
    // 多次调用不抛错
    expect(() => requireLogin()).not.toThrow();
    expect(() => requireLogin()).not.toThrow();
    expect(() => requireLogin()).not.toThrow();
  });
});
