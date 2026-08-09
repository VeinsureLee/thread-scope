import { describe, it, expect } from "vitest";
import { buildTrafficTree } from "../../src/crawl/traffic/tree.js";
import type { ForumTreeNode, TrafficInfo } from "../../src/model/dto/index.js";

/** 构造 board 节点 */
function board(id: string, name: string, ename: string): ForumTreeNode {
  return { id, name, type: "board", level: 2, board: { name, ename, manager: [] } };
}

/** 构造 section 节点 */
function section(id: string, name: string, children: ForumTreeNode[], level = 1): ForumTreeNode {
  return { id, name, type: "section", level, children };
}

/** 构造 TrafficInfo */
function traffic(ename: string, o: string, t: string, th: string, p: string): TrafficInfo {
  return { ename, name: ename, onlineUsers: o, todayPosts: t, threads: th, posts: p };
}

/** 简化树：sec-a（含 b1/b2） + sec-b（含 b3） */
function makeTree(): ForumTreeNode[] {
  return [
    section("sec-a", "分区A", [board("board-b1", "版块一", "b1"), board("board-b2", "版块二", "b2")]),
    section("sec-b", "分区B", [board("board-b3", "版块三", "b3")]),
  ];
}

describe("buildTrafficTree（树状流量视图）", () => {
  it("board 节点 traffic 取对应流量", () => {
    const tree = makeTree();
    const byEname = new Map<string, TrafficInfo>([
      ["b1", traffic("b1", "1", "2", "100", "200")],
    ]);

    const view = buildTrafficTree(tree, byEname);

    const secA = view.find((n) => n.id === "sec-a")!;
    if (secA.type !== "section") throw new Error("expected section");
    const b1 = secA.children!.find((n) => n.id === "board-b1")!;
    expect(b1.type).toBe("board");
    if (b1.type !== "board") return;
    expect(b1.traffic?.posts).toBe("200");
  });

  it("board 未爬取时 traffic 为 null", () => {
    const tree = makeTree();
    const byEname = new Map<string, TrafficInfo>([
      ["b1", traffic("b1", "1", "2", "100", "200")],
      // b2 缺
    ]);

    const view = buildTrafficTree(tree, byEname);

    const secA = view.find((n) => n.id === "sec-a")!;
    if (secA.type !== "section") throw new Error("expected section");
    const b2 = secA.children!.find((n) => n.id === "board-b2")!;
    if (b2.type !== "board") return;
    expect(b2.traffic).toBeNull();
  });

  it("section 下全部 board 有值 → 聚合求和", () => {
    const tree = makeTree();
    const byEname = new Map<string, TrafficInfo>([
      ["b1", traffic("b1", "1", "2", "100", "200")],
      ["b2", traffic("b2", "3", "4", "50", "60")],
      ["b3", traffic("b3", "10", "20", "30", "40")],
    ]);

    const view = buildTrafficTree(tree, byEname);

    const secA = view.find((n) => n.id === "sec-a")!;
    expect(secA.type).toBe("section");
    if (secA.type !== "section") return;
    // 聚合 = b1 + b2
    expect(secA.traffic).toEqual({
      ename: "",
      name: "",
      onlineUsers: "4",
      todayPosts: "6",
      threads: "150",
      posts: "260",
    });

    const secB = view.find((n) => n.id === "sec-b")!;
    if (secB.type !== "section") return;
    // 聚合 = b3
    expect(secB.traffic?.posts).toBe("40");
  });

  it("section 有后代 board 未统计 → 聚合为 null", () => {
    const tree = makeTree();
    const byEname = new Map<string, TrafficInfo>([
      ["b1", traffic("b1", "1", "2", "100", "200")],
      // b2 缺 → sec-a 聚合为 null
      ["b3", traffic("b3", "10", "20", "30", "40")],
    ]);

    const view = buildTrafficTree(tree, byEname);

    const secA = view.find((n) => n.id === "sec-a")!;
    if (secA.type !== "section") return;
    expect(secA.traffic).toBeNull();

    // sec-b 齐全 → 有值
    const secB = view.find((n) => n.id === "sec-b")!;
    if (secB.type !== "section") return;
    expect(secB.traffic).not.toBeNull();
  });

  it("嵌套 section：外层聚合含内层全部后代 board", () => {
    // sec-top → sec-inner → b1,b2 ; 以及 sec-top 直接子 b3
    const tree: ForumTreeNode[] = [
      section("sec-top", "顶层", [
        section("sec-inner", "内层", [board("board-b1", "版块一", "b1"), board("board-b2", "版块二", "b2")], 2),
        board("board-b3", "版块三", "b3"),
      ]),
    ];

    const byEname = new Map<string, TrafficInfo>([
      ["b1", traffic("b1", "1", "2", "100", "200")],
      ["b2", traffic("b2", "3", "4", "50", "60")],
      ["b3", traffic("b3", "10", "20", "30", "40")],
    ]);

    const view = buildTrafficTree(tree, byEname);
    const top = view[0]!;
    if (top.type !== "section") return;

    const inner = top.children!.find((n) => n.id === "sec-inner")!;
    if (inner.type !== "section") return;
    expect(inner.traffic?.posts).toBe("260"); // b1+b2

    // 顶层聚合 = 内层(260) + b3(40) = 300
    expect(top.traffic?.posts).toBe("300");
    expect(top.traffic?.onlineUsers).toBe("14"); // 1+3+10
  });

  it("括号 ename 也能匹配（树中 ename 可能为 (xxx)）", () => {
    const tree: ForumTreeNode[] = [
      section("sec-a", "分区A", [
        { id: "board-xx", name: "版块X", type: "board", level: 2, board: { name: "版块X", ename: "(xx)", manager: [] } },
      ]),
    ];
    const byEname = new Map<string, TrafficInfo>([
      ["xx", traffic("xx", "7", "8", "90", "100")],
    ]);

    const view = buildTrafficTree(tree, byEname);
    const secA = view[0]!;
    if (secA.type !== "section") return;
    const bx = secA.children![0]!;
    if (bx.type !== "board") return;
    expect(bx.traffic).not.toBeNull();
    expect(bx.traffic?.onlineUsers).toBe("7");
  });
});
