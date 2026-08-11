import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { initForum } from "../../../application/use-case/init/init-forum.js";
import { presentInit } from "../../presenter/init.js";
import { DEFAULT_CONCURRENCY, MAX_CONCURRENCY } from "../../../core/config.js";
import { registerLoggedTool } from "../with-logging.js";

export function registerInitTool(server: McpServer): void {
  registerLoggedTool(
    server,
    "forum-init",
    {
      title: "初始化 · 初始化论坛数据",
      description: "分类: 初始化。爬取论坛数据并落库,三个阶段按参数动态组合:结构(分区/版块/版主名单树→JSON缓存)、版主(资料+特殊头衔→content.db)、首页文章(各版首页→content.db)。默认只做结构+版主(轻量,不超时);需抓首页文章时传 withArticles=true。前置: forum-login。关联: 初始化后可 forum-fetch-structure 读树、forum-fetch-traffic 采流量、forum-search-* 搜索。返回: 各阶段计数与失败列表。",
      inputSchema: z.object({
        withStructure: z.boolean().default(true).describe("是否爬取并缓存结构树(分区/版块/版主名单;默认 true)"),
        withManagers: z.boolean().default(true).describe("是否收集版主用户资料与特殊头衔并落库(默认 true)"),
        withArticles: z.boolean().default(false).describe("是否抓取各版块首页文章落库(286 版 ≈ 286 次请求,约 1 分钟,最重;默认 false 保持轻量)"),
        concurrency: z.number().int().positive().max(MAX_CONCURRENCY).default(DEFAULT_CONCURRENCY).describe(`并发度(默认 ${DEFAULT_CONCURRENCY},上限 ${MAX_CONCURRENCY})`),
      }),
    },
    async ({ withStructure, withManagers, withArticles, concurrency }) => {
      const result = await initForum(undefined, undefined, { withStructure, withManagers, withArticles, concurrency });
      return { content: [{ type: "text", text: presentInit(result) }] };
    },
  );
}
