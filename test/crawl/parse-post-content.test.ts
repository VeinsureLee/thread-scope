import { describe, it, expect } from "vitest";
import { parsePostContent } from "../../src/crawl/common/parse-post-content.js";

// 合成测试数据（不含真实论坛内容）：头部/尾部格式取自 BYR 详情页 .a-content-wrap
const HEADER = (name: string, board: string, date: string): string =>
  `发信人: ${name}, 信区: ${board}\n发信站: 示例论坛 (${date}), 站内\n\n`;

describe("crawl/common — parsePostContent（帖子正文清洗）", () => {
  it("手机来源：剥离头部与尾部，保留引用块，提取时间/客户端", () => {
    const r = parsePostContent(
      `${HEADER("user_a", "Demo", "Fri Aug  7 20:28:52 2026")}` +
        "好恨啊\n" +
        "【 在 user_a 的大作中提到: 】\n" +
        ": 别做梦了 选到差的导师是原罪 \n" +
        "--\n" +
        "※ 来源:·示例论坛手机客户端 bbs.example.cn·[FROM: 匿名天使的家]",
    );
    expect(r.body).toBe("好恨啊\n【 在 user_a 的大作中提到: 】\n: 别做梦了 选到差的导师是原罪");
    expect(r.postTime).toBe("2026-08-07T20:28:52");
    expect(r.client).toBe("手机客户端");
    expect(r.ip).toBeNull(); // 匿名来源 → ip 空
  });

  it("网页来源：提取 网页 + 真实 IP", () => {
    const r = parsePostContent(
      `${HEADER("user_a", "Demo", "Fri Oct 27 13:52:29 2017")}示例评论内容\n--\n※ 来源:·示例论坛 http://bbs.example.cn·[FROM: 1.202.141.*]`,
    );
    expect(r.body).toBe("示例评论内容");
    expect(r.postTime).toBe("2017-10-27T13:52:29");
    expect(r.client).toBe("网页");
    expect(r.ip).toBe("1.202.141.*");
  });

  it("带标题目：标/题 间隔全角空格也剥离", () => {
    const r = parsePostContent(
      `发信人: user_a (nick), 信区: Demo\n标  题: 示例首帖\n发信站: 示例论坛 (Thu Oct 19 11:04:35 2017), 站内\n\n这是示例正文内容\n--\n※ 修改:·user_a 于 Sep  5 14:44:22 2018 修改本文·[FROM: 1.2.3.*]`,
    );
    expect(r.body).toBe("这是示例正文内容");
    expect(r.postTime).toBe("2017-10-19T11:04:35");
    expect(r.client).toBeNull(); // 修改行无客户端
    expect(r.ip).toBe("1.2.3.*");
  });

  it("匿名来源（无客户端段）：ip 为空", () => {
    const r = parsePostContent(
      `${HEADER("IWhisper#123", "Anon", "Thu Aug  6 17:36:52 2026")}rt\n--\n※ 来源:·[FROM: 匿名天使的家]`,
    );
    expect(r.body).toBe("rt");
    expect(r.postTime).toBe("2026-08-06T17:36:52");
    expect(r.client).toBeNull();
    expect(r.ip).toBeNull();
  });

  it("仅 -- 尾部（无来源）：也剥离", () => {
    const r = parsePostContent(
      `${HEADER("user_b", "Demo", "Fri Oct 27 13:52:29 2017")}示例评论内容\n--`,
    );
    expect(r.body).toBe("示例评论内容");
    expect(r.postTime).toBe("2017-10-27T13:52:29");
    expect(r.client).toBeNull();
    expect(r.ip).toBeNull();
  });

  it("IPv6 来源：ip 完整提取", () => {
    const r = parsePostContent(
      `${HEADER("user_a", "Demo", "Thu Oct 19 11:04:35 2017")}ipv6 测试\n--\n※ 来源:·示例论坛手机客户端 bbs.example.cn·[FROM: 2409:8900:1a80:1ae3:30a0:abcd:1234:5678]`,
    );
    expect(r.ip).toBe("2409:8900:1a80:1ae3:30a0:abcd:1234:5678");
    expect(r.client).toBe("手机客户端");
  });

  it("无头部（已是干净正文）：原样返回", () => {
    const r = parsePostContent("这是干净正文\n第二行");
    expect(r.body).toBe("这是干净正文\n第二行");
    expect(r.postTime).toBeNull();
    expect(r.client).toBeNull();
    expect(r.ip).toBeNull();
  });

  it("空正文：body 为空串", () => {
    const r = parsePostContent(`${HEADER("user_a", "Demo", "Thu Oct 19 11:04:35 2017")}--`);
    expect(r.body).toBe("");
    expect(r.postTime).toBe("2017-10-19T11:04:35");
  });
});
