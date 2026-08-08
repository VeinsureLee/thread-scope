import type { UserProfile } from "../../models/index.js";
import { publicUserProfile } from "./user.js";

export function formatProfileLine(profile: UserProfile): string {
  const parts = [
    `${profile.uid} (${profile.nickname || "无名"})`,
    profile.gender,
    profile.level ? `等级:${profile.level}` : "",
    profile.postCount ? `帖子:${profile.postCount}` : "",
    profile.points ? `积分:${profile.points}` : "",
    profile.vitality ? `生命:${profile.vitality}` : "",
    profile.isOnline ? "在线" : profile.onlineStatus,
  ].filter(Boolean);
  return parts.join(" | ");
}

export function presentUserProfiles(result: {
  targets: readonly string[];
  profiles: readonly UserProfile[];
  stats: { success: number; skippedAnon: number; skippedFresh: number; failed: number };
  persisted: boolean;
  results: ReadonlyArray<{ uid: string; error?: string }>;
}): { text: string; data: Record<string, unknown>[] } {
  const lines = [
    `目标用户数: ${result.targets.length}`,
    `抓取成功: ${result.stats.success}`,
    `跳过匿名: ${result.stats.skippedAnon}`,
    `跳过未过期(72h内): ${result.stats.skippedFresh}`,
    `失败: ${result.stats.failed}`,
    `落库: ${result.persisted ? "是" : "否"}`,
    "",
    ...result.profiles.map(formatProfileLine),
  ];
  if (result.stats.failed > 0) {
    lines.push("", "失败明细:");
    for (const item of result.results) {
      if (item.error) lines.push(`  - ${item.uid}: ${item.error}`);
    }
  }
  return {
    text: lines.join("\n"),
    data: result.profiles.map((profile) => publicUserProfile(profile as unknown as Record<string, unknown>)),
  };
}
