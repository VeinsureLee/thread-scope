import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { initForum } from "../init/init.js";

/** 注册论坛初始化工具 */
export function registerInitTool(server: McpServer): void {
  server.registerTool(
    "forum-init",
    {
      title: "初始化论坛数据",
      description:
        "一键爬取论坛全站结构、各版块首页文章并保存到本地。需要先执行 forum-login。",
      inputSchema: z.object({}),
    },
    async () => {
      const result = await initForum();
      const lines = [
        `分区: ${result.sections}`,
        `版块: ${result.boards}`,
        `文章: ${result.articles}`,
      ];
      if (result.errors.length > 0) {
        lines.push(`失败: ${result.errors.length} 个`);
        for (const err of result.errors) {
          lines.push(`  ⚠ ${err}`);
        }
      }
      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    },
  );
}
