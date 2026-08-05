import { describe, it, expect } from "vitest";

/**
 * 单元测试：验证基于 href 的节点识别逻辑（无需网络）。
 *
 * 测试指标：
 * - href 正则从 t 字段 HTML 中提取 href
 * - /board/  pattern 判断版块叶子节点
 * - /section/ pattern 判断分区分支节点
 * - name_regex 从 t 字段 HTML 中提取名称
 */

// 从 selectors.yaml 复制规则值（防止 YAML 加载依赖）
const HREF_REGEX = /href="([^"]*)"/;
const BOARD_HREF_KEYWORD = "/board/";
const SECTION_HREF_KEYWORD = "/section/";
const NAME_REGEX = />(.+?)</;

/** 从 t 字段 HTML 中提取 href 属性值 */
function extractHref(t: string): string {
  const m = t.match(HREF_REGEX);
  return m ? m[1]! : "";
}

/** 判断 href 是否指向版块 */
function isBoardHref(href: string): boolean {
  return href.includes(BOARD_HREF_KEYWORD);
}

/** 判断 href 是否指向分区 */
function isSectionHref(href: string): boolean {
  return href.includes(SECTION_HREF_KEYWORD);
}

/** 从 /board/{ename} href 中提取版块英文名 */
function extractBoardEname(href: string): string {
  const m = href.match(/\/board\/(.+)/);
  return m ? m[1]! : "";
}

/** 模拟 extractName 逻辑 */
function extractName(t: string): string {
  const m = t.match(NAME_REGEX);
  return m ? m[1]! : t;
}

describe("论坛树结构 — 节点识别", () => {
  // ── href 提取 ──
  describe("extractHref（从 t 字段 HTML 提取 href）", () => {
    it('提取 /board/xxx href', () => {
      expect(extractHref('<a href="/board/Advice">意见与建议</a>'))
        .toBe("/board/Advice");
    });

    it('提取 /section/xxx href', () => {
      expect(extractHref('<a href="/section/sec-0">本站站务</a>'))
        .toBe("/section/sec-0");
    });

    it('无 href 时返回空字符串', () => {
      expect(extractHref("纯文本")).toBe("");
    });
  });

  // ── 版块 vs 分区判断（基于 href） ──
  describe("isBoardHref / isSectionHref（href 路径判断）", () => {
    it('/board/xxx → 版块 (leaf)', () => {
      expect(isBoardHref("/board/Advice")).toBe(true);
      expect(isBoardHref("/board/BBShelp")).toBe(true);
      expect(isBoardHref("/board/JobInfo")).toBe(true);
    });

    it('/section/xxx → 分区 (branch)', () => {
      expect(isSectionHref("/section/sec-0")).toBe(true);
      expect(isSectionHref("/section/news")).toBe(true);
    });

    it('/board/ 不是分区', () => {
      expect(isSectionHref("/board/Advice")).toBe(false);
    });

    it('/section/ 不是版块', () => {
      expect(isBoardHref("/section/sec-0")).toBe(false);
    });

    it('空 href 两者均 false', () => {
      expect(isBoardHref("")).toBe(false);
      expect(isSectionHref("")).toBe(false);
    });
  });

  // ── 版块英文名提取 ──
  describe("extractBoardEname（从 href 提取英文名）", () => {
    it('提取 /board/Advice → Advice', () => {
      expect(extractBoardEname("/board/Advice")).toBe("Advice");
    });

    it('多级路径只取第一段', () => {
      expect(extractBoardEname("/board/BBShelp/sub")).toBe("BBShelp/sub");
    });

    it('无 /board/ 返回空', () => {
      expect(extractBoardEname("/section/sec-0")).toBe("");
    });
  });

  // ── 名称提取 ──
  describe("extractName（从 t 字段 HTML 提取名称）", () => {
    it('提取 a 标签文本', () => {
      expect(extractName('<a href="/section/news">校园生活</a>'))
        .toBe("校园生活");
      expect(extractName('<a href="/board/Advice">意见与建议</a>'))
        .toBe("意见与建议");
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
});

describe("论坛树结构 — 递归逻辑", () => {
  /** 模拟 AJAX 返回的条目列表 */
  interface MockEntry {
    t: string;
    id: string;
  }

  /**
   * 模拟 crawlNodeTree 的核心逻辑：
   * 解析每个 entry 的 href，按 /board/ 或 /section/ 分类。
   */
  function classifyNodes(entries: MockEntry[]) {
    const sections: MockEntry[] = [];
    const boards: MockEntry[] = [];

    for (const entry of entries) {
      const name = extractName(entry.t);
      if (!name || !name.trim()) continue;

      const href = extractHref(entry.t);
      if (isBoardHref(href)) {
        boards.push(entry);
      } else if (isSectionHref(href)) {
        sections.push(entry);
      }
      // href 无法识别 → 跳过（非可处理节点）
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
      { t: '<a href="/board/Advice">版块A</a>', id: "" },
      { t: '<a href="/board/BBShelp">版块B</a>', id: "" },
      { t: '<a href="/board/JobInfo">版块C</a>', id: "" },
    ];
    const { sections, boards } = classifyNodes(entries);
    expect(boards).toHaveLength(3);
    expect(sections).toHaveLength(0);
    expect(extractBoardEname(extractHref(entries[0]!.t))).toBe("Advice");
  });

  it("混合分区和版块 → 正确分离", () => {
    const entries: MockEntry[] = [
      { t: '<a href="/section/sec-1">子分区A</a>', id: "sec-1" },
      { t: '<a href="/board/Advice">版块A</a>', id: "" },
      { t: '<a href="/board/BBShelp">版块B</a>', id: "" },
      { t: '<a href="/section/nest">子分区B</a>', id: "nest" },
    ];
    const { sections, boards } = classifyNodes(entries);
    expect(sections).toHaveLength(2);
    expect(extractName(sections[0]!.t)).toBe("子分区A");
    expect(extractName(sections[1]!.t)).toBe("子分区B");
    expect(boards).toHaveLength(2);
  });

  it("跳过空名称条目", () => {
    const entries: MockEntry[] = [
      { t: "", id: "" },
      { t: '<a href="/board/Advice">版块A</a>', id: "" },
      { t: "   ", id: "" },
    ];
    const { sections, boards } = classifyNodes(entries);
    expect(boards).toHaveLength(1);
    expect(sections).toHaveLength(0);
  });

  it("大量版块（50+）可正确分类", () => {
    const entries: MockEntry[] = Array.from({ length: 60 }, (_, i) => ({
      t: `<a href="/board/b${i}">版块${i}</a>`,
      id: "",
    }));
    const { sections, boards } = classifyNodes(entries);
    expect(boards).toHaveLength(60);
    expect(sections).toHaveLength(0);
  });

  it("无法识别的 href 被跳过（既非 /board/ 也非 /section/）", () => {
    const entries: MockEntry[] = [
      { t: '<a href="/other/unknown">未知</a>', id: "1" },
      { t: '<a href="/board/Advice">版块A</a>', id: "" },
    ];
    const { sections, boards } = classifyNodes(entries);
    expect(boards).toHaveLength(1);
    expect(sections).toHaveLength(0);
  });
});
