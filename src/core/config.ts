import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { load as yamlLoad } from "js-yaml";

// ============================================================
// .env 凭证（仅账号密码）
// ============================================================

dotenv.config();

export const secrets = {
  userId: process.env.USER_ID || "",
  userPassword: process.env.USER_PASSWORD || "",
} as const;

// ============================================================
// YAML 配置加载
// ============================================================

const CONFIG_ROOT = path.resolve(process.cwd(), "config");

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
  user_query: string;
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
    threads: string;
    posts: string;
  };
  board_stats: {
    online_users: string;
    today_posts: string;
  };
  article_list: {
    row_selector: string;
    title_normal: string;
    title_pinned: string;
    author_link: string;
    date_regex: string;
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
}

export const http = loadYaml<HttpConfig>("rules/http.yaml");

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
