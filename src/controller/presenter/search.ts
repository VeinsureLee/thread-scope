import type { ArticleRow, SearchThreadHit } from "../../model/dto/index.js";

/** 文章搜索结果按版分组。 */
interface ArticleGroup {
  boardEname: string;
  count: number;
  items: readonly ArticleRow[];
}

export function presentArticleSearch(result: {
  source: "local" | "remote";
  keyword?: string;
  author?: string;
  scope?: { label: string };
  total: number;
  boards: readonly ArticleGroup[];
  elapsedMs: number;
}): { text: string; data: object } {
  const lines = [
    `来源: ${result.source === "local" ? "本地缓存" : "联网"}`,
    result.scope ? `搜索范围: ${result.scope.label}` : "搜索范围: 本地缓存",
    result.author ? `作者: ${result.author}` : `关键字: ${result.keyword ?? ""}`,
    `命中总数: ${result.total}（涉及 ${result.boards.length} 个版块）`,
    `用时: ${result.source === "local" ? `${result.elapsedMs}ms` : `${(result.elapsedMs / 1000).toFixed(1)}s`}`,
    "",
  ];
  for (const group of result.boards) {
    lines.push(`[${group.boardEname}] ${group.count} 条命中:`);
    lines.push(
      ...group.items.map(
        (row) => `  ${row.date} ${row.title} (${row.authorRaw}) 回复:${row.replyCount}`,
      ),
    );
  }
  return { text: lines.join("\n"), data: { total: result.total, boards: result.boards } };
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
}): { text: string; data: object } {
  const lines = [
    `来源: ${result.source === "local" ? "本地缓存" : "联网"}`,
    result.scope ? `搜索范围: ${result.scope.label}` : "搜索范围: 本地缓存",
    result.author ? `作者: ${result.author}` : `关键字: ${result.keyword ?? ""}`,
    result.source === "local" ? `命中楼层数: ${result.localHits.length}` : `抓取帖子数: ${result.hits.length}`,
    `用时: ${result.source === "local" ? `${result.elapsedMs}ms` : `${(result.elapsedMs / 1000).toFixed(1)}s`}`,
    "",
  ];
  if (result.source === "local") {
    lines.push(
      ...result.localHits.map((hit) =>
        `[${hit.boardEname}] ${hit.articleTitle} #${hit.floor} (${hit.authorRaw}): ${hit.content.slice(0, 80)}`,
      ),
    );
  } else {
    // 按版分组输出抓取到的帖子
    const byBoard = new Map<string, SearchThreadHit[]>();
    for (const hit of result.hits) {
      const list = byBoard.get(hit.boardEname) ?? [];
      list.push(hit);
      byBoard.set(hit.boardEname, list);
    }
    for (const [boardEname, group] of byBoard) {
      lines.push(`[${boardEname}] ${group.length} 条:`);
      lines.push(
        ...group.map((hit) => {
          const first = hit.firstPost;
          return `  ${hit.articleId} ${hit.title} (${first.authorRaw}) 正文:${first.content.slice(0, 80)} 评论:${hit.replies.length}`;
        }),
      );
    }
  }
  return {
    text: lines.join("\n"),
    data: result.source === "local" ? result.localHits : result.hits,
  };
}
