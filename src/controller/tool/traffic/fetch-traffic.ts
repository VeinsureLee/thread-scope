import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DEFAULT_CONCURRENCY, MAX_CONCURRENCY } from "../../../core/config.js";
import { fetchTrafficUseCase } from "../../../application/use-case/traffic/fetch-traffic-impl.js";
import { presentTraffic } from "../../presenter/traffic.js";
import { registerLoggedTool } from "../with-logging.js";

export function registerFetchTrafficTool(server: McpServer): void {
  registerLoggedTool(
    server,
    "forum-fetch-traffic",
    {
      title: "流量 · 获取版面流量",
      description: "分类: 流量。获取指定节点（全站/分区/单版）实时流量并返回树状聚合。用途: 发现高流量版面——当关键字搜索命中率低时，先看哪些版面活跃/相关，再用 forum-search-articles / forum-search-threads 的 boards 参数定向搜索这些版面，或 forum-fetch-board-articles 直接浏览。前置: forum-login。返回: 树状流量（版块 在线/今日帖/主题/文章数，分区为后代聚合）。",
      inputSchema: z.object({
        nodeId: z.string().optional().describe("目标节点：省略=全站；分区 id（如 sec-0）采集该分区；版块 ename（如 Demo）或分区/版块中文名采集单版/该分区"),
        concurrency: z.number().int().positive().max(MAX_CONCURRENCY).default(DEFAULT_CONCURRENCY).describe(`并发度（默认 ${DEFAULT_CONCURRENCY}，上限 ${MAX_CONCURRENCY}）`),
      }),
    },
    async ({ nodeId, concurrency }) => {
      const result = await fetchTrafficUseCase(nodeId, { concurrency });
      const presentation = presentTraffic({ ...result, nodeId });
      return {
        content: [
          { type: "text", text: presentation.text },
          { type: "text", text: JSON.stringify(presentation.data, null, 2) },
        ],
      };
    },
  );
}
