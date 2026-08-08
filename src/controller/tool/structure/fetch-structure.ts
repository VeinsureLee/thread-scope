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
      description: "分类: 结构。获取论坛分区和版块树；默认读取缓存，refresh=true 时刷新，传 parentId 时只展开直接子节点。",
      inputSchema: z.object({
        parentId: z.string().optional(),
        refresh: z.boolean().optional(),
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
