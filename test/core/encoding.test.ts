import { describe, it, expect } from "vitest";
import { decodeBody } from "../../src/core/encoding.js";

/**
 * 构造最简 Mock，模拟 AxiosResponse 中 decodeBody 用到的部分
 */
function mockResp(body: Buffer | string, contentType?: string) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body, "utf-8");
  return {
    data: buf,
    headers: {
      "content-type": contentType || "text/html; charset=gbk",
    },
  } as any;
}

describe("编码解码 (encoding)", () => {
  it("GBK 响应 → UTF-8 文本", () => {
    // "中文测试" 的 GBK 编码
    const gbkBytes = Buffer.from([
      0xd6, 0xd0, 0xce, 0xc4, 0xb2, 0xe2, 0xca, 0xd4,
    ]);
    const resp = mockResp(gbkBytes, "text/html; charset=gbk");
    const result = decodeBody(resp);
    expect(result).toBe("中文测试");
  });

  it("UTF-8 响应头 → 原生解码", () => {
    const resp = mockResp(
      Buffer.from("Hello 世界", "utf-8"),
      "text/html; charset=utf-8",
    );
    const result = decodeBody(resp);
    expect(result).toBe("Hello 世界");
  });

  it("无 charset 声明 → 回退 GBK", () => {
    const gbkBytes = Buffer.from([0xca, 0xfd, 0xbe, 0xdd]); // "数据"
    const resp = mockResp(gbkBytes, "text/html");
    const result = decodeBody(resp);
    expect(result).toBe("数据");
  });

  it("响应头声明 UTF-8 但 HTML meta 声明 GBK → 优先响应头", () => {
    const body = Buffer.from('<meta charset="gbk">Hello', "utf-8");
    const resp = mockResp(body, "text/html; charset=utf-8");
    const result = decodeBody(resp);
    expect(result).toBe('<meta charset="gbk">Hello');
  });

  it("只有 HTML meta 声明 charset → 次优先级", () => {
    const body = Buffer.from(
      '<html><head><meta charset="utf-8"></head><body>测试</body></html>',
      "utf-8",
    );
    const resp = mockResp(body, "text/html");
    const result = decodeBody(resp);
    expect(result).toContain("测试");
  });

  it("charset=GB2312 → 用 iconv 解码", () => {
    const gbkBytes = Buffer.from([0xca, 0xfd, 0xbe, 0xdd]); // "数据"
    const resp = mockResp(gbkBytes, "text/html; charset=gb2312");
    const result = decodeBody(resp);
    expect(result).toBe("数据");
  });

  it("charset 值有引号也能正确提取", () => {
    const gbkBytes = Buffer.from([0xca, 0xfd, 0xbe, 0xdd]); // "数据"
    const resp = mockResp(gbkBytes, 'text/html; charset="gbk"');
    const result = decodeBody(resp);
    expect(result).toBe("数据");
  });
});
