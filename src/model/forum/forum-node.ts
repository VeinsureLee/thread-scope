import { bfs, dfs } from "../algorithm/common/traversal.js";
import { refreshTraffic } from "../algorithm/forum/traffic-aggregate.js";
import type { UserRef } from "../user/user-ref.js";
import type { TrafficInfo } from "../traffic/traffic-info.js";
import type { BoardNode } from "./board-node.js";

export type ForumNodeType = "root" | "section" | "board";
export type ForumTraversal = "dfs" | "bfs";

export type { UserRef } from "../user/user-ref.js";
export type { TrafficInfo } from "../traffic/traffic-info.js";

export interface ArticleSearchQuery {
  readonly keyword?: string;
  readonly authorUid?: string;
}

export interface ForumTaskPlan<TTask> {
  readonly traversal: ForumTraversal;
  readonly tasks: readonly TTask[];
  readonly dedupeKey: (task: TTask) => string;
}

export interface FetchBoardArticlesTask {
  readonly board: BoardNode;
  readonly pageLimit: number;
}

export interface SearchBoardArticlesTask {
  readonly board: BoardNode;
  readonly query: ArticleSearchQuery;
  readonly pageLimit: number;
  readonly itemLimit?: number;
}

export interface FetchBoardTrafficTask {
  readonly board: BoardNode;
}

export interface ForumNodeOptions {
  readonly id: string;
  readonly name: string;
  readonly ename?: string | null;
  readonly depth: number;
  readonly managers?: readonly UserRef[];
  readonly traffic?: TrafficInfo | null;
  readonly trafficUpdatedAt?: string | null;
  readonly parentSectionId?: string | null;
}

/**
 * Forum 树的公共领域节点。
 *
 * 节点只负责树语义和任务规划，不直接发 HTTP，也不创建异步工作池。
 * Controller/Application 层使用这些计划决定并发度并调用对应 View。
 */
export abstract class ForumNode {
  readonly id: string;
  readonly type: ForumNodeType;
  name: string;
  ename: string | null;
  readonly depth: number;
  traffic: TrafficInfo | null;
  trafficUpdatedAt: string | null;
  managers: UserRef[];
  /** 直接父分区 ID（版块叶子用于流量按分区归组；root 为 null）。 */
  readonly parentSectionId: string | null;

  protected constructor(type: ForumNodeType, options: ForumNodeOptions) {
    this.type = type;
    this.id = options.id;
    this.name = options.name;
    this.ename = options.ename ?? null;
    this.depth = options.depth;
    this.traffic = options.traffic ?? null;
    this.trafficUpdatedAt = options.trafficUpdatedAt ?? null;
    this.managers = [...(options.managers ?? [])];
    this.parentSectionId = options.parentSectionId ?? null;
  }

  /** 建树阶段专用：为尚缺父分区的版块叶子补充直接父分区 ID（仅内部/树构建调用）。 */
  assignParentSectionId(sectionId: string): void {
    if (this.type === "board" && this.parentSectionId === null) {
      (this as { parentSectionId: string | null }).parentSectionId = sectionId;
    }
  }

  abstract children(): readonly ForumNode[];

  /** 当前已加载的流量；真实抓取任务由 createTrafficPlan 生成。 */
  getTraffic(): TrafficInfo | null {
    return this.traffic;
  }

  updateTraffic(traffic: TrafficInfo | null, updatedAt = new Date().toISOString()): void {
    this.traffic = traffic;
    this.trafficUpdatedAt = traffic ? updatedAt : null;
  }

  /** 按指定遍历顺序收集当前节点下的全部 BoardNode。 */
  collectBoards(order: ForumTraversal = "dfs"): BoardNode[] {
    const adapter = { childrenOf: (node: ForumNode): readonly ForumNode[] => node.children() };
    const roots: ForumNode[] = [this];
    const nodes = order === "dfs" ? dfs(roots, adapter) : bfs(roots, adapter);
    return nodes.filter((node): node is BoardNode => node.type === "board");
  }

  private selectBoards(order: ForumTraversal, allowedEnames?: readonly string[]): BoardNode[] {
    const boards = this.collectBoards(order);
    if (!allowedEnames) return boards;
    const allowed = new Set(allowedEnames);
    return boards.filter((board) => allowed.has(board.ename));
  }

  createTrafficPlan(options: {
    traversal?: ForumTraversal;
    boardEnames?: readonly string[];
  } = {}): ForumTaskPlan<FetchBoardTrafficTask> {
    const traversal = options.traversal ?? "dfs";
    const tasks = this.selectBoards(traversal, options.boardEnames).map((board) => ({ board }));
    return {
      traversal,
      tasks,
      dedupeKey: (task) => task.board.ename,
    };
  }

  createFetchArticlesPlan(options: {
    traversal?: ForumTraversal;
    pageLimit?: number;
    boardEnames?: readonly string[];
  } = {}): ForumTaskPlan<FetchBoardArticlesTask> {
    const traversal = options.traversal ?? "dfs";
    const pageLimit = options.pageLimit ?? 1;
    if (!Number.isInteger(pageLimit) || pageLimit < 1) {
      throw new Error(`pageLimit 必须是正整数，收到 ${pageLimit}`);
    }
    const tasks = this.selectBoards(traversal, options.boardEnames).map((board) => ({ board, pageLimit }));
    return {
      traversal,
      tasks,
      dedupeKey: (task) => task.board.ename,
    };
  }

  createSearchArticlesPlan(
    query: ArticleSearchQuery,
    options: {
      traversal?: ForumTraversal;
      pageLimit?: number;
      itemLimit?: number;
      boardEnames?: readonly string[];
    } = {},
  ): ForumTaskPlan<SearchBoardArticlesTask> {
    const keyword = query.keyword?.trim();
    const authorUid = query.authorUid?.trim();
    if (!keyword && !authorUid) {
      throw new Error("搜索至少需要 keyword 或 authorUid 之一");
    }

    const traversal = options.traversal ?? "dfs";
    const pageLimit = options.pageLimit ?? 1;
    if (!Number.isInteger(pageLimit) || pageLimit < 1) {
      throw new Error(`pageLimit 必须是正整数，收到 ${pageLimit}`);
    }
    if (options.itemLimit !== undefined && (!Number.isInteger(options.itemLimit) || options.itemLimit < 1)) {
      throw new Error(`itemLimit 必须是正整数，收到 ${options.itemLimit}`);
    }

    const normalizedQuery: ArticleSearchQuery = {
      ...(keyword ? { keyword } : {}),
      ...(authorUid ? { authorUid } : {}),
    };
    const tasks = this.selectBoards(traversal, options.boardEnames).map((board) => ({
      board,
      query: normalizedQuery,
      pageLimit,
      ...(options.itemLimit === undefined ? {} : { itemLimit: options.itemLimit }),
    }));
    return {
      traversal,
      tasks,
      dedupeKey: (task) => task.board.ename,
    };
  }

  /** 由子节点重新计算 section/root 的版主集合。 */
  refreshManagersFromChildren(): void {
    const refs = new Map<string, UserRef>();
    for (const child of this.children()) {
      for (const manager of child.managers) refs.set(manager.uid, manager);
    }
    if (this.type !== "board") this.managers = [...refs.values()];
  }

  /** 后序刷新整棵子树的 managers。 */
  refreshDerivedState(): void {
    for (const child of this.children()) child.refreshDerivedState();
    this.refreshManagersFromChildren();
  }

  /** 以当前叶节点 traffic 重新计算 section/root 的派生流量。 */
  refreshTrafficFromChildren(): void {
    refreshTraffic(this);
  }
}
