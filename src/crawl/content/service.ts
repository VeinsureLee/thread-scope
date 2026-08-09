import { requireLogin } from "../../auth/auth.js";
import type { Post, ThreadDetail } from "../../model/dto/index.js";
import { parsePagination } from "../common/paginator.js";
import { load } from "cheerio";
import { ThreadRepository, HttpThreadRepository } from "./repository.js";
import { parseThreadPage } from "./parser.js";

/**
 * 爬取一篇文章的完整内容（首帖 + 全部评论，跨楼层分页）。
 *
 * 能力（docs/03 §2.2）：
 * - 翻页驱动：帖子详情按 ?p={n} 分页（docs/04 §1.4 已确认），每页多个 .a-wrap 楼层
 * - 抓取【只看不写】：返回 ThreadDetail，落库由调用方（工具层）决定
 *
 * @param boardName 版块英文名
 * @param articleId 文章 ID（如 "320323"）
 * @param opts      { maxPages? } — 楼层页数上限（默认翻到底）
 * @param repo      数据访问实现（默认 HTTP，测试可注入 fake）
 */
export async function fetchThreadDetail(
  boardName: string,
  articleId: string,
  opts: { maxPages?: number } = {},
  repo: ThreadRepository = new HttpThreadRepository(),
): Promise<ThreadDetail> {
  requireLogin();

  const startPath = repo.threadUrl(boardName, articleId);
  const maxPages = opts.maxPages ?? Number.POSITIVE_INFINITY;

  const allPosts: Post[] = [];
  let title = "";
  let path: string | null = startPath;
  let pages = 0;

  while (path && pages < maxPages) {
    const html = await repo.fetch(path);
    const page = parsePagination(load(html));
    const parsed = parseThreadPage(boardName, articleId, html);

    // 首屏标题（后续页标题可能为空，保留首屏值）
    if (parsed.title && !title) title = parsed.title;

    if (parsed.posts.length === 0) break; // 空页 → 结束

    // 跨页楼层去重（页码边界可能重复）
    const seenFloors = new Set(allPosts.map((p) => p.floor));
    for (const p of parsed.posts) {
      if (!seenFloors.has(p.floor)) {
        allPosts.push(p);
        seenFloors.add(p.floor);
      }
    }

    const next = page?.nextHref ?? null;
    if (!next) break;
    path = next;
    pages++;
  }

  // 按楼层排序
  allPosts.sort((a, b) => a.floor - b.floor);

  const firstPost = allPosts.find((p) => p.kind === "article") ?? allPosts[0];
  const replies = allPosts.filter((p) => p !== firstPost);

  return {
    boardEname: boardName,
    articleId,
    title,
    url: startPath,
    firstPost: firstPost ?? {
      floor: 1,
      kind: "article",
      authorUid: null,
      authorRaw: "未知",
      isAnon: false,
      content: "",
      images: [],
      postTime: null,
      posText: "",
    },
    replies,
  };
}
