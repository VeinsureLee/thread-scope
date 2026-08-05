import { describe, it, expect } from "vitest";
import { load } from "cheerio";

/**
 * 单元测试：验证流量信息采集逻辑（无需网络）。
 *
 * 测试指标：
 * - collectLeafBoards 递归收集版块叶子节点
 * - parseSectionTraffic 从 HTML 提取流量字段
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
  board: { name: string; ename: string; manager: string; posts: string; threads: string };
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

/** 构建测试用树 */
function makeTestTree(): TestTreeNode[] {
  return [
    {
      id: "sec-0",
      name: "本站站务",
      type: "section",
      level: 1,
      children: [
        {
          id: "board-Advice",
          name: "意见与建议",
          type: "board",
          level: 2,
          board: { name: "意见与建议", ename: "Advice", manager: "admin", posts: "5000", threads: "300" },
        },
        {
          id: "board-BBShelp",
          name: "论坛帮助",
          type: "board",
          level: 2,
          board: { name: "论坛帮助", ename: "BBShelp", manager: "admin", posts: "2000", threads: "150" },
        },
      ],
    },
    {
      id: "news",
      name: "校园生活",
      type: "section",
      level: 1,
      children: [
        {
          id: "board-JobInfo",
          name: "招聘信息",
          type: "board",
          level: 2,
          board: { name: "招聘信息", ename: "JobInfo", manager: "recruiter", posts: "50000", threads: "3000" },
        },
        {
          id: "BBSLOG",
          name: "院系风采",
          type: "section",
          level: 2,
          children: [
            {
              id: "board-CS",
              name: "计算机学院",
              type: "board",
              level: 3,
              board: { name: "计算机学院", ename: "CS", manager: "", posts: "10000", threads: "500" },
            },
            {
              id: "board-SE",
              name: "软件学院",
              type: "board",
              level: 3,
              board: { name: "软件学院", ename: "SE", manager: "", posts: "8000", threads: "400" },
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
    const { leaves, nodeName } = collectLeafBoards(tree, "board-Advice");

    expect(leaves).toHaveLength(1);
    expect(leaves[0]!.node.id).toBe("board-Advice");
    expect(leaves[0]!.parentSectionId).toBe("sec-0");
    expect(nodeName).toBe("意见与建议");
  });

  it("传入 section 节点收集所有子孙 boards", () => {
    const { leaves, nodeName } = collectLeafBoards(tree, "sec-0");

    expect(nodeName).toBe("本站站务");
    expect(leaves).toHaveLength(2);
    expect(leaves.map((l) => l.node.id).sort()).toEqual(["board-Advice", "board-BBShelp"]);
    // 所有叶子应归属到该分区
    leaves.forEach((l) => {
      expect(l.parentSectionId).toBe("sec-0");
    });
  });

  it("传入深层 section 收集子孙 boards（二级目录）", () => {
    const { leaves, nodeName } = collectLeafBoards(tree, "BBSLOG");

    expect(nodeName).toBe("院系风采");
    expect(leaves).toHaveLength(2);
    expect(leaves.map((l) => l.node.name).sort()).toEqual(["计算机学院", "软件学院"]);
  });

  it("传入顶级 section 收集全部 boards", () => {
    const { leaves } = collectLeafBoards(tree, "news");

    expect(leaves).toHaveLength(3); // JobInfo + CS + SE
    // 直接子板 parent 为 news，嵌套子板 parent 为 BBSLOG
    const jobInfo = leaves.find((l) => l.node.id === "board-JobInfo")!;
    expect(jobInfo.parentSectionId).toBe("news");
    const cs = leaves.find((l) => l.node.id === "board-CS")!;
    expect(cs.parentSectionId).toBe("BBSLOG");
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
    const { leaves } = collectLeafBoards(tree, "board-SE");
    expect(leaves).toHaveLength(1);
    expect(leaves[0]!.parentSectionId).toBe("BBSLOG");
  });

  it("传入 section 中文名匹配分区（Tier 4）", () => {
    const { leaves, nodeName } = collectLeafBoards(tree, "校园生活");
    expect(nodeName).toBe("校园生活");
    expect(leaves).toHaveLength(3); // JobInfo + CS + SE
  });

  it("传入 section 中文名匹配嵌套分区", () => {
    const { leaves, nodeName } = collectLeafBoards(tree, "院系风采");
    expect(nodeName).toBe("院系风采");
    expect(leaves).toHaveLength(2);
    expect(leaves.map((l) => l.node.name).sort()).toEqual(["计算机学院", "软件学院"]);
  });

  it("传入 sec- 前缀匹配分区 ID", () => {
    const { leaves, nodeName } = collectLeafBoards(tree, "sec-0");
    expect(nodeName).toBe("本站站务");
    expect(leaves).toHaveLength(2);
  });

  it("传入 sec- 前缀匹配分区 ID（news → sec-news）", () => {
    const { leaves, nodeName } = collectLeafBoards(tree, "sec-news");
    expect(nodeName).toBe("校园生活");
    expect(leaves).toHaveLength(3);
  });

  it("传入带括号的输入（如 board-(IWhisper) 式样）", () => {
    // 即使树中没有该节点，应能匹配到 board-Advice
    const { leaves, nodeName } = collectLeafBoards(tree, "board-(Advice)");
    expect(nodeName).toBe("意见与建议");
    expect(leaves).toHaveLength(1);
    expect(leaves[0]!.node.id).toBe("board-Advice");
  });
});

// ============================================================
// parseSectionTraffic 测试（cheerio 内联 HTML fixture）
// ============================================================

const TODAY_POSTS_SELECTOR = ".title_4";
const ONLINE_USERS_SELECTOR = ".title_8";
const THREADS_SELECTOR = ".title_6";
const POSTS_SELECTOR = ".title_7";

/** 构建带 count=1 额外列的版块列表 HTML */
function makeTrafficHtml(): string {
  return `
<table class="board-list">
  <tbody>
    <tr>
      <td class="title_1"><a href="/board/JobInfo">招聘信息</a> (JobInfo)</td>
      <td class="title_2">板主: admin</td>
      <td class="title_4">35</td>
      <td class="title_6">12345</td>
      <td class="title_7">67890</td>
      <td class="title_8">142</td>
    </tr>
    <tr>
      <td class="title_1"><a href="/board/SecondHand">二手市场</a> (SecondHand)</td>
      <td class="title_2">板主: user1</td>
      <td class="title_4">20</td>
      <td class="title_6">5000</td>
      <td class="title_7">30000</td>
      <td class="title_8">89</td>
    </tr>
    <tr>
      <td class="title_1"><a href="/board/Advice">意见与建议</a> (Advice)</td>
      <td class="title_2">板主: root</td>
      <td class="title_4">3</td>
      <td class="title_6">800</td>
      <td class="title_7">5000</td>
      <td class="title_8">12</td>
    </tr>
    <tr>
      <td class="title_1"><a href="/board/Whisper">悄悄话</a></td>
      <td class="title_2">板主: admin</td>
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

    expect(all[0]!.name).toBe("招聘信息");
    expect(all[0]!.ename).toBe("JobInfo");
    expect(all[0]!.todayPosts).toBe("35");
    expect(all[0]!.threads).toBe("12345");
    expect(all[0]!.posts).toBe("67890");
    expect(all[0]!.onlineUsers).toBe("142");

    // 悄悄话：纯中文名无 ename
    expect(all[3]!.name).toBe("悄悄话");
    expect(all[3]!.ename).toBe("");
    expect(all[3]!.todayPosts).toBe("42");
  });

  it("按 ename 集合过滤只返回需要的版块", () => {
    const filtered = parseSectionTraffic(
      html,
      new Set(["JobInfo", "Advice"]),
    );
    expect(filtered).toHaveLength(2);
    expect(filtered.map((t) => t.ename).sort()).toEqual(["Advice", "JobInfo"]);
  });

  it("按中文名回退匹配纯中文版块（如悄悄话）", () => {
    const filtered = parseSectionTraffic(
      html,
      new Set(["(悄悄话)"]),   // 树中 ename 为 "(悄悄话)"，清理后为 "悄悄话"
      new Set(["悄悄话"]),      // 中文名集合
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.name).toBe("悄悄话");
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
      <td class="title_1"><a href="/board/Test">测试版</a> (Test)</td>
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
      <td class="title_1"><a href="/board/Advice">意见与建议</a> (Advice)</td>
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
    expect(all[0]!.ename).toBe("Advice");
  });
});

// ============================================================
// extractEnameFromCell 测试（ename 提取回退逻辑）
// ============================================================

describe("extractEnameFromCell（英文名提取）", () => {
  it("标准 (ename) 格式", () => {
    expect(extractEnameFromCell("招聘信息 (JobInfo)", "招聘信息")).toBe("JobInfo");
  });

  it("无括号回退：去掉中文名后取剩余", () => {
    expect(extractEnameFromCell("耳语IWhisper", "耳语")).toBe("IWhisper");
  });

  it("中文括号 fallback", () => {
    expect(extractEnameFromCell("意见与建议（Advice）", "意见与建议")).toBe("Advice");
  });

  it("中文名即全文、无 ename 时返回空", () => {
    expect(extractEnameFromCell("耳语", "耳语")).toBe("");
  });

  it("无中文名参数时回退到正则匹配", () => {
    expect(extractEnameFromCell("论坛帮助 (BBShelp)", "")).toBe("BBShelp");
  });
});
