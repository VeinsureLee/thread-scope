import { describe, expect, it } from "vitest";
import { buildForumTreeIndex, resolveBoardsFromEntries, findNodeById } from "../../src/model/algorithm/forum/tree-index.js";
import type { ForumTreeNode } from "../../src/model/dto/index.js";

function board(id: string, name: string, ename: string): ForumTreeNode {
  return { id, name, type: "board", level: 2, board: { name, ename, manager: [] } };
}
function section(id: string, name: string, children: ForumTreeNode[]): ForumTreeNode {
  return { id, name, type: "section", level: 1, children };
}

const TREE: ForumTreeNode[] = [
  section("sec-alpha", "分区甲", [
    board("board-Demo", "示例版", "Demo"),
    board("board-Other", "其他版", "Other"),
  ]),
  section("sec-beta", "分区乙", [
    board("board-ExampleBeauty", "示例美妆", "ExampleBeauty"),
    section("sub-gamma", "子分区丙", [board("board-Hidden", "私密版", "Hidden")]),
  ]),
];

describe("buildForumTreeIndex（哈希化索引）", () => {
  it("索引包含全部板与分区，可按别名查找", () => {
    const index = buildForumTreeIndex(TREE);
    expect(index.boards.length).toBe(4);
    expect(index.sections.length).toBe(3); // sec-alpha, sec-beta, sub-gamma

    // 按精确 id（索引键小写化）
    expect(index.byKey.get("board-demo")).toMatchObject({ type: "board" });
    // 按去前缀 id
    expect(index.byKey.get("demo")).toMatchObject({ type: "board" });
    // 按 ename（小写化）
    expect(index.byKey.get("examplebeauty")).toMatchObject({ id: "board-ExampleBeauty" });
    // 按版块中文名
    expect(index.byKey.get("示例美妆")).toMatchObject({ id: "board-ExampleBeauty" });
    // 按分区中文名
    expect(index.byKey.get("分区甲")).toMatchObject({ id: "sec-alpha" });
  });
});

describe("resolveBoardsFromEntries（混合解析）", () => {
  const index = buildForumTreeIndex(TREE);

  it("版块 ename / 分区 id / 中文名混合解析为版块集合（树序去重）", () => {
    const { enames, unresolved } = resolveBoardsFromEntries(index, ["Demo", "sec-beta", "示例美妆", "子分区丙"]);
    // sec-beta 展开 → ExampleBeauty, Hidden；子分区丙 → Hidden（去重）
    expect(enames).toEqual(["Demo", "ExampleBeauty", "Hidden"]);
    expect(unresolved).toEqual([]);
  });

  it("无法解析的条目进入 unresolved，不抛错", () => {
    const { enames, unresolved } = resolveBoardsFromEntries(index, ["Demo", "不存在", "Other"]);
    expect(enames).toEqual(["Demo", "Other"]);
    expect(unresolved).toEqual(["不存在"]);
  });

  it("分区展开为全部后代版块", () => {
    const { enames } = resolveBoardsFromEntries(index, ["sec-alpha"]);
    expect(enames).toEqual(["Demo", "Other"]);
  });
});

describe("findNodeById（中文名匹配）", () => {
  it("支持按版块中文名查找", () => {
    expect(findNodeById(TREE, "示例美妆")?.id).toBe("board-ExampleBeauty");
  });

  it("支持按分区中文名与 ename 查找", () => {
    expect(findNodeById(TREE, "分区甲")?.id).toBe("sec-alpha");
    expect(findNodeById(TREE, "ExampleBeauty")?.id).toBe("board-ExampleBeauty");
  });

  it("未找到返回 null", () => {
    expect(findNodeById(TREE, "不存在")).toBeNull();
  });
});
