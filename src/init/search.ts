import { requireLogin } from "../auth/auth.js";
import type { SearchThreadHit } from "../models/index.js";
import { fetchThreadDetail } from "../crawl/content/index.js";
import { articleIdFromUrl, boardFromArticleUrl } from "../crawl/article/index.js";
import { searchBoardArticles, resolveScope, type SearchScope } from "../crawl/search/index.js";
import { mapWithConcurrency, poolValues } from "../crawl/common/async-pool.js";
import { DEFAULT_CONCURRENCY } from "../core/config.js";
import { fetchForumTree } from "../crawl/structure/index.js";
import type { SearchRepository } from "../crawl/search/index.js";
import type { ThreadRepository } from "../crawl/content/index.js";

/**
 * 搜索命中的帖子（正文级：首帖 + 全部评论）。
 *
 * 组合（docs/03 §2.3 #3 — forum-search-threads）：先在搜索范围（单版面/分区/全站）
 * 内搜出候选文章，再对每个候选抓取正文。跨领域协作（search + content）走 init/
 * （docs/03 §5 边界原则 #4）。
 *
 * @param nodeId  版块英文名 / 分区节点 ID；不传则按 scope 缺省规则（同 search-articles）
 * @param keyword 搜索关键字
 * @param opts    { author?, maxPages?, maxItems?, maxBoards?, maxThreads?, maxThreadPages?, topCount? }
 * @param repos   数据访问注入（测试可传 fake；默认 HTTP）
 */
export async function searchThreads(
  nodeId: string | undefined,
  keyword: string,
  opts: {
    author?: string;
    maxPages?: number;
    maxItems?: number;
    maxBoards?: number;
    /** 最多抓取正文的文章数（默认 20，防止全站搜索时正文请求过多） */
    maxThreads?: number;
    /** 每篇文章楼层的最大页数（默认 5） */
    maxThreadPages?: number;
    /** 默认范围（未传 nodeId 且未传 maxBoards）时搜的流量前 N 版，默认 5 */
    topCount?: number;
    /** 正文抓取并发度（默认 DEFAULT_CONCURRENCY，见 http.yaml） */
    concurrency?: number;
    /** 测试注入：论坛树（默认从 structure-overview.json 缓存或爬取） */
    tree?: import("../models/index.js").ForumTreeNode[];
  } = {},
  repos: {
    searchRepo?: SearchRepository;
    threadRepo?: ThreadRepository;
  } = {},
): Promise<{ scope: SearchScope; hits: SearchThreadHit[] }> {
  requireLogin();

  const tree = opts.tree ?? (await fetchForumTree());
  const scope = resolveScope(nodeId, tree, opts.topCount ?? 5, opts.maxBoards);

  // 逐版面搜索（scope.boards 已由 resolveScope 确定；避免 searchAllBoards 重复抓树）
  // 版面之间独立 → 工作池并发（与 searchBoards 一致，仅注入了 tree）
  const boardResults = await mapWithConcurrency(
    scope.boards,
    opts.concurrency ?? DEFAULT_CONCURRENCY,
    async (ename) => searchBoardArticles(ename, keyword, opts, repos.searchRepo),
  );

  const hits: Array<{ row: import("../models/index.js").ArticleRow; boardEname: string }> = [];
  for (const r of boardResults) {
    if (r.error !== undefined) continue; // 版面搜索失败不影响其他（沿用 traffic 的错误隔离策略）
    hits.push(...(r.value ?? []));
  }

  const maxThreads = opts.maxThreads ?? 20;
  const limited = hits.slice(0, maxThreads);

  // 正文抓取：命中之间独立 → 工作池并发；完成按命中原顺序聚合
  const threadResults = await mapWithConcurrency(
    limited,
    opts.concurrency ?? DEFAULT_CONCURRENCY,
    async (hit) => {
      const url = hit.row.url;
      const board = boardFromArticleUrl(url);
      const articleId = articleIdFromUrl(url);
      if (!board || !articleId) {
        throw new Error(`无法从 URL 解析版面/文章ID: ${url}`);
      }
      const detail = await fetchThreadDetail(
        board,
        articleId,
        { maxPages: opts.maxThreadPages },
        repos.threadRepo,
      );
      return {
        boardEname: board,
        articleId,
        title: detail.title || hit.row.title,
        url,
        firstPost: detail.firstPost,
        replies: detail.replies,
      } satisfies SearchThreadHit;
    },
  );

  // 保序：poolValues 已按 original order；失败项跳过
  return { scope, hits: poolValues(threadResults) };
}
