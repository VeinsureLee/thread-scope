import { routes, fillRoute } from "../../core/config.js";
import { PageFetcher, defaultPageFetcher } from "../common/page-fetcher.js";

/**
 * 版块文章列表数据访问接口（docs/01 §2.1 — Repository 注入模式）。
 * service 只依赖接口，测试可注入 fake。
 */
export interface ArticleRepository {
  /** 构造版块首页路径（如 /board/Beauty） */
  boardUrl(boardName: string): string;
  /** 抓取指定路径的 HTML（含翻页路径，如 /board/Beauty?p=2） */
  fetch(path: string): Promise<string>;
}

/**
 * 基于 HTTP 的默认实现。
 * 翻页：/board/{ename}?p={n}（docs/04 §1.3 已确认分页参数）。
 */
export class HttpArticleRepository implements ArticleRepository {
  constructor(private fetcher: PageFetcher = defaultPageFetcher) {}

  boardUrl(boardName: string): string {
    return fillRoute(routes.board_articles, { boardName });
  }

  fetch(path: string): Promise<string> {
    return this.fetcher.fetch(path);
  }
}
