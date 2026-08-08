import { describe, it, expect } from "vitest";
import { parseThreadPage } from "../../src/crawl/content/parser.js";
import { parsePostTime, isAnonLink, isAnonName } from "../../src/crawl/common/parser-kit.js";

// 合成测试数据（不包含真实论坛内容，避免泄露用户信息）
// 实名帖：用户名 user_a，性别图标 ico-pos-offline-hide（"性别保密"——用于验证不误判为匿名）
const REAL_FIRST_FLOOR = `<a name="a0"></a><div class="a-wrap corner"><table class="article"><tbody><tr class="a-head"><td class="a-left"><span class="a-u-name"><a href="/user/query/user_a">user_a</a></span><span class="a-u-sex"><samp title="女生哦 离线" class="ico-pos-offline-woman"></samp></span></td><td><span class="a-pos">楼主</span></td></tr><tr class="a-body"><td class="a-left"><div class="a-u-img"><img src="https://example.com/face/user_a.jpg"></div></td><td class="a-content body1001"><div class="a-content-wrap">发信人: user_a (), 信区: Demo<br>标&nbsp;&nbsp;题: 示例首帖<br>发信站: 示例论坛 (Thu Oct 19 11:04:35 2017), 站内<br><br>这是示例正文内容<br>--<br><font class="f006">※ 修改:·user_a 于 Sep  5 14:44:22 2018 修改本文·[FROM: 1.2.3.*]</font></div></td></tr></tbody></table></div>`;

// 实名评论：性别图标 ico-pos-offline-hide（title="性别保密哦 离线"）→ 不应判为匿名
const REAL_REPLY = `<a name="a1"></a><div class="a-wrap corner"><table class="article"><tbody><tr class="a-head"><td class="a-left"><span class="a-u-name"><a href="/user/query/user_b">user_b</a></span><span class="a-u-sex"><samp title="性别保密哦 离线" class="ico-pos-offline-hide"></samp></span></td><td><span class="a-pos">板凳</span></td></tr><tr class="a-body"><td class="a-left"></td><td class="a-content body1002"><div class="a-content-wrap">发信人: user_b (user_b), 信区: Demo<br>发信站: 示例论坛 (Fri Oct 27 13:52:29 2017), 站内<br><br>示例评论内容<br>--<br></div></td></tr></tbody></table></div>`;

// 匿名首帖：占位名 IWhisper#123（无链接 + 隐藏图标 + 匿名来源）
const ANON_FIRST_FLOOR = `<a name="a0"></a><div class="a-wrap corner"><table class="article"><tbody><tr class="a-head"><td class="a-left"><span class="a-u-name">IWhisper#123</span><span class="a-u-sex"> <samp title="隐藏" class="ico-pos-offline-hide"></samp></span></td><td><span class="a-pos">楼主</span></td></tr><tr class="a-body"><td class="a-left"></td><td class="a-content body2001"><div class="a-content-wrap">发信人: IWhisper#123 (匿名用户), 信区: Anon<br>标&nbsp;&nbsp;题: 匿名示例帖<br>发信站: 示例论坛 (Thu Aug  6 17:36:52 2026), 站内<br><br>rt<br>--<br><font class="f006">※ 来源:·[FROM: 匿名天使的家]</font></div></td></tr></tbody></table></div>`;

// 带 L1 内嵌作者资料的楼层（docs/06 §2.3 真实结构）：
// .a-u-uid 昵称 + dl.a-u-info dt/dd 等级/文章/积分/星座 + .a-u-sex title 性别
const FLOOR_WITH_EMBEDDED = `<a name="a0"></a><div class="a-wrap corner"><table class="article"><tbody><tr class="a-head"><td class="a-left"><span class="a-u-name"><a href="/user/query/user_a">user_a</a></span><span class="a-u-sex"><samp title="男生哦 离线" class="ico-pos-offline-man"></samp></span></td><td><span class="a-pos">楼主</span></td></tr><tr class="a-body"><td class="a-left"><div class="a-u-img"><img src="https://example.com/face.jpg"></div><div class="a-u-uid">示例昵称</div><dl class="a-u-info  body3001"><dt>等级</dt><dd>用户</dd><dt>文章</dt><dd>0</dd><dt>积分</dt><dd>8</dd><dt>星座</dt><dd>示例星座</dd></dl></td><td class="a-content body3001"><div class="a-content-wrap">发信人: user_a (示例昵称), 信区: Demo<br>标&nbsp;&nbsp;题: 示例<br>发信站: 示例论坛 (Tue Aug  4 18:33:16 2026), 站内<br><br>内容<br>--<br></div></td></tr></tbody></table></div>`;

