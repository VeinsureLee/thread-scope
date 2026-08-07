import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { TrafficDb } from "../../storage/traffic-db.js";
import { registerLoggedTool } from "../with-logging.js";

/** 注册历史流量查询工具 */
export function registerQueryTrafficHistoryTool(server: McpServer): void {
  registerLoggedTool(
    server,
    "forum-query-traffic-history",
    {
      title: "流量 · 查询版面历史流量",
      description:
        "分类: 流量。查询指定版面的历史流量采样（在线人数、今日发帖、主题数、文章总数随时间的变化）。可限定时间范围与返回条数。需要先执行过 forum-fetch-traffic 采集数据。",
      inputSchema: z.object({
        boardEname: z.string().min(1).describe("版面英文名，如 Demo"),
        from: z
          .string()
          .optional()
          .describe("起始时间（ISO 字符串），可选"),
        to: z
          .string()
          .optional()
          .describe("结束时间（ISO 字符串），可选"),
        limit: z
          .number()
          .int()
          .positive()
          .max(1000)
          .optional()
          .describe("最多返回条数，可选"),
      }),
    },
    async ({ boardEname, from, to, limit }) => {
      const db = new TrafficDb();
      try {
        const points = db.queryHistory(boardEname, { from, to, limit });

        const lines: string[] = [
          `版面: ${boardEname}`,
          `历史采样数: ${points.length}`,
          "",
          points.length > 0
            ? "时间                    在线   今日   主题   文章"
            : "（无数据，请先调用 forum-fetch-traffic 采集）",
        ];

        for (const p of points) {
          lines.push(
            `${p.crawledAt.padEnd(24)} ${String(p.onlineUsers).padStart(5)} ${String(p.todayPosts).padStart(6)} ${String(p.threads).padStart(6)} ${String(p.posts).padStart(6)}`,
          );
        }

        return {
          content: [
            { type: "text", text: lines.join("\n") },
            {
              type: "text",
              text: JSON.stringify(points, null, 2),
            },
          ],
        };
      } finally {
        db.close();
      }
    },
  );
}
