/**
 * 文章（article）— 版块列表页产出的文章元数据。
 *
 * 对应 DB 表 forum-content.db 的 article 表（docs/02 §3.2）。
 * 与详情页正文（Post）分离：列表页只写 article，详情页再落 post。
 */
export interface Article {
  /** 版块英文名（冗余，跨版面引用锚点） */
  boardEname: string;
  /** 标题 */
  title: string;
  /** 文章 URL（相对路径，如 /article/Demo/1001） */
  url: string;
  /** 发帖日期（列表页纯日期，如 2026-08-05） */
  date: string;
  /** 置顶标记（tr.top / ico-pos-article-top） */
  isPinned: boolean;
  /** url 的确定性哈希（sha1），去重锚点 */
  urlHash: string;
  /** 作者 uid（列表页可解析）；匿名或未知为 null */
  authorUid: string | null;
  /** 作者显示名（列表页原始署名，匿名时是 IWhisper#xxx） */
  authorRaw: string;
  /** 回复数（列表页 title_11） */
  replyCount: number;
  /** 最新回复日期/时间（列表页第二个 title_10，纯文本） */
  lastReply: string;
  /** 最新回复人 uid（列表页第二个 title_12） */
  lastReplierUid: string | null;
}

/**
 * 文章行（列表页解析产物，尚未落库）。
 * 与 Article 的区别：urlHash 由调用方在落库前计算。
 */
export interface ArticleRow {
  boardEname: string;
  title: string;
  url: string;
  date: string;
  isPinned: boolean;
  authorUid: string | null;
  authorRaw: string;
  replyCount: number;
  lastReply: string;
  lastReplierUid: string | null;
}
