import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { requireLogin } from "../auth/auth.js";
import {
  fetchForumTree,
  fetchNodeChildren,
} from "../crawl/structure/index.js";

/**
 * 注册论坛结构爬取工具。
 * 不传参数时返回完整树状结构；传 parentId 时仅返回该节点下的子节点。
 */
export function registerFetchStructureTool(server: McpServer): void {
  server.registerTool(
    "forum-fetch-structure",
    {
      title: "结构 · 获取论坛结构",
      description:
        "分类: 结构。获取论坛完整分区/版块树状结构。不传参数时获取全站结构（含多级分区、版块）；传入 parentId 时仅获取该节点下的子节点。需要先执行 forum-login。",
      inputSchema: z.object({
        parentId: z
          .string()
          .optional()
          .describe(
            "可选，父节点 ID。不填则获取全站结构树",
          ),
      }),
    },
    async ({ parentId }) => {
      requireLogin();

      if (parentId) {
        const children = await fetchNodeChildren(parentId);
        return {
          content: [
            { type: "text", text: JSON.stringify(children, null, 2) },
          ],
        };
      }

      const tree = await fetchForumTree();
      return {
        content: [
          { type: "text", text: JSON.stringify(tree, null, 2) },
        ],
      };
    },
  );
}
