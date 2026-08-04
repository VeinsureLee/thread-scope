import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { requireLogin } from "../auth/auth.js";
import { fetchSections } from "../crawl/forum.js";

/** 注册获取论坛分区列表工具 */
export function registerFetchSectionsTool(server: McpServer): void {
  server.registerTool(
    "forum-fetch-sections",
    {
      title: "获取分区列表",
      description: "获取论坛首页的所有分区。需要先执行 forum-login。",
      inputSchema: z.object({}),
    },
    async () => {
      requireLogin();
      const sections = await fetchSections();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(sections, null, 2),
          },
        ],
      };
    },
  );
}
