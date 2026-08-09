import { requireLogin } from "../../../auth/auth.js";
import { fetchForumTree } from "../../../view/structure/index.js";
import { writeJson } from "../../../storage/structure-store.js";
import { fetchUserProfile, fetchUserTitles } from "../../../view/user/index.js";
import { fetchBoardArticles } from "../../../view/article/index.js";
import { ContentDb } from "../../../storage/content-db.js";
import { defaultTaskExecutor } from "../../execution/async-task-executor.js";
import { executionPolicyFromConcurrency } from "../../execution/execution-policy.js";
import { selectors } from "../../../core/config.js";
import { logWarn } from "../../../logging/logger.js";
import { collectBoards, boardManagers } from "../../../model/index.js";
import { forumRootFromLegacyTree } from "../../../model/index.js";
import type { ArticleRow, ForumStructure, ForumTreeNode, UserProfile } from "../../../model/dto/index.js";
import type { ContentStorePort } from "../../../model/index.js";

export interface InitStructureResult {
  sections: number;
  boards: number;
  treePath: string;
  errors: string[];
}

export interface InitManagersResult {
  managers: number;
  managersFetched: number;
  errors: string[];
}

export interface InitBoardArticlesResult {
  articlesFetched: number;
  articlesFailed: number;
  errors: string[];
}

export interface InitResult extends InitStructureResult, InitManagersResult, InitBoardArticlesResult {
  /** 本次是否爬取并缓存结构树 */
  withStructure: boolean;
  /** 本次是否收集版主资料/头衔 */
  withManagers: boolean;
  /** 本次是否抓取首页文章 */
  withArticles: boolean;
}

interface InitCommonOptions {
  concurrency?: number;
  store?: ContentStorePort;
}

/** 一键初始化参数：三个阶段可按开关组合。 */
export interface InitForumOptions extends InitCommonOptions {
  withStructure?: boolean;
  withManagers?: boolean;
  withArticles?: boolean;
}

/** 统计树中分区与版块数量。 */
function countTree(nodes: ForumTreeNode[]): { sections: number; boards: number } {
  let sections = 0;
  let boards = 0;
  function walk(list: ForumTreeNode[]): void {
    for (const node of list) {
      if (node.type === "section") {
        sections++;
        walk(node.children);
      } else {
        boards++;
      }
    }
  }
  walk(nodes);
  return { sections, boards };
}

// ════════════════════════════════════════════════════════════
// 1. 初始化论坛结构（轻量：只爬树结构 + 保存 JSON，不含流量）
// ════════════════════════════════════════════════════════════

/**
 * 初始化论坛结构：递归爬取完整树状结构并保存到 JSON。
 *
 * 轻量化语义（文档 §5.2.2）：本阶段只处理"静态骨架"（section/board 的
 * name/ename/manager），不爬任何版块首页文章、不采集流量。
 *
 * @param structurePath 结构缓存文件路径（默认 data/structure-overview.json）
 */
export async function initStructure(
  structurePath?: string,
  options: { store?: ContentStorePort } = {},
): Promise<InitStructureResult> {
  requireLogin();
  const errors: string[] = [];
  let tree: ForumTreeNode[];
  try {
    tree = await fetchForumTree();
  } catch (err) {
    return { sections: 0, boards: 0, treePath: "", errors: [`论坛结构爬取失败: ${String(err)}`] };
  }
  const path = structurePath ?? "structure-overview.json";
  const forumStructure: ForumStructure = { crawledAt: new Date().toISOString(), tree };
  writeJson(path, forumStructure);
  const { sections, boards } = countTree(tree);
  return { sections, boards, treePath: path, errors };
}

// ════════════════════════════════════════════════════════════
// 2. 初始化论坛版主（资料 + 特殊头衔，落库）
// ════════════════════════════════════════════════════════════

/**
 * 初始化论坛版主：从结构树收集版主 uid，并发抓取资料与特殊头衔并落库。
 *
 * 依赖结构缓存（initStructure 产出）；无结构缓存时自动爬取结构树。
 * 只处理版主用户实体/头衔，不碰版面首页文章。
 */
export async function initManagers(
  options: InitCommonOptions = {},
): Promise<InitManagersResult> {
  requireLogin();
  const policy = executionPolicyFromConcurrency(options.concurrency);
  const errors: string[] = [];

  const tree = await fetchForumTree();
  const forumRoot = forumRootFromLegacyTree(tree);
  const managers = forumRoot.managers.map((manager) => manager.uid);
  let managersFetched = 0;
  const ownsDb = !options.store;
  const db = options.store ?? new ContentDb();

  try {
    if (managers.length > 0) {
      const managerOutcomes = await defaultTaskExecutor.map(
        managers,
        { concurrency: policy.userFetch, failureMode: "isolate" },
        async (uid): Promise<{ uid: string; profile: UserProfile }> => ({
          uid,
          profile: await fetchUserProfile(uid),
        }),
      );
      for (const outcome of managerOutcomes) {
        const uid = managers[outcome.index]!;
        if (outcome.status === "failed") {
          errors.push(`版主 [${uid}] 资料抓取失败: ${outcome.error?.message ?? "未知错误"}`);
          continue;
        }
        if (outcome.status !== "success" || outcome.value === undefined) continue;
        const profile = outcome.value.profile;
        managersFetched++;
        db.upsertUser({ uid, name: profile.nickname || uid, profile });
        db.setUserManager(uid);
      }

      const managerUids = managerOutcomes
        .filter((outcome): outcome is typeof outcome & { status: "success"; value: { uid: string; profile: UserProfile } } => outcome.status === "success")
        .map((outcome) => outcome.value.uid);
      if (managerUids.length > 0) {
        try {
          const titles = await fetchUserTitles(managerUids);
          for (const [uid, title] of titles) {
            const profile = db.getUserProfile(uid) as (Record<string, unknown> & { title?: string[] }) | null;
            if (profile) db.upsertUserProfile(uid, { ...profile, title });
          }
        } catch (err) {
          errors.push(`版主特殊头衔抓取失败: ${String(err)}`);
        }
      }
    }
  } finally {
    if (ownsDb) db.close?.();
  }

  if (errors.length > 0) {
    logWarn("crawl", { message: "init 部分版主任务失败", count: errors.length }, "crawler.init");
  }
  return { managers: managers.length, managersFetched, errors };
}

