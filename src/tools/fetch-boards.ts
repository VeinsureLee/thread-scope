import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { requireLogin } from "../auth/auth.js";
import { fetchBoardsInSection } from "../crawl/forum.js";

/** 注册获取分区版块列表工具 */
export function registerFetchBoardsTool(server: McpServer): void {
  server.registerTool(
    "forum-fetch-boards",
    {
      title: "获取版块列表",
      description: "获取指定分区下的所有版块。需要先执行 forum-login。",
      inputSchema: z.object({
        sectionId: z
          .string()
          .min(1)
          .describe("分区 ID"),
      }),
    },
    async ({ sectionId }) => {
      requireLogin();
      const boards = await fetchBoardsInSection(sectionId);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(boards, null, 2),
          },
        ],
      };
    },
  );
}
