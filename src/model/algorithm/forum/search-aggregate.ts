/** 按版分组后的结果组。 */
export interface BoardGroup<T extends { boardEname: string }> {
  readonly boardEname: string;
  readonly count: number;
  readonly items: T[];
}

/**
 * 把扁平命中结果按版块保序分组，并统计每组条数。
 *
 * 纯函数算法（文档 §2.1）：只读元素字段，不发请求。用于本地搜索路径
 * （一次全库查询后按版分组）；远程路径天然按版执行，直接产生分组。
 *
 * @param items 带 boardEname 的命中项（如 ArticleRow / SearchResult）
 * @returns 按首次出现顺序的分组列表
 */
export function groupByBoard<T extends { boardEname: string }>(items: readonly T[]): BoardGroup<T>[] {
  const groups: BoardGroup<T>[] = [];
  const index = new Map<string, BoardGroup<T>>();
  for (const item of items) {
    let group = index.get(item.boardEname);
    if (!group) {
      group = { boardEname: item.boardEname, count: 0, items: [] };
      index.set(item.boardEname, group);
      groups.push(group);
    }
    group.items.push(item);
    (group as { count: number }).count += 1;
  }
  return groups;
}

/**
 * 每版最多保留 N 条命中（保序）。
 *
 * 供 "每个 board 最多返回几条 thread" 的语义使用：输入是全局扁平命中，
 * 输出仍全局扁平但每版条目数被限制。
 *
 * @param items    命中项
 * @param perBoard 每版上限；非正整数视为不限制
 */
export function limitPerBoard<T extends { boardEname: string }>(items: readonly T[], perBoard: number): T[] {
  if (!Number.isInteger(perBoard) || perBoard < 1) return [...items];
  const counts = new Map<string, number>();
  const result: T[] = [];
  for (const item of items) {
    const used = counts.get(item.boardEname) ?? 0;
    if (used >= perBoard) continue;
    counts.set(item.boardEname, used + 1);
    result.push(item);
  }
  return result;
}
