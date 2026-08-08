import type { McpServer } from "@modelcontextprotocol/server";
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
      title: "流量 · 获取版面/分区流量",
      description: "分类: 流量。获取目标节点下版块流量并返回树状结果；不传 nodeId 时采集全站。",
      inputSchema: z.object({
        nodeId: z.string().optional(),
        concurrency: z.number().int().positive().max(MAX_CONCURRENCY).default(DEFAULT_CONCURRENCY),
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
