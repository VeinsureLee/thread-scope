import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { requireLogin } from "../../auth/auth.js";
import {
  loadCachedTree,
  fetchForumTree,
  fetchNodeChildren,
} from "../../crawl/structure/index.js";
import { registerLoggedTool } from "../with-logging.js";

/**
 * 注册论坛结构工具。
 *
 * 默认读本地缓存（data/structure-overview.json，秒回、无需登录）；
 * refresh=true 强制联网重新爬取并更新缓存；
 * 传 parentId 时仅返回该节点下的子节点（需联网，需先登录）。
 */
export function registerFetchStructureTool(server: McpServer): void {
  registerLoggedTool(
    server,
    "forum-fetch-structure",
    {
      title: "结构 · 获取论坛结构",
      description:
        "分类: 结构。获取论坛完整分区/版块树状结构。默认读取本地缓存（秒回，无需登录）；传 refresh=true 强制联网重新爬取并更新缓存；传 parentId 时仅返回该节点下的子节点。若未初始化过（无缓存），会自动联网爬取一次。",
      inputSchema: z.object({
        parentId: z
          .string()
          .optional()
          .describe("可选，父节点 ID。传此参数时返回该节点下的直接子节点（需联网）"),
        refresh: z
          .boolean()
          .optional()
          .describe("true = 强制联网重新爬取并更新本地缓存；默认 false（读缓存）"),
      }),
    },
    async ({ parentId, refresh }) => {
      if (parentId) {
        // 子节点展开需实时数据 → 直接联网（需登录）
        requireLogin();
        const children = await fetchNodeChildren(parentId);
        return {
          content: [
            { type: "text", text: JSON.stringify(children, null, 2) },
          ],
        };
      }

      // 无缓存且未强制刷新 → 自动联网爬取一次（等价 refresh）
      const cached = !refresh ? loadCachedTree() : null;
      if (cached) {
        return {
          content: [{ type: "text", text: JSON.stringify(cached, null, 2) }],
        };
      }

      const tree = await fetchForumTree({ refresh: true });
      return {
        content: [
          { type: "text", text: JSON.stringify(tree, null, 2) },
        ],
      };
    },
  );
}
