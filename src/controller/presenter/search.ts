import type { ArticleRow, SearchThreadHit } from "../../models/index.js";

export function presentArticleSearch(result: {
  source: "local" | "remote";
  keyword?: string;
  author?: string;
  scope?: { label: string };
  rows: readonly ArticleRow[];
  elapsedMs: number;
}): { text: string; data: readonly ArticleRow[] } {
  const lines = [
    `来源: ${result.source === "local" ? "本地缓存" : "联网"}`,
    result.scope ? `搜索范围: ${result.scope.label}` : "搜索范围: 本地缓存",
    result.author ? `作者: ${result.author}` : `关键字: ${result.keyword ?? ""}`,
    `命中数: ${result.rows.length}`,
    `用时: ${result.source === "local" ? `${result.elapsedMs}ms` : `${(result.elapsedMs / 1000).toFixed(1)}s`}`,
    "",
    ...result.rows.map(
      (row) => `[${row.boardEname}] ${row.date} ${row.title} (${row.authorRaw}) 回复:${row.replyCount}`,
    ),
  ];
  return { text: lines.join("\n"), data: result.rows };
}

export function presentThreadSearch(result: {
  source: "local" | "remote";
  keyword?: string;
  author?: string;
  scope?: { label: string };
  hits: readonly SearchThreadHit[];
  localHits: ReadonlyArray<{
    boardEname: string;
    articleTitle: string;
    floor: number;
    authorRaw: string;
    content: string;
  }>;
  elapsedMs: number;
}): { text: string; data: readonly unknown[] } {
  const lines = [
    `来源: ${result.source === "local" ? "本地缓存" : "联网"}`,
    result.scope ? `搜索范围: ${result.scope.label}` : "搜索范围: 本地缓存",
    result.author ? `作者: ${result.author}` : `关键字: ${result.keyword ?? ""}`,
    result.source === "local" ? `命中楼层数: ${result.localHits.length}` : `抓取帖子数: ${result.hits.length}`,
    `用时: ${result.source === "local" ? `${result.elapsedMs}ms` : `${(result.elapsedMs / 1000).toFixed(1)}s`}`,
    "",
    ...(result.source === "local"
      ? result.localHits.map((hit) =>
        `[${hit.boardEname}] ${hit.articleTitle} #${hit.floor} (${hit.authorRaw}): ${hit.content.slice(0, 80)}`,
      )
      : result.hits.map((hit) => {
        const first = hit.firstPost;
        return `[${hit.boardEname}] ${hit.articleId} ${hit.title} (${first.authorRaw}) 正文:${first.content.slice(0, 80)} 评论:${hit.replies.length}`;
      })),
  ];
  return {
    text: lines.join("\n"),
    data: result.source === "local" ? result.localHits : result.hits,
  };
}
