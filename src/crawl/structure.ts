import { routes, selectors, fillRoute, secrets } from "../utils/config.js";
import { ajaxGet } from "../utils/http-client.js";
import { requireLogin } from "../auth/auth.js";
import type { SectionNode, ForumTreeNode, Board } from "../utils/types.js";

// ============================================================
// AJAX 节点获取
// ============================================================

/**
 * AJAX 响应中的原始条目
 * id 为纯数字 → 版块（leaf）
 * id 为非数字 → 分区（branch，可继续递归）
 */
interface AjaxEntry {
  t: string;  // HTML 片段，例如 '<a href="...">名称</a>'
  id: string; // 数字字符串 = 版块；非数字 = 分区
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
// 节点识别
// ============================================================

const BOARD_ID_PATTERN = new RegExp(selectors.section_ajax.board_id_pattern);
const BOARD_ID_REGEX = new RegExp(selectors.section_ajax.board_id_regex);

/** 判断 AJAX 返回的 id 是否为版块（纯数字 = leaf） */
function isBoard(id: string): boolean {
  return BOARD_ID_PATTERN.test(id);
}

/** 从 t 字段的 HTML 中提取中文名称 */
function extractName(t: string): string {
  const m = t.match(selectors.section_ajax.name_regex);
  return m ? m[1]! : t;
}

/** 从版块 id 字符串提取数字部分 */
function extractBoardId(id: string): string {
  const m = id.match(BOARD_ID_REGEX);
  return m ? m[0]! : id;
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
 * 算法：
 * 1. AJAX 获取 parentId 下的所有条目
 * 2. 分离 section（非数字 id）和 board（数字 id）
 * 3. 对 board 条目批量请求 HTML 获取详细统计
 * 4. 对 section 条目递归调用 crawlNodeTree
 *
 * @param parentId "list-section" = 根级
 */
async function crawlNodeTree(parentId: string): Promise<ForumTreeNode[]> {
  const entries = await fetchChildNodes(parentId);
  const result: ForumTreeNode[] = [];

  // 分离分区和版块 entries
  const sectionEntries: AjaxEntry[] = [];
  const boardEntries: AjaxEntry[] = [];

  for (const entry of entries) {
    const name = extractName(entry.t);
    if (!name || !name.trim()) continue; // 跳过空条目
    if (isBoard(entry.id)) {
      boardEntries.push(entry);
    } else {
      sectionEntries.push(entry);
    }
  }

  // ── 处理版块（叶子） ──
  if (boardEntries.length > 0) {
    let boards: Board[];
    try {
      boards = await batchFetchBoardDetails(parentId, boardEntries);
    } catch {
      // HTML 解析失败，退化为基本版块
      boards = boardEntries.map((entry) => ({
        name: extractName(entry.t),
        ename: `(${extractName(entry.t)})`,
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
        board,
      });
    }
  }

  // ── 处理子分区（递归） ──
  for (const entry of sectionEntries) {
    const name = extractName(entry.t);
    try {
      const children = await crawlNodeTree(entry.id);
      result.push({
        id: entry.id,
        name,
        type: "section",
        children,
      });
    } catch {
      result.push({
        id: entry.id,
        name,
        type: "section",
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
export async function fetchForumTree(): Promise<SectionNode[]> {
  requireLogin();

  const nodes = await crawlNodeTree(routes.tree_root_param);
  // 根层级都应该是 SectionNode；遇到 BoardNode 则包装
  return nodes.map((n) => {
    if (n.type === "section") return n as SectionNode;
    return {
      id: n.id,
      name: n.name,
      type: "section" as const,
      children: [n],
    };
  });
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
    .map((e) => ({ id: e.id, name: extractName(e.t) }))
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
  const boards = entries.filter((e) => isBoard(e.id));

  if (boards.length > 0) {
    try {
      return await batchFetchBoardDetails(sectionId, boards);
    } catch {
      // fall through
    }
  }

  return boards.map((e) => ({
    name: extractName(e.t),
    ename: `(${extractName(e.t)})`,
    manager: "",
    posts: "",
    threads: "",
  }));
}
