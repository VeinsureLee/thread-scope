interface InitCounts {
  sections: number;
  boards: number;
  managers: number;
  managersFetched: number;
  articlesFetched: number;
  articlesFailed: number;
  withArticles?: boolean;
  errors: readonly string[];
}

function appendErrors(lines: string[], errors: readonly string[]): void {
  if (errors.length > 0) {
    lines.push(`失败: ${errors.length} 项`, ...errors.map((error) => `  ⚠ ${error}`));
  }
}

/** 组装版（forum-init）：结构 + 版主（+ 可选首页文章） */
export function presentInit(result: InitCounts): string {
  const lines = [
    `分区: ${result.sections}`,
    `版块: ${result.boards}`,
    `版主: ${result.managers}（资料抓取成功 ${result.managersFetched}）`,
  ];
  if (result.withArticles) {
    lines.push(`首页文章: ${result.articlesFetched} 个版块（失败 ${result.articlesFailed}）`);
  } else {
    lines.push("首页文章: 未抓取（可通过 forum-init-board-articles 单独初始化）");
  }
  appendErrors(lines, result.errors);
  return lines.join("\n");
}

/** 独立结构初始化（forum-init-structure） */
export function presentInitStructure(result: {
  sections: number;
  boards: number;
  treePath: string;
  errors: readonly string[];
}): string {
  const lines = [
    "论坛结构初始化完成",
    `分区: ${result.sections}`,
    `版块: ${result.boards}`,
    `结构缓存: ${result.treePath || "(未写入)"}`,
  ];
  appendErrors(lines, result.errors);
  return lines.join("\n");
}

/** 独立版主初始化（forum-init-managers） */
export function presentInitManagers(result: {
  managers: number;
  managersFetched: number;
  errors: readonly string[];
}): string {
  const lines = [
    "论坛版主初始化完成",
    `版主: ${result.managers}（资料抓取成功 ${result.managersFetched}）`,
  ];
  appendErrors(lines, result.errors);
  return lines.join("\n");
}

/** 独立首页初始化（forum-init-board-articles） */
export function presentInitBoardArticles(result: {
  articlesFetched: number;
  articlesFailed: number;
  errors: readonly string[];
}): string {
  const lines = [
    "论坛首页初始化完成",
    `首页文章: ${result.articlesFetched} 个版块（失败 ${result.articlesFailed}）`,
  ];
  appendErrors(lines, result.errors);
  return lines.join("\n");
}
