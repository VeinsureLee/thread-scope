import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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
      description: "分类: 流量。查询指定版面的历史流量采样（本地时序库），可限时间范围与返回条数。前置: 无（读本地库，无需登录）。关联: 先用 forum-fetch-traffic 采集实时流量，本工具查看该版面随时间的变化趋势。返回: 时间序列采样点（在线/今日帖等）。",
      inputSchema: z.object({
        boardEname: z.string().min(1).describe("版块英文名称（如 Demo）"),
        from: z.string().optional().describe("起始日期/时间（可选，ISO 格式）"),
        to: z.string().optional().describe("结束日期/时间（可选，ISO 格式）"),
        limit: z.number().int().positive().max(1000).optional().describe("最多返回采样点数（可选，默认全部）"),
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
