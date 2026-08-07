import { load, type CheerioAPI } from "cheerio";

/**
 * 解析页面中的分页控件（element-03/04/06 共用结构）。
 *
 * ```html
 * <ul class="pagination">
 *   <li class="page-pre">主题数:<i>6211</i> 分页:</li>
 *   <li><ol class="page-main">
 *     <li class="page-select"><a title="当前页">1</a></li>
 *     <li class="page-normal"><a href="/board/Beauty?p=2" title="转到第2页">2</a></li>
 *     <li class="page-omit">...</li>
 *     <li class="page-normal"><a href="/board/Beauty?p=208" title="转到第208页">208</a></li>
 *     <li class="page-normal"><a href="/board/Beauty?p=2" title="下一页">&gt;&gt;</a></li>
 *   </ol></li>
 *   <li class="page-jump">...</li>
 * </ul>
 * ```
 *
 * 翻页参数：`?p={n}`（board 列表 / 帖子楼层 / 搜索结果均已确认）。
 */
export interface PageInfo {
  /** 总条数（主题数/文章数/贴数），从 li.page-pre i 解析；取不到为 null */
  total: number | null;
  /** 当前页码 */
  currentPage: number;
  /** 总页数 = 所有数字页码的最大值；无页码时为 1 */
  totalPages: number;
  /** 下一页 URL（相对路径，含 ?p={n+1}）；已是最后一页时为 null */
  nextHref: string | null;
  /** 是否有分页（至少 2 页） */
  hasMore: boolean;
}

/** 从 HTML 中解析分页信息；无分页控件时返回 null（视为单页） */
export function parsePagination($: CheerioAPI): PageInfo | null {
  const $ul = $("ul.pagination");
  if ($ul.length === 0) return null;

  const totalText = $ul.find("li.page-pre i").first().text().trim();
  const total = totalText ? parseInt(totalText.replace(/\D/g, ""), 10) : null;

  const currentText = $ul.find("li.page-select a").first().text().trim();
  const currentPage = parseInt(currentText, 10) || 1;

  // 所有数字页码 → 最大页；无页码则单页
  const pageNumbers: number[] = [];
  $ul.find("ol.page-main a[title^='转到第']").each((_, a) => {
    const href = $(a).attr("href") || "";
    const m = href.match(/[?&]p=(\d+)/);
    if (m) pageNumbers.push(parseInt(m[1]!, 10));
  });
  const totalPages =
    pageNumbers.length > 0 ? Math.max(...pageNumbers) : currentPage;

  const nextHref =
    $ul.find("a[title='下一页']").attr("href") || null;

  return {
    total: Number.isFinite(total) ? total : null,
    currentPage,
    totalPages,
    nextHref,
    hasMore: totalPages > 1,
  };
}

/**
 * 翻页遍历工具：从起始路径开始，逐页抓取并解析，直到停止条件。
 *
 * 用途（docs/03 §4）：article 列表、search 结果、帖子楼层共用同一套翻页逻辑。
 * 停止条件（任一满足即停）：
 *   - 达到 maxPages（页数上限）
 *   - 已收集 maxItems 条（数量上限）
 *   - 页面上没有"下一页"链接（到末尾）
 *
 * @param startPath 起始页路径，如 "/board/Beauty"
 * @param parsePage 每页解析函数：返回 { items, nextHref }（nextHref 为 null 表示没有下一页）
 */
export async function paginate<T>(
  startPath: string,
  parsePage: (path: string) => Promise<{ items: T[]; nextHref: string | null }>,
  opts: { maxPages?: number; maxItems?: number } = {},
): Promise<T[]> {
  const maxPages = opts.maxPages ?? Number.POSITIVE_INFINITY;
  const maxItems = opts.maxItems ?? Number.POSITIVE_INFINITY;

  const all: T[] = [];
  let path: string | null = startPath;
  let pages = 0;

  while (path && pages < maxPages && all.length < maxItems) {
    const { items, nextHref } = await parsePage(path);
    all.push(...items);
    pages++;
    path = nextHref;
  }

  // 超出数量上限时截断
  if (all.length > maxItems) all.length = maxItems;
  return all;
}

/** 便捷：从一个 HTML 页面提取分页信息（供 parsePage 内部用） */
export function parsePaginationFromHtml(html: string): PageInfo | null {
  const $ = load(html);
  return parsePagination($);
}
