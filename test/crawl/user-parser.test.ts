import { describe, it, expect } from "vitest";
import {
  parseAuthor,
  parseUserProfile,
  parseUserTitles,
  mergeTitles,
  isAnonUid,
} from "../../src/crawl/user/parser.js";

// 合成测试数据（不包含真实论坛内容）
const QUERY_JSON_FULL = JSON.stringify({
  id: "user_a",
  user_name: "测试昵称",
  face_url: "https://example.com/face.jpg",
  face_width: 120,
  face_height: 120,
  gender: "m",
  astro: "天秤座",
  life: 999,
  qq: "123456",
  msn: "test@msn.com",
  home_page: "https://example.com",
  level: "用户",
  is_online: true,
  post_count: 104,
  last_login_time: 1785718705,
  last_login_ip: "203.0.113.*",
  is_hide: false,
  is_register: true,
  score: 1344,
  follow_num: 3,
  fans_num: 7,
  is_follow: false,
  is_fan: true,
  status: "目前不在站上",
  ajax_st: 1,
  ajax_code: "0005",
  ajax_msg: "操作成功",
});

const TQUERY_WITH_TITLE = JSON.stringify({
  data: [
    {
      uid: "user_a",
      path: [
        {
          path: "/files/imgupload/2018-11-22-13-17-20.png",
          name: "示例官方账号",
          remark: "论坛认证的学校部门机构及学生组织的官方账号",
        },
      ],
    },
  ],
  ajax_st: 1,
  ajax_code: "0005",
  ajax_msg: "操作成功",
});

describe("crawl/user — parseAuthor（身份解析唯一权威）", () => {
  it("实名链接 → uid", () => {
    expect(parseAuthor("user_a", "/user/query/user_a")).toEqual({
      uid: "user_a",
      name: "user_a",
      isAnon: false,
    });
  });

  it("匿名链接（IWhisper#数字）→ uid=null、isAnon", () => {
    expect(parseAuthor("IWhisper#123", "/user/query/IWhisper#123")).toEqual({
      uid: null,
      name: "IWhisper#123",
      isAnon: true,
    });
  });

  it("无链接 → uid=null、isAnon=false（保留显示名）", () => {
    expect(parseAuthor("神秘人", undefined)).toEqual({
      uid: null,
      name: "神秘人",
      isAnon: false,
    });
  });
});

describe("crawl/user — parseUserProfile（query.json → UserProfile）", () => {
  it("完整字段映射", () => {
    const p = parseUserProfile("user_a", QUERY_JSON_FULL);
    expect(p.uid).toBe("user_a");
    expect(p.nickname).toBe("测试昵称");
    expect(p.gender).toBe("男生"); // m → 男生
    expect(p.constellation).toBe("天秤座");
    expect(p.qq).toBe("123456");
    expect(p.msn).toBe("test@msn.com");
    expect(p.homepage).toBe("https://example.com");
    expect(p.avatar).toBe("https://example.com/face.jpg");
    expect(p.level).toBe("用户");
    expect(p.postCount).toBe("104篇"); // 数字 → "104篇"
    expect(p.points).toBe("1344");
    expect(p.vitality).toBe("999");
    expect(p.lastIp).toBe("203.0.113.*"); // 已脱敏（RFC 5737 测试 IP）
    expect(p.onlineStatus).toBe("目前不在站上");
    expect(p.isOnline).toBe(true);
    expect(p.followNum).toBe(3);
    expect(p.fansNum).toBe(7);
    expect(p.title).toEqual([]); // 主体资料不含头衔
    expect(p.fetchedAt).toBeTruthy();
  });

  it("last_login_time unix → ISO", () => {
    const p = parseUserProfile("user_a", QUERY_JSON_FULL);
    // 1785718705 → 2026-08-03T...
    expect(p.lastLogin).toMatch(/^2026-08-03T/);
  });

  it("gender=f → 女生", () => {
    const p = parseUserProfile("user_f", QUERY_JSON_FULL.replace('"m"', '"f"'));
    expect(p.gender).toBe("女生");
  });

  it("字段空值兜底（缺字段 → 空串/0）", () => {
    const p = parseUserProfile("empty", JSON.stringify({ id: "empty", ajax_st: 1 }));
    expect(p.nickname).toBe("");
    expect(p.gender).toBe("");
    expect(p.qq).toBe("");
    expect(p.postCount).toBe("");
    expect(p.points).toBe("");
    expect(p.followNum).toBe(0);
    expect(p.fansNum).toBe(0);
  });

  it("ajax_st != 1 抛错", () => {
    expect(() =>
      parseUserProfile("user_a", JSON.stringify({ id: "user_a", ajax_st: 0 })),
    ).toThrow("用户资料接口返回失败");
  });

  it("非 JSON 抛错", () => {
    expect(() => parseUserProfile("user_a", "not json")).toThrow();
  });
});

describe("crawl/user — parseUserTitles（tquery → 头衔名）", () => {
  it("有头衔 → 返回 name 数组", () => {
    expect(parseUserTitles("user_a", TQUERY_WITH_TITLE)).toEqual(["示例官方账号"]);
  });

  it("无头衔（data:false）→ 空数组", () => {
    expect(parseUserTitles("user_a", JSON.stringify({ data: false, ajax_st: 1 }))).toEqual([]);
  });

  it("不在 data 里的 uid → 空数组", () => {
    const raw = JSON.stringify({
      data: [{ uid: "other", path: [{ name: "某头衔" }] }],
      ajax_st: 1,
    });
    expect(parseUserTitles("user_a", raw)).toEqual([]);
  });

  it("多个头衔 → 全部返回", () => {
    const raw = JSON.stringify({
      data: [{ uid: "user_a", path: [{ name: "头衔A" }, { name: "头衔B" }] }],
      ajax_st: 1,
    });
    expect(parseUserTitles("user_a", raw)).toEqual(["头衔A", "头衔B"]);
  });
});

describe("crawl/user — mergeTitles / isAnonUid", () => {
  it("mergeTitles 合并头衔到主体", () => {
    const base = parseUserProfile("user_a", QUERY_JSON_FULL);
    const merged = mergeTitles(base, ["示例官方账号"]);
    expect(merged.title).toEqual(["示例官方账号"]);
    expect(merged.nickname).toBe("测试昵称"); // 主体字段保留
  });

  it("isAnonUid 识别匿名占位名", () => {
    expect(isAnonUid("IWhisper#123")).toBe(true);
    expect(isAnonUid("user_a")).toBe(false);
  });
});
