import { requireLogin } from "../auth/auth.js";
import { fetchForumTree } from "../crawl/structure/index.js";
import { writeJson } from "../storage/store.js";
import type { ForumStructure, ForumTreeNode } from "../models/index.js";

export interface InitResult {
  sections: number;
  boards: number;
  errors: string[];
}

/**
 * 初始化论坛数据。
 *
 * 流程：
 * 1. 检查登录状态
 * 2. 递归爬取完整树状结构 → 保存 forum-structure.json
 *
 * 树状层级说明：
 *   第 1 层（level 1）：根级讨论区（如"校园生活"、"学术天地"）
 *   第 2 层（level 2）：二级目录（如"院系风采"下的子分类），也可能是版面（叶节点）
 *   第 3 层（level 3）：三级目录（更深嵌套），也可能是版面（叶节点）
 *   ...
 *   叶节点：版面（board），type="board"，包含版面基本信息
 *
 * 暂不爬取版面首页文章内容，仅保存树状结构。
 * 需要先执行 forum-login。
 */
export async function initForum(): Promise<InitResult> {
  requireLogin();

  const errors: string[] = [];
  let totalSections = 0;
  let totalBoards = 0;

  // ── 1. 爬取论坛完整树 ──
  let tree: ForumTreeNode[];
  try {
    tree = await fetchForumTree();
  } catch (err) {
    return {
      sections: 0,
      boards: 0,
      errors: [`论坛结构爬取失败: ${String(err)}`],
    };
  }

  const forumStructure: ForumStructure = {
    crawledAt: new Date().toISOString(),
    tree,
  };
  writeJson("forum-structure.json", forumStructure);

  // ── 2. 遍历树统计各层级 ──
  function walkTree(nodes: ForumTreeNode[], depth: number = 0) {
    for (const node of nodes) {
      if (node.type === "section") {
        totalSections++;
        walkTree(node.children, depth + 1);
      } else {
        totalBoards++;
      }
    }
  }
  walkTree(tree);

  return {
    sections: totalSections,
    boards: totalBoards,
    errors,
  };
}
