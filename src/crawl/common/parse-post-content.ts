import { parsePostTime } from "./parser-kit.js";

/** 清洗后的帖子内容分解结果。 */
export interface ParsedPostContent {
  /** 有效正文：去掉头部(发信人/标题/发信站)与尾部(--/来源/修改)；保留引用块 */
  body: string;
  /** 发帖时间（从"发信站"行英文时间解析；无则 null） */
  postTime: string | null;
  /** 客户端类型："手机客户端" | "网页" | null */
  client: string | null;
  /** 来源 IP（含 IPv6）；匿名来源("匿名天使的家") → null */
  ip: string | null;
}

/** 头部行（发信人 / 标题 / 发信站；标题行"标/题"间隔为全角空格或 &nbsp;） */
const HEADER_LINE = /^(发信人|标\s*题|发信站):/;
/** 尾部标记行（※ 来源 / ※ 修改） */
const FOOTER_MARK = /^※\s*(来源|修改):/;

/**
 * 清洗帖子正文原始块并提取有效字段。
 *
 * 原始格式（BYR 详情页 .a-content-wrap 提取文本）：
 *   发信人: <name> (<nick>), 信区: <board>      ← 冗余(作者/版块)
 *   [标  题: <title>]                           ← 冗余(文章标题)
 *   发信站: <forum> (<英文时间>), 站内           ← 时间 → postTime
 *   <空行>
 *   <body 有效内容(含引用块)>
 *   [--]
 *   [※ 来源:·<客户端> bbs.example.cn·[FROM: <ip>]]  ← 客户端/ip
 *   [※ 修改:·... 修改本文·[FROM: <ip>]]        ← 修改通知(只取 ip)
 *
 * 头部/尾部均为与已有字段重复或无关的噪音，剥离后不进 FTS；引用块保留。
 */
export function parsePostContent(raw: string): ParsedPostContent {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");

  // ── 头部剥离（仅当首行为"发信人:"）──
  let postTime: string | null = null;
  let headerEnd = 0;
  if (lines.length > 0 && lines[0]!.startsWith("发信人:")) {
    let i = 0;
    for (; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (HEADER_LINE.test(line)) {
        if (line.startsWith("发信站:")) postTime = parsePostTime(line);
      } else if (line === "") {
        i += 1; // 越过头部后的空行
        break;
      } else {
        break; // 头部后紧跟正文（无空行）
      }
    }
    headerEnd = i;
  }

  // ── 尾部剥离：最后一行 ※(来源|修改) 及紧邻其前的独立 -- 行；
  //    无 ※ 时，末尾的独立 -- 行(签名分隔符)同样视为尾部 ──
  let footerStart = lines.length;
  let footerLine: string | null = null;
  let markIndex = -1;
  for (let i = lines.length - 1; i >= headerEnd; i--) {
    if (FOOTER_MARK.test(lines[i]!.trim())) {
      markIndex = i;
      break;
    }
  }
  if (markIndex >= 0) {
    footerLine = lines[markIndex]!.trim();
    footerStart = markIndex;
    for (let j = markIndex - 1; j >= headerEnd; j--) {
      if (lines[j]!.trim() === "--") {
        footerStart = j;
        break;
      }
    }
  } else {
    for (let i = lines.length - 1; i >= headerEnd; i--) {
      if (lines[i]!.trim() === "--") {
        footerStart = i;
        break;
      }
    }
  }

  const body = lines
    .slice(headerEnd, footerStart)
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

  const { client, ip } = parseFooter(footerLine);
  return { body, postTime, client, ip };
}

/** 从 ※ 来源 / ※ 修改 尾部行提取客户端与 IP。 */
function parseFooter(footer: string | null): { client: string | null; ip: string | null } {
  if (!footer) return { client: null, ip: null };

  // ※ 来源:·<客户端信息>·[FROM: <ip>]（匿名来源无中间段）
  const src = footer.match(/^※\s*来源:·(?:(.*?)·)?\[FROM:\s*(.*)\]$/);
  if (src) {
    const middle = (src[1] ?? "").trim();
    const from = (src[2] ?? "").trim();
    let client: string | null = null;
    if (middle.includes("手机客户端")) client = "手机客户端";
    else if (middle.includes("http://")) client = "网页";
    return { client, ip: from === "匿名天使的家" ? null : from };
  }

  // ※ 修改:·... 修改本文·[FROM: <ip>]
  const mod = footer.match(/^※\s*修改:·.*\[FROM:\s*(.*)\]$/);
  if (mod) {
    const from = (mod[1] ?? "").trim();
    return { client: null, ip: from === "匿名天使的家" ? null : from };
  }

  return { client: null, ip: null };
}
