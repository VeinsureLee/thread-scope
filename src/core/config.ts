import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { load as yamlLoad } from "js-yaml";
import { fromRoot } from "./paths.js";

// ============================================================
// .env 凭证（仅账号密码）
// ============================================================
// 显式从项目根读取 .env（不依赖 cwd：MCP 客户端可能从任意目录启动本进程）

dotenv.config({ quiet: true, path: fromRoot(".env") });

export const secrets = {
  userId: process.env.USER_ID || "",
  userPassword: process.env.USER_PASSWORD || "",
} as const;

// ============================================================
// YAML 配置加载
// ============================================================

const CONFIG_ROOT = fromRoot("config");

function loadYaml<T>(filePath: string): T {
  const fullPath = path.resolve(CONFIG_ROOT, filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`配置文件不存在: ${fullPath}`);
  }
  const content = fs.readFileSync(fullPath, "utf-8");
  return yamlLoad(content) as T;
}

// ============================================================
// 1. 外部视角 — 论坛入口信息
// ============================================================

export interface ForumConfig {
  base_url: string;
  default_path: string;
}

export const forum = loadYaml<ForumConfig>("external/forum.yaml");

// ============================================================
// 2. 通用规则
// ============================================================

/** 路由模板 */
export interface RoutesConfig {
  index: string;
  login: string;
  sections_ajax: string;
  section_detail: string;
  board_articles: string;
  thread_detail: string;
  search_path: string;
  user_query: string;
  user_query_json: string;
  user_tquery_json: string;
  tree_root_param: string;
  tree_recursive_param: string;
  count_param: string;
}

export const routes = loadYaml<RoutesConfig>("rules/routes.yaml");

/** CSS 选择器 */
export interface SelectorsConfig {
  section_ajax: {
    name_regex: string;
    href_regex: string;
    board_href_keyword: string;
    section_href_keyword: string;
  };
  board_list: {
    row_selector: string;
    name: string;
    ename: string;
    manager: string;
    manager_link: string;
    section_indicator: string;
    threads: string;
    posts: string;
  };
  board_stats: {
    online_users: string;
    today_posts: string;
  };
  article_list: {
    row_selector: string;
    title: string;
    threads_tab: string;
    pinned_row: string;
    pinned_icon: string;
    author_cell: string;
    author_link: string;
    date_cell: string;
    last_reply_cell: string;
    reply_count: string;
    title_normal: string;
    title_pinned: string;
    date_regex: string;
  };
  pagination: {
    selector: string;
    total: string;
    current_page: string;
    page_links: string;
    next_link: string;
    page_param: string;
  };
  thread_detail: {
    title: string;
    post_wrap: string;
    post_anchor: string;
    author_name: string;
    author_link: string;
    author_sex_icon: string;
    avatar: string;
    user_info: string;
    post_content: string;
    post_image: string;
    post_pos: string;
  };
  user_profile: {
    wrap: string;
    name: string;
    name_links: string;
    avatar: string;
    base_info: string;
    detail_info: string;
  };
  search: {
    path: string;
    keyword_param: string;
    author_param: string;
    board_param: string;
    essence_param: string;
    attachment_param: string;
    result_table: string;
  };
  anonymous: {
    board: string;
    name_regex: string;
    uid_regex: string;
    hide_icon: string;
    hide_title: string;
    from_anon: string;
  };
}

export const selectors = loadYaml<SelectorsConfig>("rules/selectors.yaml");

/** 登录规则 */
export interface LoginConfig {
  method: string;
  flow: { step: number; action: string; path: string }[];
  form_fields: { name: string; value?: string; type: string }[];
}

export const loginRules = loadYaml<LoginConfig>("rules/login.yaml");

/** HTTP 默认参数 */
export interface HttpConfig {
  headers: Record<string, string>;
  ajax_headers: Record<string, string>;
  timeout_ms: number;
  default_encoding: string;
  /** 两次实际请求的最小间隔（毫秒），全站共享限速队列 */
  request_interval_ms: number;
  /** 异步并发（工作池）配置 */
  concurrency: {
    /** 默认并发度（跨版面搜索 / 正文抓取 / 分区流量） */
    default: number;
    /** 允许用户设置的最大并发度 */
    max: number;
  };
  /** 用户资料配置（docs/06） */
  user: {
    /** 资料 TTL（小时），批量抓取时跳过未过期用户 */
    profile_ttl_hours: number;
  };
}

export const http = loadYaml<HttpConfig>("rules/http.yaml");

/** 默认并发度（工作池 limit） */
export const DEFAULT_CONCURRENCY = http.concurrency.default;
/** 并发度上限（工具参数 zod 校验用） */
export const MAX_CONCURRENCY = http.concurrency.max;
/** 用户资料 TTL（小时，docs/06 §5.3） */
export const USER_PROFILE_TTL_HOURS = http.user.profile_ttl_hours;

// ============================================================
// 3. 通用规则 — 日志
// ============================================================

export interface LogConfig {
  /** 日志文件路径（相对项目根） */
  file: string;
  /** 级别过滤：debug < info < warn < error */
  level: string;
  /** 是否同时在 stderr 输出人类可读多行摘要 */
  to_stderr?: boolean;
  /** 命名空间过滤（glob，如 crawler.*）；空数组 = 记录全部 */
  include_ns?: string[];
}

export const logConfig = loadYaml<LogConfig>("rules/log.yaml");

// ============================================================
// 便捷工具：路由变量替换
// ============================================================

/**
 * 用实际值替换路由模板中的 {xxx} 占位符。
 *
 * 例：fillRoute(routes.section_detail, { sectionId: "123" })
 *     → "/section/123"
 */
export function fillRoute(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");
}
