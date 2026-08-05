import { describe, it, expect } from "vitest";

/**
 * 单元测试：验证 AJAX 节点识别逻辑（无需网络）。
 *
 * 测试指标：
 * - board_id_pattern 正则对纯数字/非数字 id 的判定
 * - name_regex 从 t 字段 HTML 中提取名称
 * - board_id_regex 从 id 提取数字部分
 */

// 从 selectors.yaml 复制规则值（防止 YAML 加载依赖）
const BOARD_ID_PATTERN = /^\d+$/;
const BOARD_ID_REGEX = /\d+/;
const NAME_REGEX = />(.+?)</;

/** 模拟 isBoard 逻辑 */
function isBoard(id: string): boolean {
  return BOARD_ID_PATTERN.test(id);
}

/** 模拟 extractName 逻辑 */
function extractName(t: string): string {
  const m = t.match(NAME_REGEX);
  return m ? m[1]! : t;
}

/** 模拟 extractBoardId 逻辑 */
function extractBoardId(id: string): string {
  const m = id.match(BOARD_ID_REGEX);
  return m ? m[0]! : id;
}

describe("论坛树结构 — 节点识别", () => {
  // ── 版块 vs 分区判断 ──
  describe("isBoard（id 类型判断）", () => {
    it('纯数字 id → 版块 (leaf)', () => {
      expect(isBoard("123")).toBe(true);
      expect(isBoard("0")).toBe(true);
      expect(isBoard("987654321")).toBe(true);
    });

    it('非数字 id → 分区 (branch)', () => {
      expect(isBoard("news")).toBe(false);
      expect(isBoard("section-abc")).toBe(false);
      expect(isBoard("list-section")).toBe(false);
    });

    it('含数字但不纯 → 分区', () => {
      expect(isBoard("sec123")).toBe(false);
      expect(isBoard("123abc")).toBe(false);
    });
  });

  // ── 名称提取 ──
  describe("extractName（从 t 字段 HTML 提取名称）", () => {
    it('提取 a 标签文本', () => {
      expect(extractName('<a href="/section/news">校园生活</a>'))
        .toBe("校园生活");
      expect(extractName('<a href="/board/example">招聘信息</a>'))
        .toBe("招聘信息");
    });

    it('无 a 标签时返回原始字符串', () => {
      const raw = "纯文本名称";
      expect(extractName(raw)).toBe(raw);
    });

    it('含嵌套标签时贪婪匹配（> 后匹配到第一个 <）', () => {
      // 实际 regex >(.+?)< 从第一个 > 到最近 <，所以只捕获到 <font color="red">
      // 论坛真实 t 字段不含嵌套 HTML，所以不影响实际使用
      expect(extractName('<a href="/s/1"><font color="red">热点</font></a>'))
        .toBe('<font color="red">热点');
    });
  });

  // ── 版块 ID 提取 ──
  describe("extractBoardId（提取数字 ID）", () => {
    it('从 "board/123" 提取数字部分', () => {
      expect(extractBoardId("board/123")).toBe("123");
    });

    it('纯数字直接返回', () => {
      expect(extractBoardId("456")).toBe("456");
    });

    it('无数字时返回原值', () => {
      expect(extractBoardId("abc")).toBe("abc");
    });
  });
});

describe("论坛树结构 — 递归逻辑", () => {
  /** 模拟 AJAX 返回的条目列表 */
  interface MockEntry {
    t: string;
    id: string;
  }

  /**
   * 模拟 crawlNodeTree 的核心逻辑：
   * 将 entries 按 isBoard 分成两个数组。
   */
  function classifyNodes(entries: MockEntry[]) {
    const sections: MockEntry[] = [];
    const boards: MockEntry[] = [];

    for (const entry of entries) {
      const name = extractName(entry.t);
      // 跳过空名称：无内容或纯空白
      if (!name || !name.trim()) continue;
      if (isBoard(entry.id)) {
        boards.push(entry);
      } else {
        sections.push(entry);
      }
    }

    return { sections, boards };
  }

  it("空列表返回空结果", () => {
    const { sections, boards } = classifyNodes([]);
    expect(sections).toHaveLength(0);
    expect(boards).toHaveLength(0);
  });

  it("全部是版块 → boards 收集，sections 为空", () => {
    const entries: MockEntry[] = [
      { t: '<a href="/board/a">版块A</a>', id: "1" },
      { t: '<a href="/board/b">版块B</a>', id: "2" },
      { t: '<a href="/board/c">版块C</a>', id: "3" },
    ];
    const { sections, boards } = classifyNodes(entries);
    expect(boards).toHaveLength(3);
    expect(sections).toHaveLength(0);
  });

  it("混合分区和版块 → 正确分离", () => {
    const entries: MockEntry[] = [
      { t: '<a href="/section/sub">子分区</a>', id: "sub-sec" },
      { t: '<a href="/board/a">版块A</a>', id: "1" },
      { t: '<a href="/board/b">版块B</a>', id: "2" },
      { t: '<a href="/section/nest">嵌套区</a>', id: "nest" },
    ];
    const { sections, boards } = classifyNodes(entries);
    expect(sections).toHaveLength(2);
    expect(extractName(sections[0]!.t)).toBe("子分区");
    expect(extractName(sections[1]!.t)).toBe("嵌套区");
    expect(boards).toHaveLength(2);
  });

  it("跳过空名称条目", () => {
    const entries: MockEntry[] = [
      { t: "", id: "1" },
      { t: '<a href="/board/a">版块A</a>', id: "2" },
      { t: "   ", id: "3" },
    ];
    const { sections, boards } = classifyNodes(entries);
    expect(boards).toHaveLength(1);
    expect(sections).toHaveLength(0);
  });

  it("大量版块（50+）可正确分类", () => {
    const entries: MockEntry[] = Array.from({ length: 60 }, (_, i) => ({
      t: `<a href="/board/b${i}">版块${i}</a>`,
      id: String(i),
    }));
    const { sections, boards } = classifyNodes(entries);
    expect(boards).toHaveLength(60);
    expect(sections).toHaveLength(0);
  });
});
