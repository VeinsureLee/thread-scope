import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { queryTrafficHistory } from "../../../application/use-case/traffic/query-traffic-history.js";
import { presentTrafficHistory } from "../../presenter/traffic-history.js";
import { registerLoggedTool } from "../with-logging.js";

export function registerQueryTrafficHistoryTool(server: McpServer): void {
  registerLoggedTool(
    server,
    "forum-query-traffic-history",
    {
      title: "流量 · 查询版面历史流量",
      description: "分类: 流量。查询指定版面的历史流量采样，可限制时间范围和返回条数。",
      inputSchema: z.object({
        boardEname: z.string().min(1),
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().int().positive().max(1000).optional(),
      }),
    },
    async ({ boardEname, from, to, limit }) => {
      const result = await queryTrafficHistory(boardEname, { from, to, limit });
      const presentation = presentTrafficHistory(result);
      return {
        content: [
          { type: "text", text: presentation.text },
          { type: "text", text: JSON.stringify(presentation.data, null, 2) },
        ],
      };
    },
  );
}
