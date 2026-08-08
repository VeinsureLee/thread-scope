import { selectors } from "../../core/config.js";
import { PageFetcher, defaultPageFetcher } from "../common/page-fetcher.js";

/**
 * 版面内搜索数据访问接口（docs/01 §2.1 — Repository 注入模式）。
 * service 只依赖接口，测试可注入 fake。
 */
export interface SearchRepository {
  /** 构造搜索首页路径（/s/article?b=...&t1=...，含编码） */
  searchUrl(opts: {
    boardEname?: string;
    keyword: string;
    author?: string;
  }): string;
  /** 抓取指定路径的 HTML（含翻页路径） */
  fetch(path: string): Promise<string>;
}

/**
 * 基于 HTTP 的默认实现。
 *
 * 翻页（docs/04 §1.2 已验收）：页面 href 为已编码相对路径（含 _uid 与 &amp;→&），
 * 解析出 ?p={n} 后整体交给 fetch；p 参数加在原查询串【末尾】。
 * 注意编码：URL 组件用 encodeURIComponent（空格→%20，中文→UTF-8）；% 已编码字符原样保留。
 */
export class HttpSearchRepository implements SearchRepository {
  constructor(private fetcher: PageFetcher = defaultPageFetcher) {}

  searchUrl(opts: { boardEname?: string; keyword: string; author?: string }): string {
    // 手动拼接：encodeURIComponent 中文→UTF-8 百分号编码、空格→%20，
    // 与浏览器表单提交一致（URLSearchParams 会把空格编码为 +，论坛不认）。
    //
    // 关键 1：au 参数【必须存在】（即使为空）。实测（2026-08-07）BYR 的 /s/article
    // 缺 au 时返回"没有搜索到任何主题"（0 结果），带空 au= 才能命中。
    //
    // 关键 2：按作者搜索【可不传关键字】。实测（2026-08-07）`?b={board}&au={uid}`
    // （无 t1）正常返回该作者帖子；仅 au 无 b 报错。故有 author 且无 keyword 时省略 t1。
    const params: string[] = [];
    if (opts.boardEname) params.push(`b=${encodeURIComponent(opts.boardEname)}`);
    // 有关键字才拼 t1；按作者搜索（author 无 keyword）省略
    if (opts.keyword) params.push(`t1=${encodeURIComponent(opts.keyword)}`);
    params.push(`au=${opts.author ? encodeURIComponent(opts.author) : ""}`);
    return `${selectors.search.path}?${params.join("&")}`;
  }

  fetch(path: string): Promise<string> {
    return this.fetcher.fetch(path);
  }
}
