import { load } from "cheerio";
import { requireLogin } from "../../auth/auth.js";
import type { ForumTreeNode, SearchResult } from "../../models/index.js";
import { paginate, parsePagination } from "../common/paginator.js";
import { mapWithConcurrency, poolValues } from "../common/async-pool.js";
import { DEFAULT_CONCURRENCY } from "../../core/config.js";
import { logWarn } from "../../logging/logger.js";
import { fetchForumTree } from "../structure/index.js";
import { TrafficDb } from "../../storage/traffic-db.js";
import { SearchRepository, HttpSearchRepository } from "./repository.js";
import { parseSearchResults } from "./parser.js";

/**
 * 在单个版面内搜索文章（含翻页）。
 *
 * 能力（docs/03 §2.3 #3 — 定位选 A，只返回候选，不抓正文）：
 * - 版面内搜索：/s/article?b={board}&t1={keyword}&au={author}
 * - 翻页由 paginator 统一驱动（?p={n}，docs/04 §1.2 已确认搜索翻页参数）
 * - 列表页【只看不写】：返回候选行，落库/快照由调用方（工具层）决定
 *
 * @param boardEname 版块英文名（如 Demo）
 * @param keyword    搜索关键字
 * @param opts       { author?, maxPages?, maxItems? } — 作者过滤与数量上限
 * @param repo       数据访问实现（默认 HTTP，测试可注入 fake）
 * @returns 命中文章行列表（已跨页去重）
 */
export async function searchBoardArticles(
  boardEname: string,
  keyword: string,
  opts: { author?: string; maxPages?: number; maxItems?: number } = {},
  repo: SearchRepository = new HttpSearchRepository(),
): Promise<SearchResult[]> {
  requireLogin();

  const startPath = repo.searchUrl({ boardEname, keyword, author: opts.author });

  const rows = await paginate<SearchResult>(
    startPath,
    async (path) => {
      const html = await repo.fetch(path);
      const page = parsePagination(load(html));
      const items = parseSearchResults(boardEname, html).map((row) => ({
        row,
        boardEname,
      }));
      // 下一页：分页控件里的 nextHref（已是完整相对路径，含 ?p=n）
      return { items, nextHref: page?.nextHref ?? null };
    },
    { maxPages: opts.maxPages ?? 1, maxItems: opts.maxItems },
  );

  // 跨页去重（翻页边界最后一条/下页第一条可能重复）
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.row.url)) return false;
    seen.add(r.row.url);
    return true;
  });
}

/**
 * 在指定版块列表内搜索（各版面独立，结果聚合）。
 *
 * 并发化（docs/05 搜索并发设计）：版面之间完全独立，用工作池并发，
 * 同时最多 concurrency 个版面搜索在途；完成后按原版面顺序聚合。
 * 请求频率仍由 PageFetcher 令牌队列统一兜底。
 *
 * @param boardEnames  版块英文名列表
 * @param concurrency  并发度（默认 DEFAULT_CONCURRENCY，见 http.yaml）
 * @param repo         数据访问实现（默认 HTTP，测试可注入 fake）
 */
export async function searchBoards(
  boardEnames: string[],
  keyword: string,
  opts: { author?: string; maxPages?: number; maxItems?: number },
  concurrency: number = DEFAULT_CONCURRENCY,
  repo: SearchRepository = new HttpSearchRepository(),
): Promise<SearchResult[]> {
  const results = await mapWithConcurrency(
    boardEnames,
    concurrency,
    async (ename) => searchBoardArticles(ename, keyword, opts, repo),
  );

  const errors = results
    .filter((r) => r.error !== undefined)
    .map((r) => `版面 [${boardEnames[r.index]!}] 搜索失败: ${String(r.error)}`);
  if (errors.length > 0) {
    logWarn("crawl", { message: "部分版面搜索失败", boards: errors }, "crawler.search");
  }

  return poolValues(results).flat();
}

/** 从论坛树收集全部版块英文名 */
function collectBoardEnames(tree: ForumTreeNode[]): string[] {
  const boards: string[] = [];
  function walk(nodes: ForumTreeNode[]): void {
    for (const n of nodes) {
      if (n.type === "board") boards.push(n.board.ename);
      else walk(n.children);
    }
  }
  walk(tree);
  return boards;
}

/** 从论坛树按节点 ID 收集其下所有版块（分区递归）；未找到返回 null */
function collectBoardsUnder(tree: ForumTreeNode[], nodeId: string): string[] | null {
  const clean = nodeId.replace(/[()]/g, "").replace(/^board-/, "").replace(/^sec-/, "");
  for (const node of tree) {
    if (
      node.id === nodeId ||
      node.id === clean ||
      node.id === `board-${clean}` ||
      node.id === `sec-${clean}` ||
      (node.type === "board" && node.board.ename === clean)
    ) {
      if (node.type === "board") return [node.board.ename];
      const enames: string[] = [];
      const gather = (ns: ForumTreeNode[]): void => {
        for (const n of ns) {
          if (n.type === "board") enames.push(n.board.ename);
          else gather(n.children);
        }
      };
      gather(node.children);
      return enames;
    }
    if (node.type === "section") {
      const sub = collectBoardsUnder(node.children, nodeId);
      if (sub) return sub;
    }
  }
  return null;
}

