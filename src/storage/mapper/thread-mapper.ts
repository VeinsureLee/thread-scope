import type { ArticleNode } from "../../model/thread/article-node.js";

/** 将 ArticleNode 树展平为有稳定父子 ID 的持久化遍历顺序。 */
export function flattenArticleNodes(root: ArticleNode | null): ArticleNode[] {
  if (!root) return [];
  const result: ArticleNode[] = [];
  const stack: ArticleNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    result.push(node);
    for (let i = node.children.length - 1; i >= 0; i -= 1) {
      stack.push(node.children[i]!);
    }
  }
  return result;
}
