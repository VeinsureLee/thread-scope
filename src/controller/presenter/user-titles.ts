export function presentSelectedUserTitles(result: {
  uids: readonly string[];
  titles: ReadonlyMap<string, string[]>;
}): { text: string; data: Record<string, string[]> } {
  const lines = [
    `目标用户数: ${result.uids.length}`,
    `有头衔用户: ${[...result.titles.values()].filter((titles) => titles.length > 0).length}`,
    "",
  ];
  for (const uid of result.uids) {
    const titles = result.titles.get(uid) ?? [];
    lines.push(`${uid}: ${titles.length > 0 ? titles.join(" / ") : "(无头衔)"}`);
  }
  return { text: lines.join("\n"), data: Object.fromEntries(result.titles) };
}

export function presentAllUserTitles(stats: {
  updated: number;
  skippedFresh: number;
  skippedAnon: number;
  failed: number;
  errors: readonly string[];
}): string {
  const lines = [
    "全量头衔更新:",
    `已更新: ${stats.updated}`,
    `跳过未过期(72h内): ${stats.skippedFresh}`,
    `跳过匿名: ${stats.skippedAnon}`,
    `失败: ${stats.failed}`,
  ];
  if (stats.errors.length > 0) {
    lines.push("", "失败明细:", ...stats.errors.map((uid) => `  - ${uid}`));
  }
  return lines.join("\n");
}
