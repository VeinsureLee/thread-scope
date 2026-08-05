import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { requireLogin } from "../auth/auth.js";
import { fetchTraffic } from "../crawl/traffic.js";

/** 注册获取流量信息工具 */
export function registerFetchTrafficTool(server: McpServer): void {
  server.registerTool(
    "forum-fetch-traffic",
    {
      title: "获取版面/分区流量",
      description:
        "获取指定节点（版面或分区）的流量信息，包括在线人数、今日发帖、主题数、文章总数。传入版面 ID 时只返回该版面；传入分区 ID 时递归汇总该分区下所有版面的流量。需要先执行 forum-login。",
      inputSchema: z.object({
        nodeId: z
          .string()
          .min(1)
          .describe("节点 ID，如 sec-0（分区）或 board-JobInfo（版面）"),
      }),
    },
    async ({ nodeId }) => {
      requireLogin();
      const snapshot = await fetchTraffic(nodeId);

      // 构建可读文本输出
      const lines: string[] = [
        `节点: ${snapshot.nodeName} (${snapshot.nodeId})`,
        `爬取时间: ${snapshot.crawledAt}`,
        `记录数: ${snapshot.records.length}`,
        "",
      ];

      if (snapshot.errors.length > 0) {
        lines.push(`⚠ 部分失败 (${snapshot.errors.length}):`);
        for (const err of snapshot.errors) {
          lines.push(`  - ${err}`);
        }
        lines.push("");
      }

      for (const r of snapshot.records) {
        lines.push(
          `[${r.name}] (${r.ename}) 在线:${r.onlineUsers || "-"} | 今日:${r.todayPosts || "-"} | 主题:${r.threads || "-"} | 文章:${r.posts || "-"}`,
        );
      }

      return {
        content: [
          { type: "text", text: lines.join("\n") },
          {
            type: "text",
            text: JSON.stringify(snapshot, null, 2),
          },
        ],
      };
    },
  );
}
