import { requireLogin } from "../../auth/auth.js";
import type { ForumTreeNode } from "../../model/dto/index.js";
import { readJson, writeJson } from "../../storage/structure-store.js";
import { crawlNodeTree } from "./tree.js";

/**
 * 论坛结构树：缓存读取 + 联网爬取保存。
 *
 * 分工（架构优化）：
 * - 【读缓存】loadCachedTree：直接读 data/structure-overview.json，秒回、不联网、无需登录；
 * - 【爬取保存】fetchForumTree({ refresh: true })：联网爬取完整树并保存到 JSON；
 * - 默认 fetchForumTree()：缓存优先，无缓存才爬取并保存。
 *
 * 论坛树是"静态骨架"（仅 name/ename/manager），由 forum-init 全量爬取保存；
 * 后续工具（fetch-structure / fetch-traffic / search）优先读缓存，避免反复联网。
 */

/** 论坛结构缓存文件名 */
export const STRUCTURE_CACHE_FILE = "structure-overview.json";

/**
 * 从本地 JSON 缓存读取论坛树；无缓存返回 null。
 * 不联网、无需登录。
 */
export function loadCachedTree(): ForumTreeNode[] | null {
  const cached = readJson<{ tree: ForumTreeNode[] }>(STRUCTURE_CACHE_FILE);
  return cached?.tree ?? null;
}

/**
 * 获取论坛树：缓存优先。
 * - 有缓存 → 直接返回（不联网、无需登录）
 * - 无缓存 → 联网爬取并保存
 * - refresh=true → 强制联网爬取并更新缓存
 */
export async function fetchForumTree(
  opts: { refresh?: boolean } = {},
): Promise<ForumTreeNode[]> {
  if (!opts.refresh) {
    const cached = loadCachedTree();
    if (cached) return cached;
  }
  requireLogin();
  const tree = await crawlNodeTree("list-section");
  writeJson(STRUCTURE_CACHE_FILE, {
    crawledAt: new Date().toISOString(),
    tree,
  });
  return tree;
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
