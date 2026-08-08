import type { McpServer } from "@modelcontextprotocol/server";
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
      title: "初始化 · 一键初始化论坛数据",
      description: "分类: 初始化。爬取全站结构树与版主用户资料/特殊头衔并落库；默认不爬各版首页文章（最重阶段），传 withArticles=true 才抓取。需要先执行 forum-login。",
      inputSchema: z.object({
        withArticles: z.boolean().default(false).describe("是否同时抓取各版块首页文章（286 版 ≈ 286 次请求，约 1 分钟；默认 false 保持轻量）"),
        concurrency: z.number().int().positive().max(MAX_CONCURRENCY).default(DEFAULT_CONCURRENCY).describe(`并发度（默认 ${DEFAULT_CONCURRENCY}，上限 ${MAX_CONCURRENCY}）`),
      }),
    },
    async ({ withArticles, concurrency }) => {
      const result = await initForum(undefined, undefined, { concurrency, withArticles });
      return { content: [{ type: "text", text: presentInit(result) }] };
    },
  );
}
