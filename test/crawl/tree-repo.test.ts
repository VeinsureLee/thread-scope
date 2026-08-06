import { describe, it, expect } from "vitest";
import { crawlNodeTree } from "../../src/crawl/structure/tree.js";
import type { SectionRepository, AjaxEntry } from "../../src/crawl/structure/repository.js";

/**
 * 单元测试：用 fake repository 验证树爬取算法，完全不依赖真实网络。
 *
 * 通过注入 SectionRepository 的假实现，覆盖：
 * - 分区/版块条目分离
 * - 版块详情解析（含退化路径）
 * - 子分区递归
 * - 分区详情失败时的降级行为
 *
 * 注意：所有名称均为合成测试数据，不包含真实论坛内容。
 */

/** 构造一个内存版 SectionRepository */
function makeFakeRepo(
  children: Record<string, AjaxEntry[]>,
  detailHtml: (sectionId: string) => string,
): SectionRepository {
  return {
    async listChildren(parentId: string): Promise<AjaxEntry[]> {
      if (!(parentId in children)) throw new Error(`unknown parent: ${parentId}`);
      return children[parentId]!;
    },
    async getSectionDetail(sectionId: string): Promise<string> {
      const html = detailHtml(sectionId);
      if (html.startsWith("__ERROR__")) throw new Error(html);
      return html;
    },
  };
}

/** 行类型：版块行或分区行（分区行无版主，stats 为空） */
type ListRow =
  | { kind: "board"; ename: string; name: string; manager?: string[] }
  | { kind: "section"; ename: string; name: string };

/** 构建版块列表 HTML（与真实页面结构一致：分区行与版块行穿插，版主为 <a> 链接 + <br> 分隔） */
function boardListHtml(rows: ListRow[]): string {
  const htmlRows = rows
    .map((b) => {
      if (b.kind === "section") {
        return `<tr>
        <td class="title_1"><a href="/section/${b.ename}">${b.name}</a><br>${b.ename}</td>
        <td class="title_2">[二级目录]<br /></td>
        <td class="title_3">&nbsp;</td>
        <td class="title_4 middle c63f">&nbsp;</td>
        <td class="title_5 middle c09f">&nbsp;</td>
        <td class="title_6 middle c63f">&nbsp;</td>
        <td class="title_7 middle c09f">&nbsp;</td>
      </tr>`;
      }
      const managers = (b.manager ?? [])
        .map((m) => `<a href="/user/query/${m}">${m}</a><br />`)
        .join("");
      return `<tr>
        <td class="title_1"><a href="/board/${b.ename}">${b.name}</a><br>${b.ename}</td>
        <td class="title_2">${managers}</td>
      </tr>`;
    })
    .join("\n    ");
  return `<table class="board-list"><tbody>
    ${htmlRows}
  </tbody></table>`;
}

/** 根级：两个分区 + 一个版块（合成名称） */
const children: Record<string, AjaxEntry[]> = {
  "list-section": [
    { t: '<a href="/section/sec-a">分区A</a>', id: "sec-a" },
    { t: '<a href="/section/zone-b">分区B</a>', id: "zone-b" },
    { t: '<a href="/board/board1">版块1</a>', id: "" },
  ],
  "sec-a": [
    { t: '<a href="/board/board2">版块2</a>', id: "" },
  ],
  "zone-b": [
    { t: '<a href="/section/sub-c">子分区C</a>', id: "sub-c" },
    { t: '<a href="/board/board3">版块3</a>', id: "" },
  ],
  "sub-c": [
    { t: '<a href="/board/board4">版块4</a>', id: "" },
    { t: '<a href="/board/board5">版块5</a>', id: "" },
  ],
};

