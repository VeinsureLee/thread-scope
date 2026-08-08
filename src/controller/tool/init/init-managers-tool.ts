import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { initManagers } from "../../../application/use-case/init/init-forum.js";
import { presentInitManagers } from "../../presenter/init.js";
import { DEFAULT_CONCURRENCY, MAX_CONCURRENCY } from "../../../core/config.js";
import { registerLoggedTool } from "../with-logging.js";

export function registerInitManagersTool(server: McpServer): void {
  registerLoggedTool(
    server,
    "forum-init-managers",
    {
      title: "初始化 · 初始化论坛版主",
      description: "分类: 初始化。从结构树收集版主 uid，并发抓取用户资料与特殊头衔并落库（is_manager 标记）。需要先执行 forum-login。",
      inputSchema: z.object({
        concurrency: z.number().int().positive().max(MAX_CONCURRENCY).default(DEFAULT_CONCURRENCY).describe(`并发度（默认 ${DEFAULT_CONCURRENCY}，上限 ${MAX_CONCURRENCY}）`),
      }),
    },
    async ({ concurrency }) => {
      const result = await initManagers({ concurrency });
      return { content: [{ type: "text", text: presentInitManagers(result) }] };
    },
  );
}
