import { routes, selectors, fillRoute, secrets } from "../utils/config.js";
import { ajaxGet } from "../utils/http-client.js";
import { requireLogin } from "../auth/auth.js";
import type { SectionNode, ForumTreeNode, Board } from "../utils/types.js";

// ============================================================
// AJAX 节点获取
// ============================================================

/**
 * AJAX 响应中的原始条目。
 *
 * 通过 t 字段 <a> 的 href 判断节点类型：
 *   /board/{ename}   → 版块（leaf）
 *   /section/{id}    → 分区（branch，可继续递归）
 */
interface AjaxEntry {
  t: string;  // HTML 片段，例如 '<a href="/board/Advice">意见与建议</a>'
  id: string; // AJAX 中 child 的 id 属性（非递归 key，仅作参考）
}

/**
 * 从 AJAX JSON 接口获取指定父节点下的子节点列表。
 * @param parentId "list-section" = 根级；其他值 = 该分区下的子节点
 */
async function fetchChildNodes(parentId: string): Promise<AjaxEntry[]> {
  const param = routes.tree_recursive_param;
  const path = `${routes.sections_ajax}?uid=${secrets.userId}&${param}=${parentId}`;
  const json = await ajaxGet(path);
  return JSON.parse(json) as AjaxEntry[];
}

// ============================================================
// 节点识别（基于 href 而非 id）
// ============================================================

const HREF_REGEX = new RegExp(selectors.section_ajax.href_regex);

/** 从 t 字段 HTML 中提取 href 属性值 */
function extractHref(t: string): string {
  const m = t.match(HREF_REGEX);
  return m ? m[1]! : "";
}

/** 判断 t 字段的 href 是否指向版块（/board/xxx） */
function isBoardHref(href: string): boolean {
  return href.includes(selectors.section_ajax.board_href_keyword);
}

/** 判断 t 字段的 href 是否指向分区（/section/xxx） */
function isSectionHref(href: string): boolean {
  return href.includes(selectors.section_ajax.section_href_keyword);
}

/** 从 /board/{ename} href 中提取版块英文名 */
function extractBoardEname(href: string): string {
  const m = href.match(/\/board\/(.+)/);
  return m ? m[1]! : "";
}

/** 从 t 字段的 HTML 中提取中文名称 */
function extractName(t: string): string {
  const m = t.match(selectors.section_ajax.name_regex);
  return m ? m[1]! : t;
}

// ============================================================
// 版块详情（批量获取统计信息）
// ============================================================

/**
 * 批量获取同一分区下版块的完整信息。
 * 对 parentId 下的所有版块 entries，统一请求一次 HTML，然后按顺序匹配。
 *
 * 注意：AJAX JSON 返回的条目顺序与 HTML <table> 行顺序一致。
 */
async function batchFetchBoardDetails(
  parentId: string,
  entries: AjaxEntry[],
): Promise<Board[]> {
  const html = await ajaxGet(
    fillRoute(routes.section_detail, { sectionId: parentId }),
  );

  const { load } = await import("cheerio");
  const $ = load(html);
  const sel = selectors.board_list;

  const rows = $(sel.row_selector).toArray();
  const boards: Board[] = [];

  for (let i = 0; i < Math.min(entries.length, rows.length); i++) {
    const entry = entries[i]!;
    const $tr = $(rows[i]!);

    const name = extractName(entry.t);
    if (!name) continue;

    const ename = $tr
      .find(sel.ename)
      .text()
      .trim()
      .replace(name, "")
      .trim();
    const manager = $tr
      .find(sel.manager)
      .text()
      .trim()
      .replace(/\s+/g, " ");
    const threads = $tr.find(sel.threads).text().trim();
    const posts = $tr.find(sel.posts).text().trim();

    const statsSel = selectors.board_stats.online_users;
    const onlineUsers = statsSel
      ? $tr.find(statsSel).text().trim()
      : undefined;

    boards.push({ name, ename, manager, posts, threads, onlineUsers });
  }

  // 如果 HTML 行数不够，用 entry 补充基本版块
  for (let i = rows.length; i < entries.length; i++) {
    const entry = entries[i]!;
    const name = extractName(entry.t);
    if (!name) continue;
    boards.push({
      name,
      ename: `(${name})`,
      manager: "",
      posts: "",
      threads: "",
    });
  }

  return boards;
}

// ============================================================
// 树结构递归爬取
// ============================================================

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
 * @param depth     当前递归深度（0 = 根层级）
 */
async function crawlNodeTree(
  parentId: string,
  depth: number = 0,
): Promise<ForumTreeNode[]> {
  const entries = await fetchChildNodes(parentId);
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
      boards = await batchFetchBoardDetails(parentId, boardEntries);
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
      const children = await crawlNodeTree(childId, depth + 1);
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

// ============================================================
// 公开 API
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

  const nodes = await crawlNodeTree(routes.tree_root_param);
  return nodes;
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
// 向后兼容的 API（保留旧签名，标记为 deprecated）
// ============================================================

/**
 * @deprecated 使用 fetchForumTree() 获取完整树
 */
export async function fetchSections(): Promise<{ id: string; name: string }[]> {
  requireLogin();
  const entries = await fetchChildNodes(routes.tree_root_param);
  return entries
    .map((e) => {
      const href = extractHref(e.t);
      return { id: href.replace(/\/section\//, "").trim() || e.id, name: extractName(e.t) };
    })
    .filter((s) => s.name);
}

/**
 * @deprecated 使用 fetchNodeChildren(sectionId) 获取直接子节点
 */
export async function fetchBoardsInSection(
  sectionId: string,
): Promise<Board[]> {
  requireLogin();
  const entries = await fetchChildNodes(sectionId);
  const boardEntries = entries.filter((e) => {
    const href = extractHref(e.t);
    return isBoardHref(href);
  });

  if (boardEntries.length > 0) {
    try {
      return await batchFetchBoardDetails(sectionId, boardEntries);
    } catch {
      // fall through
    }
  }

  return boardEntries.map((e) => ({
    name: extractName(e.t),
    ename: extractBoardEname(extractHref(e.t)) || `(${extractName(e.t)})`,
    manager: "",
    posts: "",
    threads: "",
  }));
}
