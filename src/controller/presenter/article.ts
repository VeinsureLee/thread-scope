import type { ArticleRow } from "../../models/index.js";

export function presentBoardArticles(result: {
  boardName: string;
  rows: readonly ArticleRow[];
  persisted: boolean;
}): { text: string; data: readonly ArticleRow[] } {
  const lines = [
    `版块: ${result.boardName}`,
    `抓取文章数: ${result.rows.length}`,
    `置顶: ${result.rows.filter((row) => row.isPinned).length}`,
    `落库: ${result.persisted ? "是" : "否"}`,
    "",
    ...result.rows.map(
      (row) => `${row.isPinned ? "[顶] " : ""}${row.date} ${row.title} (${row.authorRaw}) 回复:${row.replyCount}`,
    ),
  ];
  return { text: lines.join("\n"), data: result.rows };
}
