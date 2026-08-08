import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { initBoardArticles } from "../../../application/use-case/init/init-forum.js";
import { presentInitBoardArticles } from "../../presenter/init.js";
import { DEFAULT_CONCURRENCY, MAX_CONCURRENCY } from "../../../core/config.js";
import { registerLoggedTool } from "../with-logging.js";

export function registerInitBoardArticlesTool(server: McpServer): void {
  registerLoggedTool(
    server,
    "forum-init-board-articles",
    {
      title: "初始化 · 初始化论坛首页",
      description: "分类: 初始化。抓取全部版块的首页文章并落库（286 版 ≈ 286 次请求，约 1 分钟）。需要先执行 forum-login。",
      inputSchema: z.object({
        concurrency: z.number().int().positive().max(MAX_CONCURRENCY).default(DEFAULT_CONCURRENCY).describe(`并发度（默认 ${DEFAULT_CONCURRENCY}，上限 ${MAX_CONCURRENCY}）`),
      }),
    },
    async ({ concurrency }) => {
      const result = await initBoardArticles({ concurrency });
      return { content: [{ type: "text", text: presentInitBoardArticles(result) }] };
    },
  );
}