describe("crawlNodeTree（fake repository，无网络）", () => {
  it("递归构建完整树：分区、子分区、版块", async () => {
    const repo = makeFakeRepo(children, (sid) =>
      boardListHtml(
        // 注意：crawlNodeTree 传入的 sectionId 是 toSectionHtmlId 之后的值（sec-a → "a"）
        sid === "a"
          ? [
              // 分区行与版块行穿插，验证按 ename 而非索引匹配
              { kind: "section", ename: "log", name: "日志区" },
              { kind: "board", ename: "board2", name: "版块2", manager: ["mgr1"] },
              { kind: "section", ename: "admin", name: "管理区" },
            ]
          : sid === "zone-b"
            ? [
                { kind: "section", ename: "sub-c", name: "子分区C" },
                { kind: "board", ename: "board3", name: "版块3", manager: ["mgr2"] },
              ]
            : sid === "sub-c"
              ? [
                  { kind: "board", ename: "board4", name: "版块4", manager: ["mgr3", "mgr4"] },
                  { kind: "board", ename: "board5", name: "版块5", manager: ["mgr5", "mgr6", "mgr7"] },
                ]
              : [{ kind: "board", ename: "board1", name: "版块1", manager: ["mgr1"] }],
      ),
    );

    const tree = await crawlNodeTree("list-section", repo);

    // 根：2 分区 + 1 版块
    expect(tree).toHaveLength(3);

    const secA = tree.find((n) => n.id === "sec-a")!;
    expect(secA.type).toBe("section");
    expect(secA.name).toBe("分区A");
    if (secA.type !== "section") return;
    // 只有 board2 一个版块（HTML 中穿插了 log/admin 两个分区行）
    expect(secA.children).toHaveLength(1);
    const board2 = secA.children[0]!;
    expect(board2.type).toBe("board");
    if (board2.type !== "board") return;
    expect(board2.board.name).toBe("版块2");
    expect(board2.board.manager).toEqual(["mgr1"]);

    // 直接版块叶子（根下）
    const board1 = tree.find((n) => n.id === "board-board1")!;
    expect(board1.type).toBe("board");
    if (board1.type !== "board") return;
    expect(board1.board.name).toBe("版块1");
    expect(board1.board.ename).toBe("board1");
    expect(board1.level).toBe(1);

    // 三层嵌套：zone-b → sub-c → board4/board5
    const zoneB = tree.find((n) => n.id === "zone-b")!;
    if (zoneB.type !== "section") throw new Error("expected section");
    const subC = zoneB.children.find((n) => n.id === "sub-c")!;
    expect(subC.type).toBe("section");
    if (subC.type !== "section") return;
    expect(subC.children).toHaveLength(2);
    const board4 = subC.children.find((n) => n.name === "版块4")!;
    expect(board4.type).toBe("board");
    if (board4.type !== "board") return;
    expect(board4.level).toBe(3);
    // 多版主：多个 <a> 链接应被收集为数组，而不是粘连/拼接
    expect(board4.board.manager).toEqual(["mgr3", "mgr4"]);
    // 三个版主
    const board5 = subC.children.find((n) => n.name === "版块5")!;
    if (board5.type !== "board") return;
    expect(board5.board.manager).toEqual(["mgr5", "mgr6", "mgr7"]);
  });

  it("分区详情失败时版块退化为基本信息（不抛出）", async () => {
    // zone-b 分区详情返回错误 → board3 退化为基本数据
    const repo = makeFakeRepo(children, (sid) =>
      sid === "zone-b" ? "__ERROR__detail failed__" : boardListHtml([]),
    );

    const tree = await crawlNodeTree("list-section", repo);

    const zoneB = tree.find((n) => n.id === "zone-b")!;
    expect(zoneB.type).toBe("section");
    if (zoneB.type !== "section") return;
    // zone-b 下有 sub-c 子分区 + board3 版块
    const board3 = zoneB.children.find((n) => n.type === "board");
    expect(board3?.type).toBe("board");
    if (board3?.type !== "board") return;
    expect(board3.board.ename).toBe("board3");
    // 静态字段退化为空值
    expect(board3.board.manager).toEqual([]);
  });

  it("子分区递归失败时降级为空 children", async () => {
    // 只提供根级数据，zone-b 的子分区 sub-c 查不到 → children=[]
    const repo = makeFakeRepo(
      {
        "list-section": [{ t: '<a href="/section/zone-b">分区B</a>', id: "zone-b" }],
        "zone-b": [{ t: '<a href="/section/sub-c">子分区C</a>', id: "sub-c" }],
      },
      () => "",
    );

    const tree = await crawlNodeTree("list-section", repo);

    const zoneB = tree.find((n) => n.id === "zone-b")!;
    if (zoneB.type !== "section") throw new Error("expected section");
    const subC = zoneB.children.find((n) => n.id === "sub-c")!;
    expect(subC.type).toBe("section");
    if (subC.type !== "section") return;
    expect(subC.children).toEqual([]);
  });

  it("空条目 / 空名称被跳过", async () => {
    const repo = makeFakeRepo(
      {
        "list-section": [
          { t: "", id: "" },
          { t: "   ", id: "" },
          { t: '<a href="/other/unknown">未知</a>', id: "1" },
          { t: '<a href="/board/board1">版块1</a>', id: "" },
        ],
      },
      () => boardListHtml([{ kind: "board", ename: "board1", name: "版块1" }]),
    );

    const tree = await crawlNodeTree("list-section", repo);

    expect(tree).toHaveLength(1);
    expect(tree[0]!.id).toBe("board-board1");
  });
});