function wrap(body: string): string {
  return `<section id="body"><div class="b-head"><span class="n-left">文章主题: test</span></div><div class="b-content">${body}</div></section>`;
}

describe("crawl/content — parseThreadPage", () => {
  it("解析实名首帖：kind=article、作者 uid、时间", () => {
    const { posts, title } = parseThreadPage("Demo", "1001", wrap(REAL_FIRST_FLOOR));
    expect(title).toBe("test");
    expect(posts).toHaveLength(1);
    const p = posts[0]!;
    expect(p.kind).toBe("article");
    expect(p.floor).toBe(1);
    expect(p.authorUid).toBe("user_a");
    expect(p.authorRaw).toBe("user_a");
    expect(p.isAnon).toBe(false);
    expect(p.postTime).toBe("2017-10-19T11:04:35");
    expect(p.content).toContain("这是示例正文内容");
  });

  it("解析实名评论：kind=reply、楼层=板凳→3、性别保密图标不误判匿名", () => {
    const { posts } = parseThreadPage("Demo", "1001", wrap(REAL_FIRST_FLOOR + REAL_REPLY));
    expect(posts).toHaveLength(2);
    const reply = posts[1]!;
    expect(reply.kind).toBe("reply");
    expect(reply.floor).toBe(3);
    expect(reply.authorUid).toBe("user_b");
    expect(reply.authorRaw).toBe("user_b");
    // 关键：性别保密图标（ico-pos-offline-hide + title="性别保密哦 离线"）不判匿名
    expect(reply.isAnon).toBe(false);
  });

  it("解析匿名首帖：isAnon=true、authorUid=null", () => {
    const { posts } = parseThreadPage("Anon", "2001", wrap(ANON_FIRST_FLOOR));
    const p = posts[0]!;
    expect(p.isAnon).toBe(true);
    expect(p.authorUid).toBeNull();
    expect(p.authorRaw).toBe("IWhisper#123");
    expect(p.kind).toBe("article");
  });

  it("解析 L1 内嵌作者资料（昵称/性别/等级/文章/积分/星座）", () => {
    const { posts } = parseThreadPage("Demo", "3001", wrap(FLOOR_WITH_EMBEDDED));
    const p = posts[0]!;
    expect(p.authorNick).toBe("示例昵称");
    expect(p.authorGender).toBe("男生"); // title="男生哦 离线" → 男生
    expect(p.authorLevel).toBe("用户");
    expect(p.authorPosts).toBe("0");
    expect(p.authorScore).toBe("8");
    expect(p.authorAstro).toBe("示例星座");
  });
});

describe("crawl/common — parser-kit 匿名识别", () => {
  it("isAnonLink：列表页匿名链接", () => {
    expect(isAnonLink("/user/query/IWhisper#123")).toBe(true);
    expect(isAnonLink("/user/query/user_a")).toBe(false);
    expect(isAnonLink(undefined)).toBe(false);
  });

  it("isAnonName：IWhisper#数字", () => {
    expect(isAnonName("IWhisper#123")).toBe(true);
    expect(isAnonName("IWhisper#0")).toBe(true);
    expect(isAnonName("user_a")).toBe(false);
    expect(isAnonName("IWhisper")).toBe(false);
  });

  it("parsePostTime：英文时间 → ISO", () => {
    expect(parsePostTime("示例论坛 (Thu Oct 19 11:04:35 2017), 站内")).toBe("2017-10-19T11:04:35");
    expect(parsePostTime("示例论坛 (Mon Nov  6 17:57:30 2017), 站内")).toBe("2017-11-06T17:57:30");
    expect(parsePostTime("no date")).toBeNull();
  });
});
