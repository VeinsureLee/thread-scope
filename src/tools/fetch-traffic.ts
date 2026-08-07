import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { requireLogin } from "../auth/auth.js";
import { fetchTraffic, fetchAllTraffic } from "../crawl/traffic/index.js";
import type { TrafficTreeNode } from "../models/index.js";
import { DEFAULT_CONCURRENCY, MAX_CONCURRENCY } from "../core/config.js";

/** 格式化单条流量统计 */
function formatTraffic(t: {
  onlineUsers?: string;
  todayPosts?: string;
  threads?: string;
  posts?: string;
} | null): string {
  if (!t) return "未统计";
  return `在线:${t.onlineUsers || "-"} | 今日:${t.todayPosts || "-"} | 主题:${t.threads || "-"} | 文章:${t.posts || "-"}`;
}

/** 树状缩进输出 */
function formatTree(
  nodes: TrafficTreeNode[],
  prefix = "",
  isRoot = true,
): string[] {
  const lines: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    const last = i === nodes.length - 1;
    const branch = isRoot ? "" : (last ? "└── " : "├── ");
    const childPrefix = isRoot ? "" : (last ? "    " : "│   ");

    const label = node.type === "section" ? "分区" : "版块";
    lines.push(
      `${prefix}${branch}${label} ${node.name} (${node.id}) [${formatTraffic(node.traffic)}]`,
    );

    if (node.children?.length) {
      lines.push(...formatTree(node.children, prefix + childPrefix, false));
    }
  }
  return lines;
}

/** 注册获取流量信息工具 */
export function registerFetchTrafficTool(server: McpServer): void {
  server.registerTool(
    "forum-fetch-traffic",
    {
      title: "流量 · 获取版面/分区流量",
      description:
        "分类: 流量。获取版面的流量信息（在线人数、今日发帖、主题数、文章总数），以树状结构返回。不传参数时爬取全站所有版面的流量并写入数据库；传入版面/分区 ID 时只爬取该节点下的版面。section 节点返回其下全部版面的聚合统计（有版面未统计则为 null）。流量采样会异步写入数据库供历史查询。需要先执行 forum-login。",
      inputSchema: z.object({
        nodeId: z
          .string()
          .optional()
          .describe(
            "可选，节点 ID，如 sec-0（分区）或 board-Demo（版面）。不传则爬取全站",
          ),
        concurrency: z
          .number()
          .int()
          .positive()
          .max(MAX_CONCURRENCY)
          .default(DEFAULT_CONCURRENCY)
          .describe(`分区分组并发度（默认 ${DEFAULT_CONCURRENCY}，上限 ${MAX_CONCURRENCY}）`),
      }),
    },
    async ({ nodeId, concurrency }) => {
      requireLogin();

      const result = nodeId
        ? await fetchTraffic(nodeId, { concurrency })
        : await fetchAllTraffic({ concurrency });

      // 文本输出：树状视图
      const lines: string[] = [
        `节点: ${result.nodeName}${nodeId ? ` (${nodeId})` : " (全部)"}`,
        `爬取时间: ${result.crawledAt}`,
        `记录数: ${result.records.length}`,
        "",
      ];

      if (result.errors.length > 0) {
        lines.push(`⚠ 部分失败 (${result.errors.length}):`);
        for (const err of result.errors) {
          lines.push(`  - ${err}`);
        }
        lines.push("");
      }

      lines.push(...formatTree(result.tree));

      return {
        content: [
          { type: "text", text: lines.join("\n") },
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );
}
