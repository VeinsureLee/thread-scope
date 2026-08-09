import type { ArticleRow, Post, TrafficHistoryPoint, UserProfile } from "../../model/dto/index.js";
import type { Thread } from "../thread/thread.js";

export interface ArticleStorePort {
  upsertBoard(ename: string, name: string, isAnonymous: boolean): void;
  upsertUser(user: {
    uid: string;
    name: string;
    isAnon?: boolean;
    profile?: unknown | null;
    profileFetchedAt?: string | null;
  }): number;
  upsertArticles(articles: ArticleRow[]): number;
}

export interface ThreadStorePort extends ArticleStorePort {
  saveThread(
    boardEname: string,
    article: { url: string; title: string },
    authors: Array<{ uid: string; name: string; isAnon?: boolean }>,
    firstPost: Post,
    replies: Post[],
  ): number;
  saveThreadModel(thread: Thread): number;
}

export interface UserStorePort {
  getAllUserUids(): string[];
  getUserProfileFetchedAt(uid: string): string | null;
  getUserProfile(uid: string): unknown | null;
  upsertUserProfile(uid: string, profile: unknown, fetchedAt?: string): void;
  getAllUserUidsWithFetchedAt(): Array<{ uid: string; profileFetchedAt: string | null }>;
  upsertUser(user: {
    uid: string;
    name: string;
    isAnon?: boolean;
    profile?: unknown | null;
    profileFetchedAt?: string | null;
  }): number;
}

export interface LocalThreadSearchHit {
  boardEname: string;
  articleTitle: string;
  articleUrl: string;
  floor: number;
  kind: "article" | "reply";
  authorRaw: string;
  content: string;
  postTime: string | null;
  /** 客户端类型（"手机客户端" | "网页" | null） */
  client?: string | null;
  /** 来源 IP（匿名 → null） */
  ip?: string | null;
}

/** 本地内容搜索选项（限制版面/时间窗口/上限/排序）。 */
export interface SearchContentOptions {
  /** 限定单版面（兼容旧调用） */
  boardEname?: string;
  /** 限定多版面 */
  boardEnames?: readonly string[];
  /** 发帖日期/时间下界（YYYY-MM-DD 或 ISO datetime） */
  from?: string;
  /** 发帖日期/时间上界 */
  to?: string;
  /** 返回上限 */
  limit?: number;
  /** recent=时效(默认) / relevant=相关性 */
  sort?: "recent" | "relevant";
}

export interface ContentStorePort extends ThreadStorePort, UserStorePort {
  close?(): void;
  searchArticles(keyword: string, options?: SearchContentOptions): ArticleRow[];
  searchThreadsContent(keyword: string, options?: SearchContentOptions): LocalThreadSearchHit[];
  setUserManager(uid: string): void;
}

export interface TrafficStorePort {
  queryHistory(
    boardEname: string,
    options?: { from?: string; to?: string; limit?: number },
  ): TrafficHistoryPoint[];
}

export interface ClosablePort {
  close(): void;
}
