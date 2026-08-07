import { routes, fillRoute } from "../../core/config.js";
import { PageFetcher, defaultPageFetcher } from "../common/page-fetcher.js";

/**
 * 帖子详情数据访问接口（docs/01 §2.1 — Repository 注入模式）。
 */
export interface ThreadRepository {
  /** 构造帖子详情首屏路径（/article/{board}/{id}，无 ?p 即第 1 页） */
  threadUrl(boardName: string, articleId: string): string;
  /** 抓取指定路径 HTML（含翻页路径，如 /article/Demo/1001?p=2） */
  fetch(path: string): Promise<string>;
}

/** 基于 HTTP 的默认实现 */
export class HttpThreadRepository implements ThreadRepository {
  constructor(private fetcher: PageFetcher = defaultPageFetcher) {}

  threadUrl(boardName: string, articleId: string): string {
    return fillRoute(routes.thread_detail, { board: boardName, id: articleId });
  }

  fetch(path: string): Promise<string> {
    return this.fetcher.fetch(path);
  }
}
