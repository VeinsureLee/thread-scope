import { load, type CheerioAPI } from "cheerio";
import { selectors } from "../../core/config.js";
import { parseAuthor } from "../user/index.js";
import { uidFromHref, parsePostTime, isAnonymousWith$, isAnonSource } from "../common/parser-kit.js";
import type { Post } from "../../model/dto/index.js";

/**
 * 解析帖子详情页（/article/{board}/{id}，element-04/07）。
 *
 * 结构（docs/04 §1.4）：
 *   .b-head span.n-left         → 标题（"文章主题: xxx"）
 *   .b-content > .a-wrap.corner → 每层一个；锚点 a[name="aN"]（N 从 0 起）
 *     tr.a-head   → .a-left .a-u-name 作者名 + .a-u-sex 性别图标；右侧 .a-pos 楼层位置
 *     tr.a-body   → .a-left .a-u-img img 头像 + .a-u-info 资料；.a-content .a-content-wrap 正文
 *     tr.a-bottom → 操作栏（忽略）
 *
 * 楼层号：优先用 .a-pos（楼主=1/沙发=2/板凳=3/第N楼=N，绝对楼层跨页准确）；
 *         缺省时回退到锚点序号（页内 aN → N+1）。
 * 匿名识别（docs/04 §1.7）：详情页匿名作者【无】链接，靠隐藏图标 / 名称 / 来源标记。
 *
 * @param boardName 版块英文名
 * @param articleId 文章 ID（如 "320323"）
 * @param html      详情页 HTML
 * @returns { posts, title } — posts 为当页全部楼层（楼主的 kind='article'，其余 'reply'）
 */
export function parseThreadPage(
  boardName: string,
  articleId: string,
  html: string,
): { posts: Post[]; title: string } {
  const $ = load(html);
  const sel = selectors.thread_detail;

  // 标题
  const titleText = $(sel.title).first().text().trim();
  const title = titleText.replace(/^文章主题:\s*/, "").trim();

  const posts: Post[] = [];

  $(sel.post_wrap).each((_, wrap) => {
    const $wrap = $(wrap);
    const post = parseFloor($, boardName, articleId, $wrap);
    if (post) posts.push(post);
  });

  return { posts, title };
}

/** 解析单个楼层容器（.a-wrap） */
function parseFloor(
  $: CheerioAPI,
  boardName: string,
  articleId: string,
  $wrap: ReturnType<CheerioAPI>,
): Post | null {
  const sel = selectors.thread_detail;
  const $head = $wrap.find("tr.a-head");

  // ── 作者 ──
  const $nameCell = $head.find(`${sel.author_name}`).first();
  const $authorLink = $head.find(sel.author_link).first();
  const hasLink = $authorLink.length > 0;
  const name = $nameCell.text().trim();

  // 匿名：详情页无链接，靠隐藏图标 / 名称 / 来源
  const $sexSamp = $head.find(sel.author_sex_icon).first();
  const isAnon =
    isAnonymousWith$($, name, hasLink, $sexSamp) ||
    isAnonSource(getContentText($, $wrap, sel));

  const author = parseAuthor(name, $authorLink.attr("href") || undefined);
  const uid = !isAnon && hasLink ? uidFromHref($authorLink.attr("href")) : null;

  // ── 楼层号 ──
  const posText = $head.find(sel.post_pos).first().text().trim();
  const floor = floorFromPos(posText, $wrap, $);

  // ── 内容 + 图片 ──
  const $contentWrap = $wrap.find(sel.post_content).first();
  if ($contentWrap.length === 0) return null;

  const { text: content, images } = extractContent($, $contentWrap);

  // ── 时间 ──
  const postTime = parsePostTime(content);

  // ── L1 内嵌作者资料（docs/06 §2.3） ──
  const embedded = parseEmbeddedAuthor($, $wrap);

  return {
    floor,
    kind: floor === 1 ? "article" : "reply",
    authorUid: uid,
    authorRaw: name || "匿名",
    isAnon,
    content,
    images,
    postTime,
    posText,
    authorNick: embedded.nick,
    authorGender: embedded.gender,
    authorLevel: embedded.level,
    authorPosts: embedded.posts,
    authorScore: embedded.score,
    authorAstro: embedded.astro,
  };
}