/**
 * 流量最高的前 N 个版块英文名。
 * 数据来自 traffic_snapshot 表每版面最新一行；无流量数据时回退到结构树前 N 个。
 */
function topTrafficBoards(tree: ForumTreeNode[], n: number): { enames: string[]; source: "traffic" | "tree" } {
  try {
    const db = new TrafficDb();
    try {
      const latest = db.getLatestAll();
      if (latest.length > 0) {
        const sorted = [...latest].sort(
          (a, b) =>
            parseInt(b.onlineUsers, 10) - parseInt(a.onlineUsers, 10) ||
            parseInt(b.todayPosts, 10) - parseInt(a.todayPosts, 10),
        );
        const enames = sorted.slice(0, n).map((t) => t.ename).filter(Boolean);
        if (enames.length > 0) return { enames, source: "traffic" };
      }
    } finally {
      db.close();
    }
  } catch {
    // 流量库缺失/损坏 → 回退结构树
  }
  return { enames: collectBoardEnames(tree).slice(0, n), source: "tree" };
}

/**
 * 全站递归搜索：遍历论坛树，对每个版块执行版面搜索。
 *
 * 注意（2026-08-07 实测）：BYR /s/article 不支持无 b 参数的全站搜索，
 * 只能逐版面搜索。论坛约 286 个版块，全站搜索约需 3 分钟，请工具层注明耗时。
 *
 * @param keyword 搜索关键字
 * @param opts    { author?, maxPagesPerBoard?, maxItemsPerBoard?, maxBoards? }
 * @param repo    数据访问实现（默认 HTTP）
 * @returns 全站命中（跨版块聚合，已按版面排序）
 */
export async function searchAllBoards(
  keyword: string,
  opts: {
    author?: string;
    maxPagesPerBoard?: number;
    maxItemsPerBoard?: number;
    maxBoards?: number;
    /** 并发度（默认 DEFAULT_CONCURRENCY） */
    concurrency?: number;
  } = {},
  repo: SearchRepository = new HttpSearchRepository(),
): Promise<SearchResult[]> {
  requireLogin();

  const tree = await fetchForumTree();
  const allBoards = collectBoardEnames(tree);
  const maxBoards = opts.maxBoards ?? Number.POSITIVE_INFINITY;
  const limited = allBoards.slice(0, maxBoards);

  return searchBoards(
    limited,
    keyword,
    { author: opts.author, maxPages: opts.maxPagesPerBoard, maxItems: opts.maxItemsPerBoard },
    opts.concurrency,
    repo,
  );
}
/** 搜索范围描述（快照记录 / 工具输出用） */
export type SearchScope =
  | { kind: "board"; boardEname: string; boards: string[]; label: string }
  | { kind: "top"; boardEname: null; boards: string[]; label: string; source: "traffic" | "tree" }
  | { kind: "section"; boardEname: null; boards: string[]; label: string }
  | { kind: "all"; boardEname: null; boards: string[]; label: string };

/** 解析搜索范围：版块名 / 节点 ID / 全站 */
export function resolveScope(
  nodeId: string | undefined,
  tree: ForumTreeNode[],
  topCount: number,
  maxBoards: number | undefined,
): SearchScope {
  // 单版面/分区：nodeId 命中（版块 → 单版面；分区 → 递归其下版块）
  if (nodeId) {
    const matched = collectBoardsUnder(tree, nodeId);
    if (matched) {
      if (matched.length === 1) {
        return {
          kind: "board" as const,
          boardEname: matched[0]!,
          boards: matched,
          label: matched[0]!,
        };
      }
      return {
        kind: "section" as const,
        boardEname: null,
        boards: matched,
        label: nodeId,
      };
    }
    throw new Error(
      `节点不存在: ${nodeId}。可传版块英文名（如 Demo）或分区节点 ID（如 sec-0）。`,
    );
  }

  // 显式全站：传 maxBoards（或不传 topCount 且要求全量）→ 全站搜索（用时长）
  if (maxBoards !== undefined) {
    const all = collectBoardEnames(tree);
    return {
      kind: "all" as const,
      boardEname: null,
      boards: maxBoards >= all.length ? all : all.slice(0, maxBoards),
      label: maxBoards >= all.length ? "全站" : `全站前${maxBoards}版`,
    };
  }

  // 默认：流量最高的前 topCount 个版面（数据不足时回退）
  const { enames, source } = topTrafficBoards(tree, topCount);
  return {
    kind: "top" as const,
    boardEname: null,
    boards: enames,
    label: `流量前${enames.length}版`,
    source,
  };
}
