import type { UserRef } from "../user/user-ref.js";

/**
 * 帖子概览：版面列表页/搜索页获得的一行元数据。
 *
 * 只描述 thread 概览，不保存正文。对应旧 `Article` 的语义；
 * 使用更完整的名字是为了避免与 `ArticleNode`（详情页一层发言）混淆。
 */
export interface ArticleOverview {
  boardEname: string;
  articleId: string;
  title: string;
  url: string;
  author: UserRef | null;
  authorRaw: string;
  date: string;
  isPinned: boolean;
  replyCount: number;
  lastReplyAt: string | null;
  lastReplier: UserRef | null;
  urlHash: string;
}