// ════════════════════════════════════════════════════════════
// 3. 初始化论坛首页（各版首页文章，落库）
// ════════════════════════════════════════════════════════════

/**
 * 初始化论坛首页：DFS 枚举全部版块，并发抓取每个版块的首页文章并落库。
 *
 * 这是最重的阶段（286 版块 ≈ 286 次请求）；由 forum-init withArticles=true 触发，
 * 不单独暴露工具。
 */
export async function initBoardArticles(
  options: InitCommonOptions = {},
): Promise<InitBoardArticlesResult> {
  requireLogin();
  const policy = executionPolicyFromConcurrency(options.concurrency);
  const errors: string[] = [];

  const tree = await fetchForumTree();
  const forumRoot = forumRootFromLegacyTree(tree);
  let articlesFetched = 0;
  let articlesFailed = 0;
  const ownsDb = !options.store;
  const db = options.store ?? new ContentDb();

  try {
    const articlePlan = forumRoot.createFetchArticlesPlan({ traversal: "dfs", pageLimit: 1 });
    const articleOutcomes = await defaultTaskExecutor.map(
      articlePlan.tasks,
      { concurrency: policy.boardFetch, failureMode: "isolate" },
      async (task): Promise<{ ename: string; rows: ArticleRow[] }> => ({
        ename: task.board.ename,
        rows: await fetchBoardArticles(task.board.ename, { maxPages: task.pageLimit }),
      }),
    );

    for (const outcome of articleOutcomes) {
      const board = articlePlan.tasks[outcome.index]!.board;
      if (outcome.status === "failed") {
        articlesFailed++;
        errors.push(`版块 [${board.ename}] 首页文章抓取失败: ${outcome.error?.message ?? "未知错误"}`);
        continue;
      }
      if (outcome.status !== "success" || outcome.value === undefined || outcome.value.rows.length === 0) continue;
      articlesFetched++;
      const rows = outcome.value.rows;
      db.upsertBoard(board.ename, board.name, board.ename === selectors.anonymous.board);
      for (const row of rows) {
        if (row.authorUid) db.upsertUser({ uid: row.authorUid, name: row.authorRaw || row.authorUid });
      }
      db.upsertArticles(rows);
    }
  } finally {
    if (ownsDb) db.close?.();
  }

  if (errors.length > 0) {
    logWarn("crawl", { message: "init 部分首页任务失败", count: errors.length }, "crawler.init");
  }
  return { articlesFetched, articlesFailed, errors };
}

// ════════════════════════════════════════════════════════════
// 组装：一键初始化（默认 结构 + 版主，可选 首页文章）
// ════════════════════════════════════════════════════════════

/**
 * 一键初始化论坛数据。
 *
 * 三个阶段按参数开关组合：
 * - withStructure（默认 true）：爬取结构树并存 JSON 缓存
 * - withManagers（默认 true）：收集版主资料/特殊头衔并落库
 * - withArticles（默认 false）：抓各版首页文章落库（最重阶段）
 *
 * 默认 = 结构 + 版主（轻量，不爬首页文章、不采集流量）。
 *
 * @param dbPath         内容库路径（默认 forum-content.db）
 * @param structurePath  结构缓存路径（默认 data/structure-overview.json）
 * @param options         { withStructure?, withManagers?, withArticles?, concurrency?, store? }
 */
export async function initForum(
  dbPath?: string,
  structurePath?: string,
  options: InitForumOptions = {},
): Promise<InitResult> {
  const { withStructure = true, withManagers = true, withArticles = false } = options;
  const store = options.store ?? new ContentDb(dbPath);

  try {
    const structure: InitStructureResult = withStructure
      ? await initStructure(structurePath, { store })
      : { sections: 0, boards: 0, treePath: "", errors: [] };
    const managers: InitManagersResult = withManagers
      ? await initManagers({ ...options, store })
      : { managers: 0, managersFetched: 0, errors: [] };
    const boardArticles: InitBoardArticlesResult = withArticles
      ? await initBoardArticles({ ...options, store })
      : { articlesFetched: 0, articlesFailed: 0, errors: [] };

    return {
      sections: structure.sections,
      boards: structure.boards,
      treePath: structure.treePath,
      managers: managers.managers,
      managersFetched: managers.managersFetched,
      articlesFetched: boardArticles.articlesFetched,
      articlesFailed: boardArticles.articlesFailed,
      errors: [...structure.errors, ...managers.errors, ...boardArticles.errors],
      withStructure,
      withManagers,
      withArticles,
    };
  } finally {
    if (!options.store) store.close?.();
  }
}

/** 兼容旧调用：收集版主 uid 的算法仍来自 Forum 树算法出口。 */
export function collectBoardManagers(tree: ForumTreeNode[]): string[] {
  return boardManagers(tree);
}

/** 兼容旧调用：返回旧快照节点，供尚未迁移的调用方使用。 */
export function collectBoardNodes(tree: ForumTreeNode[]): Extract<ForumTreeNode, { type: "board" }>[] {
  return collectBoards(tree);
}
