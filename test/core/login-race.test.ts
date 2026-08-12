import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios from "axios";
import { login } from "../../src/auth/auth.js";
import { ajaxGet, clearCookie, getCookie } from "../../src/core/http-client.js";

// ============================================================
// 登录竞态回归测试
//
// 背景：forum-login 与爬树/搜索等请求并行时，旧 cookie 请求的响应
// Set-Cookie（guest 会话）会覆盖 login 刚写入的登录 cookie，导致后续
// 请求静默落到"未登录错误页"（200 但无内容，解析出空结果）。
//
// 本测试模拟两种真实时序：
//   1. login 先进入（登录闸门保护路径）
//   2. 旧请求先发出、响应晚于 login 到达（最坏时序，需 saveCookie 保护）
// 两种时序下，登录态都必须保持，不允许被 guest 响应覆盖。
// ============================================================

vi.mock("axios", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const mockGet = vi.mocked(axios.get);
const mockPost = vi.mocked(axios.post);

// 服务器响应构造（模拟 BYR 行为）：
// - guest 会话（未登录/游客请求的响应头）
const guestCookies = [
  "nforum[UTMPUSERID]=guest; path=/; domain=bbs.byr.cn",
  "nforum[UTMPKEY]=6406523; path=/; domain=bbs.byr.cn",
  "nforum[UTMPNUM]=14820; path=/; domain=bbs.byr.cn",
];
// - 登录会话（login 成功后的响应头）
const loginCookies = [
  "nforum[UTMPUSERID]=Always117; path=/; domain=bbs.byr.cn",
  "nforum[UTMPKEY]=realkey; path=/; domain=bbs.byr.cn",
  "nforum[UTMPNUM]=42; path=/; domain=bbs.byr.cn",
  "nforum[PASSWORD]=encrypted; path=/; domain=bbs.byr.cn",
];
// 未登录错误页（HTTP 200，无 table 内容）
const notLoggedInHtml = '<div class="error"><h5>产生错误的可能原因：</h5><li>您未登录,请登录后继续操作</li></div>';

/** 配置 mock：GET /index → guest；POST login → 登录；其余 GET 按请求 cookie 判定 */
function setupMocks(options: { sectionDelay?: () => Promise<void> } = {}): void {
  const { sectionDelay } = options;

  mockGet.mockReset();
  mockPost.mockReset();

  mockGet.mockImplementation((url: string, config?: any) => {
    // login 第一步：GET /index 拿 guest cookie
    if (String(url).includes("/index")) {
      return Promise.resolve({ headers: { "set-cookie": guestCookies }, data: "" });
    }
    // 其余 GET（ajaxGet 请求）：按"请求发出时携带的 cookie"判定响应
    const cookie: string = config?.headers?.Cookie ?? "";
    const isLoggedIn = cookie.includes("nforum[PASSWORD]");
    const respond = (): { headers: Record<string, unknown>; data: string } =>
      isLoggedIn
        ? { headers: {}, data: "<html>正常页面</html>" }
        : { headers: { "set-cookie": guestCookies }, data: notLoggedInHtml };
    return sectionDelay ? sectionDelay().then(respond) : Promise.resolve(respond());
  });

  mockPost.mockImplementation(() =>
    Promise.resolve({
      headers: { "set-cookie": loginCookies },
      data: { ajax_st: 1, user_name: "hajikuan", is_login: true },
    }),
  );
}

describe("login 与并行请求的 cookie 竞态", () => {
  beforeEach(() => {
    clearCookie();
    setupMocks();
  });

  afterEach(() => {
    clearCookie();
  });

  it("login 先进入时，在途旧请求的响应不覆盖登录态", async () => {
    // 在途请求的响应延迟到 login 完成之后才到达（复现线上故障时序）
    let release!: () => void;
    const lateGate = new Promise<void>((resolve) => (release = resolve));
    setupMocks({ sectionDelay: () => lateGate });

    const loginP = login();
    const fetchP = ajaxGet("/section/3?count=1");
    await loginP;
    release();
    await fetchP;

    expect(await loginP).toMatchObject({ isLogin: true });
    expect(getCookie()).toContain("nforum[UTMPUSERID]=Always117");
    expect(getCookie()).toContain("nforum[PASSWORD]=encrypted");
    expect(getCookie()).not.toContain("nforum[UTMPUSERID]=guest");
  });

  it("旧请求先发出、响应晚于 login 到达时，登录态同样不被覆盖", async () => {
    // 最坏时序：ajaxGet 在 login 开始前就已发出（携带 guest/空 cookie），
    // 其响应（guest Set-Cookie）在 login 写入登录态之后才到达。
    let release!: () => void;
    const lateGate = new Promise<void>((resolve) => (release = resolve));
    setupMocks({ sectionDelay: () => lateGate });

    const fetchP = ajaxGet("/section/3?count=1");
    const loginP = login();
    await loginP;
    release();
    await fetchP;

    expect(await loginP).toMatchObject({ isLogin: true });
    expect(getCookie()).toContain("nforum[UTMPUSERID]=Always117");
    expect(getCookie()).toContain("nforum[PASSWORD]=encrypted");
    expect(getCookie()).not.toContain("nforum[UTMPUSERID]=guest");
  });
});