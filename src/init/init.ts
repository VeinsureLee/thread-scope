import { requireLogin } from "../auth/auth.js";
import { fetchForumTree } from "../crawl/structure.js";
import { fetchBoardArticles } from "../crawl/articles.js";
import { writeJson } from "../storage/store.js";
import type { ForumStructure, SectionNode } from "../utils/types.js";

export interface InitResult {
  sections: number;
  boards: number;
  articles: number;
  errors: string[];
}

/**
 * 初始化论坛数据。
 *
 * 流程：
 * 1. 检查登录状态
 * 2. 递归爬取完整树状结构 → 保存 forum-structure.json
 * 3. 遍历树中所有版块，爬取首页文章 → 保存 board-{name}.json
 *
 * 需要先执行 forum-login。
 */
export async function initForum(): Promise<InitResult> {
  requireLogin();

  const errors: string[] = [];
  let totalSections = 0;
  let totalBoards = 0;
  let totalArticles = 0;

  // ── 1. 爬取论坛完整树 ──
  let tree: SectionNode[];
  try {
    tree = await fetchForumTree();
  } catch (err) {
    return {
      sections: 0,
      boards: 0,
      articles: 0,
      errors: [`论坛结构爬取失败: ${String(err)}`],
    };
  }

  const forumStructure: ForumStructure = {
    crawledAt: new Date().toISOString(),
    tree,
  };
  writeJson("forum-structure.json", forumStructure);

  // ── 2. 遍历树统计 ──
  function walkTree(nodes: SectionNode[]) {
    for (const node of nodes) {
      totalSections++;
      for (const child of node.children) {
        if (child.type === "board") {
          totalBoards++;
        } else {
          walkTree([child as SectionNode]);
        }
      }
    }
  }
  walkTree(tree);

  // ── 3. 爬取每个版块的文章 ──
  async function crawlArticles(nodes: SectionNode[]) {
    for (const node of nodes) {
      for (const child of node.children) {
        if (child.type === "board") {
          const bd = child.board;
          const ename = bd.ename.replace(/[()]/g, "");
          try {
            const articles = await fetchBoardArticles(ename);
            writeJson(`board-${ename}.json`, articles);
            totalArticles += articles.length;
          } catch (err) {
            const msg = `版块 [${bd.name}] 文章爬取失败: ${String(err)}`;
            errors.push(msg);
          }
        } else {
          await crawlArticles([child as SectionNode]);
        }
      }
    }
  }
  await crawlArticles(tree);

  return {
    sections: totalSections,
    boards: totalBoards,
    articles: totalArticles,
    errors,
  };
}
