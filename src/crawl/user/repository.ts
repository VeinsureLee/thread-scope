import { routes, fillRoute } from "../../core/config.js";
import { PageFetcher, defaultPageFetcher } from "../common/page-fetcher.js";
import { ajaxPost } from "../../core/http-client.js";

/**
 * 用户资料数据访问接口（docs/01 §2.1 — Repository 注入模式）。
 * service 只依赖接口，测试可注入 fake。
 */
export interface UserRepository {
  /** 构造单用户资料 JSON 路径（/user/query/{uid}.json） */
  queryUrl(uid: string): string;
  /** 构造特殊头衔批量接口路径（/user/ajax_tquery.json） */
  titlesUrl(): string;
  /** 抓取 GET 路径的原始响应（query.json，GBK 已解码） */
  fetch(path: string): Promise<string>;
  /** 抓取 POST 表单路径的原始响应（tquery，GBK 已解码）；body 为 urlencoded 表单 */
  post(path: string, body: string): Promise<string>;
}

/**
 * 基于 HTTP 的默认实现。
 *
 * - query.json：GET /user/query/{uid}.json（单 uid，需登录）
 * - tquery：POST /user/ajax_tquery.json，body `list[]=uid1&list[]=uid2`（批量，需登录）
 * 两者均走 PageFetcher 限速队列（docs/06 §2.2 / §2.4 已验证）。
 */
export class HttpUserRepository implements UserRepository {
  constructor(private fetcher: PageFetcher = defaultPageFetcher) {}

  queryUrl(uid: string): string {
    return fillRoute(routes.user_query_json, { uid });
  }

  titlesUrl(): string {
    return routes.user_tquery_json;
  }

  fetch(path: string): Promise<string> {
    return this.fetcher.fetch(path);
  }

  post(path: string, body: string): Promise<string> {
    // 真正的 POST：复用 PageFetcher 限速队列，请求函数为 ajaxPost(path, body)
    return this.fetcher.fetch(path, (p) => ajaxPost(p, body));
  }
}
