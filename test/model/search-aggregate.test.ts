import { describe, expect, it } from "vitest";
import { groupByBoard, limitPerBoard } from "../../src/model/algorithm/forum/search-aggregate.js";

interface Row {
  boardEname: string;
  title: string;
}

const row = (boardEname: string, title: string): Row => ({ boardEname, title });

describe("groupByBoard（按版保序分组）", () => {
  it("按版分组并计数，保持首次出现顺序", () => {
    const items = [
      row("Demo", "甲"),
      row("Other", "乙"),
      row("Demo", "丙"),
      row("Other", "丁"),
      row("Demo", "戊"),
    ];
    const groups = groupByBoard(items);
    expect(groups.map((g) => g.boardEname)).toEqual(["Demo", "Other"]);
    expect(groups[0]!.count).toBe(3);
    expect(groups[0]!.items.map((i) => i.title)).toEqual(["甲", "丙", "戊"]);
    expect(groups[1]!.count).toBe(2);
  });

  it("空输入返回空分组", () => {
    expect(groupByBoard([])).toEqual([]);
  });
});

describe("limitPerBoard（每版限 N 条）", () => {
  it("每版最多保留 N 条，保序", () => {
    const items = [
      row("Demo", "1"),
      row("Demo", "2"),
      row("Demo", "3"),
      row("Other", "a"),
      row("Other", "b"),
    ];
    const limited = limitPerBoard(items, 2);
    expect(limited.map((i) => i.title)).toEqual(["1", "2", "a", "b"]);
  });

  it("非正整数视为不限制", () => {
    const items = [row("Demo", "1"), row("Demo", "2")];
    expect(limitPerBoard(items, 0).map((i) => i.title)).toEqual(["1", "2"]);
    expect(limitPerBoard(items, -1).map((i) => i.title)).toEqual(["1", "2"]);
  });
});
