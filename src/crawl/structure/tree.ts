import type { ForumTreeNode, Board } from "../../models/index.js";
import { toSectionHtmlId } from "./id.js";
import { extractName, extractHref, isBoardHref, isSectionHref, extractBoardEname } from "./parser.js";
import { parseSectionDetailHtml } from "./detail.js";
import type { AjaxEntry, SectionRepository } from "./repository.js";
import { HttpSectionRepository } from "./repository.js";

/**
 * 递归爬取论坛树状结构。
 *
 * 算法（基于 href 判断节点类型）：
 * 1. AJAX 获取 parentId 下的所有条目
 * 2. 解析 t 字段 HTML 中的 href：
 *    - 包含 /board/   → 版块叶子节点
 *    - 包含 /section/ → 分区节点（递归）
 * 3. 对版块条目批量请求 HTML 获取详细统计
 * 4. 对分区条目递归调用 crawlNodeTree
 *
 * @param parentId "list-section" = 根级
 * @param repo     数据访问实现（默认 HTTP，测试可注入 fake）
 * @param depth    当前递归深度（0 = 根层级）
 */
export async function crawlNodeTree(
  parentId: string,
  repo: SectionRepository = new HttpSectionRepository(),
  depth: number = 0,
): Promise<ForumTreeNode[]> {
  const entries = await repo.listChildren(parentId);
  const result: ForumTreeNode[] = [];

  // 分离分区和版块 entries
  const sectionEntries: AjaxEntry[] = [];
  const boardEntries: AjaxEntry[] = [];

  for (const entry of entries) {
    const name = extractName(entry.t);
    if (!name || !name.trim()) continue; // 跳过空条目

    const href = extractHref(entry.t);
    if (isBoardHref(href)) {
      boardEntries.push(entry);
    } else if (isSectionHref(href)) {
      sectionEntries.push(entry);
    }
    // href 无法识别 → 跳过（不是可处理的节点）
  }

  // ── 处理版块（叶子） ──
  if (boardEntries.length > 0) {
    let boards: Board[];
    try {
      const html = await repo.getSectionDetail(toSectionHtmlId(parentId));
      boards = parseSectionDetailHtml(html, boardEntries);
    } catch {
      // HTML 解析失败，退化为基本信息
      boards = boardEntries.map((entry) => ({
        name: extractName(entry.t),
        ename: extractBoardEname(extractHref(entry.t)) || `(${extractName(entry.t)})`,
        manager: "",
        posts: "",
        threads: "",
      }));
    }

    for (const board of boards) {
      result.push({
        id: `board-${board.ename.replace(/[()]/g, "")}`,
        name: board.name,
        type: "board",
        level: depth + 1,
        board,
      });
    }
  }

  // ── 处理子分区（递归） ──
  for (const entry of sectionEntries) {
    const name = extractName(entry.t);
    // 递归参数使用 AJAX 返回的 id 字段（如 "sec-0", "sec-BBSLOG"），
    // 而非从 href 提取的值（href 仅用于类型判断）
    const childId = entry.id;
    try {
      const children = await crawlNodeTree(childId, repo, depth + 1);
      result.push({
        id: childId,
        name,
        type: "section",
        level: depth + 1,
        children,
      });
    } catch {
      result.push({
        id: childId,
        name,
        type: "section",
        level: depth + 1,
        children: [],
      });
    }
  }

  return result;
}
