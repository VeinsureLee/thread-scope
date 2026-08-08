/**
 * 搜索（search）— 版面内搜索产出的候选与命中。
 *
 * 命中结果直接返回给调用方（工具/LLM），或由调用方自行落库/查询，不维护 JSON 快照。
 */
import type { ArticleRow } from "../article/article.js";
import type { Post } from "../content/content.js";
import type { Thread } from "../../model/thread/thread.js";

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
  /** 新领域 Thread；firstPost/replies 暂时保留，供旧工具与持久化兼容。 */
  thread?: Thread;
}
