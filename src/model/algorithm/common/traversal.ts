export interface TreeAdapter<TNode> {
  childrenOf(node: TNode): readonly TNode[];
}

/** 迭代 DFS，避免论坛结构异常加深时触发 JavaScript 调用栈限制。 */
export function dfs<TNode>(
  roots: readonly TNode[],
  adapter: TreeAdapter<TNode>,
): TNode[] {
  const result: TNode[] = [];
  const stack = [...roots].reverse();
  while (stack.length > 0) {
    const node = stack.pop()!;
    result.push(node);
    const children = adapter.childrenOf(node);
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push(children[i]!);
    }
  }
  return result;
}

/** 迭代 BFS，用于收集和索引类任务。 */
export function bfs<TNode>(
  roots: readonly TNode[],
  adapter: TreeAdapter<TNode>,
): TNode[] {
  const result: TNode[] = [];
  const queue = [...roots];
  let cursor = 0;
  while (cursor < queue.length) {
    const node = queue[cursor++]!;
    result.push(node);
    queue.push(...adapter.childrenOf(node));
  }
  return result;
}

export function findFirst<TNode>(
  roots: readonly TNode[],
  adapter: TreeAdapter<TNode>,
  predicate: (node: TNode) => boolean,
  order: "dfs" | "bfs" = "dfs",
): TNode | null {
  const nodes = order === "dfs" ? dfs(roots, adapter) : bfs(roots, adapter);
  return nodes.find(predicate) ?? null;
}
