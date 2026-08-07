/**
 * 搜索（search）— 版面内搜索产出的候选与快照。
 *
 * 对应 data/search-results.json（docs/03 §2.3 #3 — JSON snapshot，与流量同逻辑：
 * append-only，每次搜索追加一条记录，便于日后整体入库 / 搜索历史分析）。
 */
import type { ArticleRow } from "./article.js";
import type { Post } from "./content.js";

/** 单条命中文章（列表级元数据，不抓正文） */
export interface SearchResult {
  /** 命中文章行（复用列表解析，含标题/url/作者/日期/回复数） */
  row: ArticleRow;
  /** 命中所属版面英文名（全站递归时与 row.boardEname 一致） */
  boardEname: string;
}

/** 单条命中的帖子（正文级：首帖+评论，供 forum-search-threads） */
export interface SearchThreadHit {
  boardEname: string;
  articleId: string;
  title: string;
  url: string;
  /** 命中关键词的首帖正文 */
  firstPost: Post;
  /** 全文评论（跨页翻页后的全部楼层） */
  replies: Post[];
}

/** 一次搜索产出的 JSON snapshot 记录（append-only） */
export interface SearchSnapshot {
  /** 采样时间（ISO） */
  crawledAt: string;
  /** 搜索关键字 */
  keyword: string;
  /** 搜索范围标签：版块名 / 分区名 / "流量前N版" / "全站" */
  scope: string;
  /** 单版面搜索时为版面 ename；分区/全站/流量前N 为 null */
  boardEname: string | null;
  /** 可选作者过滤（未传为 null） */
  author: string | null;
  /** 本次命中的文章数 */
  hitCount: number;
  /** 本次命中的文章（仅候选元数据；searchThreads 另含正文） */
  hits: SearchResult[];
}
