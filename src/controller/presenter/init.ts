interface InitCounts {
  sections: number;
  boards: number;
  managers: number;
  managersFetched: number;
  articlesFetched: number;
  articlesFailed: number;
  withStructure?: boolean;
  withManagers?: boolean;
  withArticles?: boolean;
  errors: readonly string[];
}

function appendErrors(lines: string[], errors: readonly string[]): void {
  if (errors.length > 0) {
    lines.push(`失败: ${errors.length} 项`, ...errors.map((error) => `  ⚠ ${error}`));
  }
}

/** 组装版（forum-init）：结构 + 版主（+ 可选首页文章），按参数开关展示。 */
export function presentInit(result: InitCounts): string {
  const lines = [
    `分区: ${result.sections}`,
    `版块: ${result.boards}`,
    `版主: ${result.managers}（资料抓取成功 ${result.managersFetched}）`,
  ];
  if (result.withArticles) {
    lines.push(`首页文章: ${result.articlesFetched} 个版块（失败 ${result.articlesFailed}）`);
  } else {
    lines.push("首页文章: 未抓取（可通过 forum-init withArticles=true 初始化）");
  }
  appendErrors(lines, result.errors);
  return lines.join("\n");
}
