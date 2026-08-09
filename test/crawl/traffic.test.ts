import { describe, it, expect } from "vitest";
import { load } from "cheerio";
import { BoardNode, ForumRootNode, SectionNode } from "../../src/model/index.js";
import { groupBoardsBySection } from "../../src/model/algorithm/forum/traffic-aggregate.js";

/**
 * 单元测试：验证流量信息采集逻辑（无需网络）。
 *
 * 测试指标：
 * - groupBoardsBySection 按直接父分区把版块叶子归组
 * - parseSectionTraffic 从 HTML 提取流量字段
 *
 * 注意：所有名称与数据均为合成测试数据，不包含真实论坛内容。
 */

// ============================================================
// groupBoardsBySection 测试（真实 ForumNode 实体）
// ============================================================

/** 构造两分区树：sec-alpha(b1,b2) + sec-beta(b3, 嵌套 sub-gamma 的 b4,b5) */
function makeGroupingForum(): ForumRootNode {
  const b1 = new BoardNode({ id: "board-b1", name: "版块一", ename: "b1", depth: 2 });
  const b2 = new BoardNode({ id: "board-b2", name: "版块二", ename: "b2", depth: 2 });
  const sectionAlpha = new SectionNode({ id: "sec-alpha", name: "分区甲", depth: 1, nodes: [b1, b2] });

  const b3 = new BoardNode({ id: "board-b3", name: "版块三", ename: "b3", depth: 2 });
  const b4 = new BoardNode({ id: "board-b4", name: "版块甲", ename: "b4", depth: 3 });
  const b5 = new BoardNode({ id: "board-b5", name: "版块乙", ename: "b5", depth: 3 });
  const subGamma = new SectionNode({ id: "sub-gamma", name: "子分区丙", depth: 2, nodes: [b4, b5] });
  const sectionBeta = new SectionNode({ id: "sec-beta", name: "分区乙", depth: 1, nodes: [b3, subGamma] });

  return new ForumRootNode({ id: "forum-root", name: "Forum", depth: 0, nodes: [sectionAlpha, sectionBeta] });
}

describe("groupBoardsBySection（按父分区归组）", () => {
  it("版块叶子按直接父分区分组，保持输入顺序", () => {
    const forum = makeGroupingForum();
    const groups = groupBoardsBySection(forum.collectBoards("dfs"));

    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.sectionId)).toEqual(["sec-alpha", "sec-beta", "sub-gamma"]);
    expect(groups[0]!.boards.map((b) => b.ename)).toEqual(["b1", "b2"]);
    expect(groups[1]!.boards.map((b) => b.ename)).toEqual(["b3"]);
    // 嵌套叶子归其直接父分区 sub-gamma，而不是外层 sec-beta（立即祖先语义）
    expect(groups[2]!.boards.map((b) => b.ename)).toEqual(["b4", "b5"]);
  });

  it("未指定 parentSectionId 的叶子归入空分区组", () => {
    const a = new BoardNode({ id: "board-a", name: "甲", ename: "a", depth: 1 });
    const b = new BoardNode({ id: "board-b", name: "乙", ename: "b", depth: 1 });
    const groups = groupBoardsBySection([a, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.sectionId).toBe("");
    expect(groups[0]!.boards.map((x) => x.ename)).toEqual(["a", "b"]);
  });

  it("空输入返回空分组", () => {
    expect(groupBoardsBySection([])).toEqual([]);
  });

  it("顶层 board（root 直接子）parentSectionId 为 null 归空分区组", () => {
    const top = new BoardNode({ id: "board-top", name: "顶", ename: "top", depth: 1 });
    const root = new ForumRootNode({ id: "forum-root", name: "Forum", depth: 0, nodes: [top] });
    const groups = groupBoardsBySection(root.collectBoards());
    expect(groups).toHaveLength(1);
    expect(groups[0]!.sectionId).toBe("");
    expect(groups[0]!.boards.map((b) => b.ename)).toEqual(["top"]);
  });
});

// ============================================================
// parseSectionTraffic 测试（cheerio 内联 HTML fixture）
// ============================================================

