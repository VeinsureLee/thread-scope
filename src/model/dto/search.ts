import type { ArticleRow } from "./article.js";
import type { Post } from "./content.js";
import type { Thread } from "../thread/thread.js";

/** 单条命中文章（列表级元数据，不抓正文） */
export interface SearchResult {
  /** 命中文章行（复用列表解析，含标题/url/作者/日期/回复数） */
  row: ArticleRow;
  /** 命中所属版面英文名（全站递归时与 row.boardEname 一致） */
  boardEname: string;
}

/** 按版分组后的搜索结果组（供 articles/threads 返回结构复用）。 */
export interface SearchBoardGroup<T> {
  readonly boardEname: string;
  readonly count: number;
  readonly items: readonly T[];
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
  /** 新领域 Thread；firstPost/replies 暂时保留，供持久化兼容。 */
  thread?: Thread;
}
