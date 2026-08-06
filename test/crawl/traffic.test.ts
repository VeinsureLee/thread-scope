import { describe, it, expect } from "vitest";
import { load } from "cheerio";

/**
 * 单元测试：验证流量信息采集逻辑（无需网络）。
 *
 * 测试指标：
 * - collectLeafBoards 递归收集版块叶子节点
 * - parseSectionTraffic 从 HTML 提取流量字段
 *
 * 注意：所有名称与数据均为合成测试数据，不包含真实论坛内容。
 */

// ============================================================
// collectLeafBoards 测试（模拟类型和内联逻辑）
// ============================================================

/** 简化的 ForumTreeNode 类型（不依赖 YAML 加载） */
interface TestBoardNode {
  id: string;
  name: string;
  type: "board";
  level: number;
  board: { name: string; ename: string; manager: string[] };
}

interface TestSectionNode {
  id: string;
  name: string;
  type: "section";
  level: number;
  children: TestTreeNode[];
}

type TestTreeNode = TestSectionNode | TestBoardNode;

interface LeafBoardRef {
  node: TestBoardNode;
  parentSectionId: string;
}

/**
 * 模拟 collectLeafBoards 的核心逻辑：
 * 从树中查找 nodeId，递归收集所有 BoardNode 叶子。
 *
 * @param tree     完整树
 * @param nodeId   目标节点 ID
 * @param parentId 当前节点的父分区 ID（递归时传入）
 */
function collectLeafBoards(
  tree: TestTreeNode[],
  nodeId: string,
  parentId: string = "",
): { leaves: LeafBoardRef[]; nodeName: string } {
  /** 清理 nodeId：去括号、去 board-/sec- 前缀，得到纯英文名/sectionId/中文名 */
  const cleanNodeId = nodeId.replace(/[()]/g, "").replace(/^board-/, "").replace(/^sec-/, "");
  const boardPrefixedId = `board-${cleanNodeId}`;
  const secPrefixedId = `sec-${cleanNodeId}`;

  for (const node of tree) {
    // ── 弹性匹配 ──
    let matched = false;
    if (node.id === nodeId || node.id === boardPrefixedId || node.id === secPrefixedId || node.id === cleanNodeId) {
      matched = true;
    } else if (node.type === "board") {
      const cleanEname = (node.board.ename ?? "").replace(/[()]/g, "");
      if (cleanEname === cleanNodeId) {
        matched = true;
      }
    } else if (node.type === "section") {
      const cleanSectionName = node.name.replace(/[()]/g, "");
      if (cleanSectionName === cleanNodeId) {
        matched = true;
      }
    }

    if (matched) {
      if (node.type === "board") {
        return {
          leaves: [{ node, parentSectionId: parentId }],
          nodeName: node.name,
        };
      }
      // section → 递归收集所有叶子
      const leaves: LeafBoardRef[] = [];
      function gather(nodes: TestTreeNode[], parentSectionId: string) {
        for (const child of nodes) {
          if (child.type === "board") {
            leaves.push({ node: child, parentSectionId });
          } else {
            gather(child.children, child.id);
          }
        }
      }
      gather(node.children, nodeId);
      return { leaves, nodeName: node.name };
    }

    if (node.type === "section") {
      const result = collectLeafBoards(node.children, nodeId, node.id);
      if (result.leaves.length > 0 || result.nodeName) {
        return result;
      }
    }
  }

  return { leaves: [], nodeName: "" };
}

/** 构建测试用树（全部为合成名称） */
function makeTestTree(): TestTreeNode[] {
  return [
    {
      id: "sec-alpha",
      name: "分区甲",
      type: "section",
      level: 1,
      children: [
        {
          id: "board-b1",
          name: "版块一",
          type: "board",
          level: 2,
          board: { name: "版块一", ename: "b1", manager: ["moderator1"] },
        },
        {
          id: "board-b2",
          name: "版块二",
          type: "board",
          level: 2,
          board: { name: "版块二", ename: "b2", manager: ["moderator1"] },
        },
      ],
    },
    {
      id: "zone-beta",
      name: "分区乙",
      type: "section",
      level: 1,
      children: [
        {
          id: "board-b3",
          name: "版块三",
          type: "board",
          level: 2,
          board: { name: "版块三", ename: "b3", manager: ["recruiter1"] },
        },
        {
          id: "sub-gamma",
          name: "子分区丙",
          type: "section",
          level: 2,
          children: [
            {
              id: "board-b4",
              name: "版块甲",
              type: "board",
              level: 3,
              board: { name: "版块甲", ename: "b4", manager: [] },
            },
            {
              id: "board-b5",
              name: "版块乙",
              type: "board",
              level: 3,
              board: { name: "版块乙", ename: "b5", manager: [] },
            },
          ],
        },
      ],
    },
  ];
}

