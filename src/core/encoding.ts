import type { AxiosResponse } from "axios";
import iconv from "iconv-lite";

/**
 * 解码 axios 响应体，自动处理 GBK / UTF-8 等编码。
 *
 * 优先级：
 * 1. 响应头 Content-Type 中的 charset
 * 2. HTML <meta charset> 标签
 * 3. 默认回退到 GBK（目标论坛默认编码）
 */
export function decodeBody(resp: AxiosResponse): string {
  const buf = Buffer.from(resp.data);
  const ct = (resp.headers["content-type"] as string) || "";

  // 1. 响应头 charset
  const headerMatch = ct.match(/charset[="\s]+([^"\s;]+)/i);
  let enc = headerMatch ? headerMatch[1]!.toLowerCase() : "";

  // 2. HTML meta 标签 charset
  if (!enc || enc === "utf-8") {
    const sample = buf.slice(0, 1024).toString("utf-8");
    const metaMatch = sample.match(/charset[="\s]+([^"\s;]+)/i);
    if (metaMatch) enc = metaMatch[1]!.toLowerCase();
  }

  // 3. UTF-8 直接用 Node 原生解码
  if (enc === "utf-8" || enc === "utf8") {
    return buf.toString("utf-8");
  }

  // 4. 其他编码（包括未检测到的情况）使用 iconv-lite 解码，默认 GBK
  return iconv.decode(buf, enc || "gbk");
}