/**
 * 提取楼层内嵌作者资料（L1，docs/06 §2.3，0 额外请求）。
 *
 * 结构（2026-08-07 在线验证，位于 .a-body 行内的 td.a-left）：
 *   td.a-left（.a-body 内）：
 *     .a-u-uid                     → 昵称
 *     .a-u-sex samp[title]         → 性别（"男生哦 离线" → 男生）
 *     dl.a-u-info > dt/dd 键值对   → 等级/文章/积分/星座
 *
 * 注意：楼层有两处 td.a-left（a-head 行 与 a-body 行），资料在 a-body 行，
 * 故限定 $wrap.find("tr.a-body td.a-left")。
 *
 * @returns 6 个 L1 字段（nick/gender/level/posts/score/astro），缺省空串
 */
function parseEmbeddedAuthor(
  $: CheerioAPI,
  $wrap: ReturnType<CheerioAPI>,
): { nick: string; gender: string; level: string; posts: string; score: string; astro: string } {
  // 资料块（a-body 行）：昵称 + dl.a-u-info
  const $bodyLeft = $wrap.find("tr.a-body td.a-left").first();

  // 昵称
  const nick = $bodyLeft.find("div.a-u-uid").first().text().trim();

  // 性别：.a-u-sex 位于 a-head 行 td.a-left（非 a-body 行）
  // title 形如 "男生哦 离线" / "女生哦 在线" / "性别保密哦 离线" → 取前缀
  const $headSex = $wrap.find("tr.a-head .a-u-sex samp").first();
  const sexTitle = ($headSex.attr("title") || "").trim();
  const gender = sexTitle.startsWith("男生")
    ? "男生"
    : sexTitle.startsWith("女生")
      ? "女生"
      : "";

  // dl.a-u-info 的 dt→dd 键值对（a-body 行）
  const map: Record<string, string> = {};
  $bodyLeft.find("dl.a-u-info").each((_, dl) => {
    const $dl = $(dl);
    $dl.children("dt").each((i, dt) => {
      const key = $(dt).text().trim();
      const value = $dl.children("dd").eq(i).text().trim();
      if (key) map[key] = value;
    });
  });

  return {
    nick,
    gender,
    level: map["等级"] ?? "",
    posts: map["文章"] ?? "",
    score: map["积分"] ?? "",
    astro: map["星座"] ?? "",
  };
}

/** 提取正文文本（<br> → 换行）与图片 URL；剥离"精彩回复"等附属块 */
function extractContent(
  $: CheerioAPI,
  $wrap: ReturnType<CheerioAPI>,
): { text: string; images: string[] } {
  const $content = $wrap.clone();
  // 移除"精彩回复"、回复表单等非正文附属块
  $content.find("#nice_view, .a-nice-comment, .a-background").remove();

  const images: string[] = [];
  $content.find("img").each((_, img) => {
    const src = $(img).attr("src");
    if (src) images.push(src);
  });

  // <br> → \n（cheerio 的 .text() 不会为 br 换行）
  $content.find("br").each((_, br) => {
    $(br).replaceWith("\n");
  });

  return { text: $content.text().trim(), images };
}

/** 获取楼层正文的纯文本（供 isAnonSource 判断来源标记） */
function getContentText(
  $: CheerioAPI,
  $wrap: ReturnType<CheerioAPI>,
  sel: (typeof selectors)["thread_detail"],
): string {
  return $wrap.find(sel.post_content).first().text();
}

/** 从 .a-pos 楼层位置文本推导楼层号；无法解析则用页内锚点序号回退 */
function floorFromPos(
  posText: string,
  $wrap: ReturnType<CheerioAPI>,
  $: CheerioAPI,
): number {
  if (posText === "楼主") return 1;
  if (posText === "沙发") return 2;
  if (posText === "板凳") return 3;
  const m = posText.match(/第(\d+)楼/);
  if (m) return parseInt(m[1]!, 10);

  // 回退：锚点 a[name="aN"] → N+1
  const anchorName = $wrap.prev("a[name]").attr("name") || "";
  const am = anchorName.match(/^a(\d+)$/);
  return am ? parseInt(am[1]!, 10) + 1 : 0;
}
