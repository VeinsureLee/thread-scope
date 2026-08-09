/**
 * 帖子内容（content）DTO — 详情页产出的正文与评论。
 *
 * 对应 DB 表 forum-content.db 的 post 表（docs/02 §3.3）。
 * 首帖与评论同构，共用一张 post 表，靠 kind 区分。
 * 对应领域层 ArticleNode（model/thread/article-node）的扁平持久化形态。
 */

/** 一层发言（首帖或评论） */
export interface Post {
  /** 所属文章 ID（DB 层由 article_id 关联） */
  articleId?: number;
  /** 父楼层 ID（评论引用；首帖为 null） */
  parentId?: number | null;
  /** 楼层号（首帖=1） */
  floor: number;
  /** 正文/评论 */
  kind: "article" | "reply";
  /** 作者 uid（匿名为 null） */
  authorUid: string | null;
  /** 作者显示名（页面原始署名，含匿名占位名） */
  authorRaw: string;
  /** 匿名标记（见 docs/02 §5.2） */
  isAnon: boolean;
  /** 正文/评论内容（已清洗：去掉发信人/标题/发信站头部与 --/来源/修改尾部；保留引用块） */
  content: string;
  /** 图片 URL 列表 */
  images: string[];
  /** 发帖时间（ISO 字符串，由英文时间解析） */
  postTime: string | null;
  /** 客户端类型（"手机客户端" | "网页" | null，由 ※ 来源 尾部解析） */
  client?: string | null;
  /** 来源 IP（含 IPv6；匿名来源 → null） */
  ip?: string | null;
  /** 楼层位置文本（楼主/沙发/板凳/第N楼，可空） */
  posText: string;
  /** 作者昵称（L1 内嵌资料，详情页 .a-u-uid；可空） */
  authorNick?: string;
  /** 作者性别（L1 内嵌资料，详情页 .a-u-sex title；可空） */
  authorGender?: string;
  /** 作者等级（L1 内嵌资料，dl.a-u-info dt=等级 dd；可空） */
  authorLevel?: string;
  /** 作者文章数（L1 内嵌资料，dt=文章 dd；可空） */
  authorPosts?: string;
  /** 作者积分（L1 内嵌资料，dt=积分 dd；可空） */
  authorScore?: string;
  /** 作者星座（L1 内嵌资料，dt=星座 dd；可空） */
  authorAstro?: string;
}

/** 一篇文章的完整内容（首帖 + 全部评论） */
export interface ThreadDetail {
  /** 版块英文名 */
  boardEname: string;
  /** 文章 ID（从 url 提取） */
  articleId: string;
  /** 文章标题 */
  title: string;
  /** 文章 URL */
  url: string;
  /** 首帖（kind='article'） */
  firstPost: Post;
  /** 评论列表（kind='reply'，按楼层升序） */
  replies: Post[];
}