const TODAY_POSTS_SELECTOR = ".title_4";
const ONLINE_USERS_SELECTOR = ".title_8";
const THREADS_SELECTOR = ".title_6";
const POSTS_SELECTOR = ".title_7";

/** 构建带 count=1 额外列的版块列表 HTML（合成数据） */
function makeTrafficHtml(): string {
  return `
<table class="board-list">
  <tbody>
    <tr>
      <td class="title_1"><a href="/board/b3">版块三</a> (b3)</td>
      <td class="title_2">板主: mod1</td>
      <td class="title_4">35</td>
      <td class="title_6">12345</td>
      <td class="title_7">67890</td>
      <td class="title_8">142</td>
    </tr>
    <tr>
      <td class="title_1"><a href="/board/market">二手版</a> (market)</td>
      <td class="title_2">板主: mod2</td>
      <td class="title_4">20</td>
      <td class="title_6">5000</td>
      <td class="title_7">30000</td>
      <td class="title_8">89</td>
    </tr>
    <tr>
      <td class="title_1"><a href="/board/b1">版块一</a> (b1)</td>
      <td class="title_2">板主: mod3</td>
      <td class="title_4">3</td>
      <td class="title_6">800</td>
      <td class="title_7">5000</td>
      <td class="title_8">12</td>
    </tr>
    <tr>
      <td class="title_1"><a href="/board/whisper">私语版</a></td>
      <td class="title_2">板主: mod4</td>
      <td class="title_4">42</td>
      <td class="title_6">999</td>
      <td class="title_7">8888</td>
      <td class="title_8">55</td>
    </tr>
  </tbody>
</table>`;
}

/** 从版面英文名提取中文名 */
function extractNameFromCell(cellText: string): string {
  const m = cellText.match(/^(.+?)\s*\(/);
  return m ? m[1]!.trim() : cellText.trim();
}

/** 从版面英文名提取 ename（与 traffic.ts 逻辑一致） */
function extractEnameFromCell(cellText: string, chineseName: string): string {
  const m = cellText.match(/\(([^)]+)\)/);
  if (m) return m[1]!.trim();
  // 中文括号
  const m2 = cellText.match(/（([^）]+)）/);
  if (m2) return m2[1]!.trim();
  // 回退：去掉中文名，剩余即为英文名
  if (chineseName) {
    const remainder = cellText.replace(chineseName, "").trim().replace(/[()（）]/g, "");
    if (remainder) return remainder;
  }
  return "";
}

interface ParsedTraffic {
  ename: string;
  name: string;
  onlineUsers: string;
  todayPosts: string;
  threads: string;
  posts: string;
}

/**
 * 模拟 parseSectionTraffic：
 * 从 section detail HTML 中解析所有版块的流量信息。
 */
function parseAllTraffic(html: string): ParsedTraffic[] {
  const $ = load(html);
  const rows = $("table.board-list tbody tr").toArray();
  const result: ParsedTraffic[] = [];

  for (const row of rows) {
    const $tr = $(row);
    const cellText = $tr.find(".title_1").text().trim();
    const name = extractNameFromCell(cellText);
    const ename = extractEnameFromCell(cellText, name);

    if (!name && !ename) continue;

    const todayPosts = $tr.find(TODAY_POSTS_SELECTOR).text().trim();
    const threads = $tr.find(THREADS_SELECTOR).text().trim();
    const posts = $tr.find(POSTS_SELECTOR).text().trim();
    const onlineUsers = $tr.find(ONLINE_USERS_SELECTOR).text().trim();

    result.push({ ename, name, onlineUsers, todayPosts, threads, posts });
  }

  return result;
}

/**
 * 从 parseAllTraffic 结果中按 ename 或 name 过滤，返回匹配的 TrafficInfo。
 */
function parseSectionTraffic(html: string, boardEnames: Set<string>, boardNames?: Set<string>): ParsedTraffic[] {
  return parseAllTraffic(html).filter((t) =>
    boardEnames.has(t.ename) ||
    boardEnames.has(t.ename.replace(/[()]/g, "")) ||
    (boardNames ? boardNames.has(t.name) : false),
  );
}

