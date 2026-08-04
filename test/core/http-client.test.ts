import { describe, it, expect, beforeEach } from "vitest";
import { saveCookie, getCookie, clearCookie } from "../../src/core/http-client.js";

// 通过重新 set globalCookie 来清理，但它是模块级私有变量。
// 我们必须通过 clearCookie 和 saveCookie 间接操作，然后再重新导入来重置。
// 这里用 vi.resetModules() 在每个测试前重置模块状态。

describe("Cookie 管理", () => {
  beforeEach(async () => {
    // 每个测试前重新加载模块以重置 Cookie 状态
    clearCookie();
  });

  it("初始 Cookie 为空字符串", () => {
    expect(getCookie()).toBe("");
  });

  it("saveCookie 从响应中提取 cookie", () => {
    const mockResp = {
      headers: {
        "set-cookie": "nforum[UTMPUSERID]=abc123; path=/; expires=Thu, 01-Jan-2030 00:00:00 GMT",
      },
    } as any;
    saveCookie(mockResp);
    expect(getCookie()).toContain("nforum[UTMPUSERID]=abc123");
  });

  it("saveCookie 处理多个 Set-Cookie 头", () => {
    const mockResp = {
      headers: {
        "set-cookie": [
          "nforum[UTMPUSERID]=abc; path=/",
          "nforum[UTMPKEY]=xyz; path=/",
        ],
      },
    } as any;
    saveCookie(mockResp);
    expect(getCookie()).toContain("nforum[UTMPUSERID]=abc");
    expect(getCookie()).toContain("nforum[UTMPKEY]=xyz");
  });

  it("saveCookie 合并多次调用", () => {
    const r1 = {
      headers: { "set-cookie": "a=1; path=/" },
    } as any;
    const r2 = {
      headers: { "set-cookie": "b=2; path=/" },
    } as any;
    saveCookie(r1);
    saveCookie(r2);
    expect(getCookie()).toContain("a=1");
    expect(getCookie()).toContain("b=2");
  });

  it("saveCookie 忽略无 Set-Cookie 的响应", () => {
    const mockResp = { headers: {} } as any;
    saveCookie(mockResp);
    expect(getCookie()).toBe("");
  });

  it("clearCookie 清空所有 Cookie", () => {
    const mockResp = {
      headers: { "set-cookie": "a=1; path=/" },
    } as any;
    saveCookie(mockResp);
    expect(getCookie()).not.toBe("");
    clearCookie();
    expect(getCookie()).toBe("");
  });

  it("saveCookie 只保留 key=value，去掉 path/expires", () => {
    const mockResp = {
      headers: {
        "set-cookie":
          "nforum[UTMPUSERID]=abc; path=/; expires=Thu, 01-Jan-2030 00:00:00 GMT; HttpOnly",
      },
    } as any;
    saveCookie(mockResp);
    expect(getCookie()).toBe("nforum[UTMPUSERID]=abc");
    expect(getCookie()).not.toContain("path");
    expect(getCookie()).not.toContain("expires");
  });
});
