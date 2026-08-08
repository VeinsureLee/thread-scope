import type { TrafficTreeNode } from "../../models/index.js";

function formatTraffic(t: {
  onlineUsers?: string;
  todayPosts?: string;
  threads?: string;
  posts?: string;
} | null): string {
  if (!t) return "未统计";
  return `在线:${t.onlineUsers || "-"} | 今日:${t.todayPosts || "-"} | 主题:${t.threads || "-"} | 文章:${t.posts || "-"}`;
}

function formatTree(
  nodes: readonly TrafficTreeNode[],
  prefix = "",
  isRoot = true,
): string[] {
  const lines: string[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]!;
    const last = i === nodes.length - 1;
    const branch = isRoot ? "" : (last ? "└─ " : "├─ ");
    const childPrefix = isRoot ? "" : (last ? "   " : "│  ");
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

export function presentTraffic(result: {
  nodeId?: string;
  nodeName: string;
  crawledAt: string;
  records: readonly unknown[];
  tree: readonly TrafficTreeNode[];
  errors: readonly string[];
}): { text: string; data: object } {
  const lines = [
    `节点: ${result.nodeName}${result.nodeId ? ` (${result.nodeId})` : " (全部)"}`,
    `抓取时间: ${result.crawledAt}`,
    `记录数: ${result.records.length}`,
    "",
  ];
  if (result.errors.length > 0) {
    lines.push(`⚠ 部分失败 (${result.errors.length}):`, ...result.errors.map((error) => `  - ${error}`), "");
  }
  lines.push(...formatTree(result.tree));
  return { text: lines.join("\n"), data: result };
}