describe("collectLeafBoards（叶节点收集）", () => {
  const tree = makeTestTree();

  it("传入 board 节点返回自身", () => {
    const { leaves, nodeName } = collectLeafBoards(tree, "board-b1");

    expect(leaves).toHaveLength(1);
    expect(leaves[0]!.node.id).toBe("board-b1");
    expect(leaves[0]!.parentSectionId).toBe("sec-alpha");
    expect(nodeName).toBe("版块一");
  });

  it("传入 section 节点收集所有子孙 boards", () => {
    const { leaves, nodeName } = collectLeafBoards(tree, "sec-alpha");

    expect(nodeName).toBe("分区甲");
    expect(leaves).toHaveLength(2);
    expect(leaves.map((l) => l.node.id).sort()).toEqual(["board-b1", "board-b2"]);
    // 所有叶子应归属到该分区
    leaves.forEach((l) => {
      expect(l.parentSectionId).toBe("sec-alpha");
    });
  });

  it("传入深层 section 收集子孙 boards（二级目录）", () => {
    const { leaves, nodeName } = collectLeafBoards(tree, "sub-gamma");

    expect(nodeName).toBe("子分区丙");
    expect(leaves).toHaveLength(2);
    expect(leaves.map((l) => l.node.name).sort()).toEqual(["版块乙", "版块甲"]);
  });

  it("传入顶级 section 收集全部 boards", () => {
    const { leaves } = collectLeafBoards(tree, "zone-beta");

    expect(leaves).toHaveLength(3); // b3 + b4 + b5
    // 直接子板 parent 为 zone-beta，嵌套子板 parent 为 sub-gamma
    const b3 = leaves.find((l) => l.node.id === "board-b3")!;
    expect(b3.parentSectionId).toBe("zone-beta");
    const b4 = leaves.find((l) => l.node.id === "board-b4")!;
    expect(b4.parentSectionId).toBe("sub-gamma");
  });

  it("空树返回空结果", () => {
    const { leaves, nodeName } = collectLeafBoards([], "anything");
    expect(leaves).toHaveLength(0);
    expect(nodeName).toBe("");
  });

  it("section 下无 boards 返回空 leaves", () => {
    const emptySection: TestTreeNode[] = [
      { id: "empty", name: "空分区", type: "section", level: 1, children: [] },
    ];
    const { leaves, nodeName } = collectLeafBoards(emptySection, "empty");
    expect(leaves).toHaveLength(0);
    expect(nodeName).toBe("空分区");
  });

  it("深层嵌套 board（level 3+）正确追溯 parentSectionId", () => {
    const { leaves } = collectLeafBoards(tree, "board-b5");
    expect(leaves).toHaveLength(1);
    expect(leaves[0]!.parentSectionId).toBe("sub-gamma");
  });

  it("传入 section 中文名匹配分区（Tier 4）", () => {
    const { leaves, nodeName } = collectLeafBoards(tree, "分区乙");
    expect(nodeName).toBe("分区乙");
    expect(leaves).toHaveLength(3); // b3 + b4 + b5
  });

  it("传入 section 中文名匹配嵌套分区", () => {
    const { leaves, nodeName } = collectLeafBoards(tree, "子分区丙");
    expect(nodeName).toBe("子分区丙");
    expect(leaves).toHaveLength(2);
    expect(leaves.map((l) => l.node.name).sort()).toEqual(["版块乙", "版块甲"]);
  });

  it("传入 sec- 前缀匹配分区 ID", () => {
    const { leaves, nodeName } = collectLeafBoards(tree, "sec-alpha");
    expect(nodeName).toBe("分区甲");
    expect(leaves).toHaveLength(2);
  });

  it("传入 sec- 前缀匹配分区 ID（zone-beta → sec-zone-beta）", () => {
    const { leaves, nodeName } = collectLeafBoards(tree, "sec-zone-beta");
    expect(nodeName).toBe("分区乙");
    expect(leaves).toHaveLength(3);
  });

  it("传入带括号的输入（如 board-(b1) 式样）", () => {
    // 即使树中没有该节点，应能匹配到 board-b1
    const { leaves, nodeName } = collectLeafBoards(tree, "board-(b1)");
    expect(nodeName).toBe("版块一");
    expect(leaves).toHaveLength(1);
    expect(leaves[0]!.node.id).toBe("board-b1");
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
