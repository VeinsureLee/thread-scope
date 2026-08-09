import type { TrafficHistoryPoint } from "../../model/dto/index.js";

export function presentTrafficHistory(result: {
  boardEname: string;
  points: readonly TrafficHistoryPoint[];
}): { text: string; data: readonly TrafficHistoryPoint[] } {
  const lines = [
    `版面: ${result.boardEname}`,
    `历史采样数: ${result.points.length}`,
    "",
    result.points.length > 0
      ? "时间                    在线   今日   主题   文章"
      : "（无数据，请先调用 forum-fetch-traffic 采集）",
  ];
  for (const point of result.points) {
    lines.push(
      `${point.crawledAt.padEnd(24)} ${String(point.onlineUsers).padStart(5)} ${String(point.todayPosts).padStart(6)} ${String(point.threads).padStart(6)} ${String(point.posts).padStart(6)}`,
    );
  }
  return { text: lines.join("\n"), data: result.points };
}
