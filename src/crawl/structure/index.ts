import { requireLogin } from "../../auth/auth.js";
import type { ForumTreeNode } from "../../models/index.js";
import { crawlNodeTree } from "./tree.js";

// ============================================================
// structure 模块统一出口
// ============================================================

/**
 * 爬取论坛完整树状结构。
 * 需要先登录。
 *
 * @example
 * const tree = await fetchForumTree();
 * // tree[0] = {
 * //   id: "news", name: "校园生活", type: "section",
 * //   children: [
 * //     { id: "board-example", name: "招聘信息", type: "board", board: {...} },
 * //     { id: "market", name: "二手市场", type: "section", children: [...] },
 * //   ]
 * // }
 */
export async function fetchForumTree(): Promise<ForumTreeNode[]> {
  requireLogin();
  return crawlNodeTree("list-section");
}

/**
 * 获取指定节点下的直接子节点（不递归更深的分区）。
 * 适用场景：逐步展开树结构。
 */
export async function fetchNodeChildren(
  parentId: string,
): Promise<ForumTreeNode[]> {
  requireLogin();
  return crawlNodeTree(parentId);
}

// ============================================================
// 底层算法导出（供高级用法 / 测试注入 repository）
// ============================================================

export { crawlNodeTree } from "./tree.js";
export type { SectionRepository, AjaxEntry } from "./repository.js";
