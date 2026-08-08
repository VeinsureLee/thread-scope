import { describe, expect, it } from "vitest";
import {
  BoardNode,
  ForumNodeMapper,
  ForumRootNode,
  SectionNode,
} from "../../src/model/index.js";

function makeForum(): ForumRootNode {
  const boardA = new BoardNode({
    id: "board-DemoA",
    name: "示例甲",
    ename: "DemoA",
    depth: 2,
    managers: [{ uid: "user_1", displayName: "user_1" }],
  });
  const boardB = new BoardNode({
    id: "board-DemoB",
    name: "示例乙",
    ename: "DemoB",
    depth: 2,
    managers: [{ uid: "user_1", displayName: "user_1" }, { uid: "user_2", displayName: "user_2" }],
  });
  const section = new SectionNode({
    id: "sec-demo",
    name: "示例分区",
    depth: 1,
    nodes: [boardA, boardB],
  });
  return new ForumRootNode({ id: "forum-root", name: "Forum", baseUrl: "/", depth: 0, nodes: [section] });
}

describe("ForumNodeMapper（实体 <-> 快照水合）", () => {
  it("toSnapshot 生成可序列化 DTO（不含方法）", () => {
    const forum = makeForum();
    const snapshot = ForumNodeMapper.toSnapshot(forum);
    expect(snapshot.type).toBe("root");
    expect(snapshot.baseUrl).toBe("/");
    expect(snapshot.nodes).toHaveLength(1);
    const section = snapshot.nodes![0]!;
    expect(section.type).toBe("section");
    expect(section.nodes).toHaveLength(2);
    expect(section.nodes![0]!.type).toBe("board");
    expect(section.nodes![0]!.managers).toEqual([{ uid: "user_1", displayName: "user_1" }]);
  });

  it("fromSnapshot 重新水合为类实例（方法可调用）", () => {
    const forum = makeForum();
    const snapshot = ForumNodeMapper.toSnapshot(forum);
    const hydrated = ForumNodeMapper.fromSnapshot(snapshot);
    expect(hydrated).toBeInstanceOf(ForumRootNode);
    // 水合后方法可用（文档 §1.7 禁止直接断言普通对象）
    const plan = hydrated.createSearchArticlesPlan({ authorUid: "user_1" }, { traversal: "dfs" });
    expect(plan.tasks.map((t) => t.board.ename)).toEqual(["DemoA", "DemoB"]);
    // 版主去重已在构造时完成
    expect(hydrated.managers.map((m) => m.uid)).toEqual(["user_1", "user_2"]);
  });

  it("board 快照往返保持 ename 与 managers", () => {
    const board = new BoardNode({
      id: "board-X",
      name: "示例",
      ename: "X",
      depth: 1,
      managers: [{ uid: "m", displayName: "m" }],
    });
    const restored = ForumNodeMapper.fromSnapshot(ForumNodeMapper.toSnapshot(board));
    expect(restored).toBeInstanceOf(BoardNode);
    expect(restored.ename).toBe("X");
    expect(restored.managers).toEqual([{ uid: "m", displayName: "m" }]);
  });
});
