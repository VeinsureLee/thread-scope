import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { fetchStructure } from "../../../application/use-case/structure/fetch-structure.js";
import { presentStructure } from "../../presenter/structure.js";
import { registerLoggedTool } from "../with-logging.js";

export function registerFetchStructureTool(server: McpServer): void {
  registerLoggedTool(
    server,
    "forum-fetch-structure",
    {
      title: "结构 · 获取论坛结构",
      description: "分类: 结构。读取论坛分区/版块树（含版主名单）。默认读缓存秒回；refresh=true 强制联网重爬；parentId 只展开直接子节点。前置: 读缓存无需登录；refresh/parentId 需 forum-login。关联: 树中版块 ename/分区 id/分区·版块中文名 可作为 forum-search-articles / forum-search-threads / forum-fetch-board-articles / forum-fetch-traffic 的 boards/nodeId 参数。返回: 树状节点（分区/版块层级）。",
      inputSchema: z.object({
        parentId: z.string().optional().describe("只展开该分区的直接子节点（分区 id，如 sec-0）；不传返回整棵树"),
        refresh: z.boolean().optional().describe("是否强制联网刷新（默认读本地缓存，秒回无需登录）"),
      }),
    },
    async ({ parentId, refresh }) => {
      const result = await fetchStructure({ parentId, refresh });
      const presentation = presentStructure({
        kind: result.kind,
        nodes: result.nodes,
        ...(result.kind === "tree" ? { cached: result.cached } : {}),
      });
      return {
        content: [
          { type: "text", text: presentation.text },
          { type: "text", text: JSON.stringify(presentation.data, null, 2) },
        ],
      };
    },
  );
}
