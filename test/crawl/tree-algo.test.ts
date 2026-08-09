import { describe, it, expect } from "vitest";
import { collectBoards, boardEnames, boardManagers, findNodeById } from "../../src/model/algorithm/forum/tree-index.js";
import type { ForumTreeNode } from "../../src/model/dto/index.js";

// ── 合成测试树（不包含真实论坛内容） ──
const TREE: ForumTreeNode[] = [
  {
    id: "sec-0",
    name: "示例分区",
    type: "section",
    level: 1,
    children: [
      {
        id: "board-Demo",
        name: "示例版",
        type: "board",
        level: 2,
        board: { name: "示例版", ename: "Demo", manager: ["user_a", "user_b"] },
      },
      {
        id: "board-Demo2",
        name: "示例版2",
        type: "board",
        level: 2,
        board: { name: "示例版2", ename: "Demo2", manager: ["user_a", "user_c"] },
      },
      {
        id: "sec-0-0",
        name: "子分区",
        type: "section",
        level: 2,
        children: [
          {
            id: "board-Demo3",
            name: "示例版3",
            type: "board",
            level: 3,
            board: { name: "示例版3", ename: "Demo3", manager: ["user_d"] },
          },
        ],
      },
    ],
  },
];

describe("crawl/tree — collectBoards（BFS）", () => {
  it("收集全部版块叶子节点", () => {
    const boards = collectBoards(TREE);
    expect(boards.map((b) => b.board.ename)).toEqual(["Demo", "Demo2", "Demo3"]);
  });

  it("空树 → 空数组", () => {
    expect(collectBoards([])).toEqual([]);
  });
});

describe("crawl/tree — boardEnames / boardManagers", () => {
  it("boardEnames：全部版块英文名", () => {
    expect(boardEnames(TREE)).toEqual(["Demo", "Demo2", "Demo3"]);
  });

  it("boardManagers：全部版主 uid 去重", () => {
    expect(boardManagers(TREE).sort()).toEqual(["user_a", "user_b", "user_c", "user_d"]);
  });

  it("空树 → 空数组", () => {
    expect(boardEnames([])).toEqual([]);
    expect(boardManagers([])).toEqual([]);
  });
});

describe("crawl/tree — findNodeById（DFS）", () => {
  it("精确 ID 命中（board-/sec- 前缀）", () => {
    expect(findNodeById(TREE, "board-Demo")?.id).toBe("board-Demo");
    expect(findNodeById(TREE, "sec-0")?.id).toBe("sec-0");
  });

  it("去前缀命中（版块英文名）", () => {
    const n = findNodeById(TREE, "Demo");
    expect(n?.type).toBe("board");
    if (n && n.type === "board") expect(n.board.ename).toBe("Demo");
  });

  it("嵌套分区下命中", () => {
    expect(findNodeById(TREE, "board-Demo3")?.id).toBe("board-Demo3");
  });

  it("未找到 → null", () => {
    expect(findNodeById(TREE, "_nonexistent_")).toBeNull();
    expect(findNodeById([], "Demo")).toBeNull();
  });
});