describe("parseSectionTraffic（流量 HTML 解析）", () => {
  const html = makeTrafficHtml();

  it("解析全部版块的流量字段", () => {
    const all = parseAllTraffic(html);
    expect(all).toHaveLength(4);

    expect(all[0]!.name).toBe("版块三");
    expect(all[0]!.ename).toBe("b3");
    expect(all[0]!.todayPosts).toBe("35");
    expect(all[0]!.threads).toBe("12345");
    expect(all[0]!.posts).toBe("67890");
    expect(all[0]!.onlineUsers).toBe("142");

    // 私语版：纯中文名无 ename
    expect(all[3]!.name).toBe("私语版");
    expect(all[3]!.ename).toBe("");
    expect(all[3]!.todayPosts).toBe("42");
  });

  it("按 ename 集合过滤只返回需要的版块", () => {
    const filtered = parseSectionTraffic(
      html,
      new Set(["b3", "b1"]),
    );
    expect(filtered).toHaveLength(2);
    expect(filtered.map((t) => t.ename).sort()).toEqual(["b1", "b3"]);
  });

  it("按中文名回退匹配纯中文版块（如私语版）", () => {
    const filtered = parseSectionTraffic(
      html,
      new Set(["(私语版)"]),   // 树中 ename 为 "(私语版)"，清理后为 "私语版"
      new Set(["私语版"]),      // 中文名集合
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.name).toBe("私语版");
    expect(filtered[0]!.todayPosts).toBe("42");
    expect(filtered[0]!.threads).toBe("999");
    expect(filtered[0]!.posts).toBe("8888");
    expect(filtered[0]!.onlineUsers).toBe("55");
  });

  it("当 ename 集合为空时返回空数组", () => {
    const filtered = parseSectionTraffic(html, new Set([]));
    expect(filtered).toHaveLength(0);
  });

  it("空 HTML 返回空数组（不崩溃）", () => {
    const result = parseAllTraffic("");
    expect(result).toHaveLength(0);
  });

  it("缺失列时返回空字符串（不崩溃）", () => {
    const htmlMissingCols = `
<table class="board-list">
  <tbody>
    <tr>
      <td class="title_1"><a href="/board/test1">测试版</a> (test1)</td>
      <td class="title_2">板主: x</td>
      <td class="title_6">100</td>
    </tr>
  </tbody>
</table>`;
    const all = parseAllTraffic(htmlMissingCols);
    expect(all).toHaveLength(1);
    expect(all[0]!.todayPosts).toBe("");      // .title_4 不存在
    expect(all[0]!.onlineUsers).toBe("");     // .title_8 不存在
    expect(all[0]!.threads).toBe("100");       // .title_6 存在
    expect(all[0]!.posts).toBe("");            // .title_7 不存在
  });

  it("跳过 title_1 为空的空行", () => {
    const htmlWithEmptyRow = `
<table class="board-list">
  <tbody>
    <tr>
      <td class="title_1"><a href="/board/b1">版块一</a> (b1)</td>
      <td class="title_6">800</td>
      <td class="title_7">5000</td>
    </tr>
    <tr>
      <td class="title_1"></td>
      <td class="title_6">0</td>
      <td class="title_7">0</td>
    </tr>
  </tbody>
</table>`;
    const all = parseAllTraffic(htmlWithEmptyRow);
    expect(all).toHaveLength(1);
    expect(all[0]!.ename).toBe("b1");
  });
});

// ============================================================
// extractEnameFromCell 测试（ename 提取回退逻辑）
// ============================================================

describe("extractEnameFromCell（英文名提取）", () => {
  it("标准 (ename) 格式", () => {
    expect(extractEnameFromCell("版块三 (b3)", "版块三")).toBe("b3");
  });

  it("无括号回退：去掉中文名后取剩余", () => {
    expect(extractEnameFromCell("耳语版Whisper", "耳语版")).toBe("Whisper");
  });

  it("中文括号 fallback", () => {
    expect(extractEnameFromCell("版块一（b1）", "版块一")).toBe("b1");
  });

  it("中文名即全文、无 ename 时返回空", () => {
    expect(extractEnameFromCell("耳语版", "耳语版")).toBe("");
  });

  it("无中文名参数时回退到正则匹配", () => {
    expect(extractEnameFromCell("版块二 (b2)", "")).toBe("b2");
  });
});
