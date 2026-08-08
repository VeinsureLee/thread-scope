import { describe, expect, it } from "vitest";
import { BoardNode, ForumRootNode, SectionNode } from "../../src/model/index.js";

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
  return new ForumRootNode({ id: "forum-root", name: "Forum", depth: 0, nodes: [section] });
}

describe("ForumNode 领域模型", () => {
  it("按 DFS/BFS 生成稳定版面任务，并聚合 UserRef 版主", () => {
    const forum = makeForum();
    expect(forum.collectBoards("dfs").map((b) => b.ename)).toEqual(["DemoA", "DemoB"]);
    expect(forum.collectBoards("bfs").map((b) => b.ename)).toEqual(["DemoA", "DemoB"]);
    expect(forum.managers.map((m) => m.uid)).toEqual(["user_1", "user_2"]);
  });

  it("搜索任务至少要求关键字或作者，并由节点只生成计划", () => {
    const forum = makeForum();
    expect(() => forum.createSearchArticlesPlan({})).toThrow("keyword 或 authorUid");
    const plan = forum.createSearchArticlesPlan({ authorUid: "user_2" }, { traversal: "dfs" });
    expect(plan.tasks.map((t) => t.query.authorUid)).toEqual(["user_2", "user_2"]);
    expect(plan.dedupeKey(plan.tasks[0]!)).toBe("DemoA");
  });

  it("section 流量由子 board 后序聚合", () => {
    const forum = makeForum();
    const boards = forum.collectBoards();
    boards[0]!.updateTraffic({ ename: "DemoA", name: "示例甲", onlineUsers: "2", todayPosts: "3", threads: "4", posts: "5" });
    boards[1]!.updateTraffic({ ename: "DemoB", name: "示例乙", onlineUsers: "7", todayPosts: "8", threads: "9", posts: "10" });
    forum.refreshTrafficFromChildren();
    expect(forum.traffic?.onlineUsers).toBe("9");
    expect(forum.traffic?.posts).toBe("15");
  });
});
