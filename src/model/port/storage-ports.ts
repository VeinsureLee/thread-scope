import type { ArticleRow, Post, TrafficHistoryPoint, UserProfile } from "../../models/index.js";
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
}

export interface ContentStorePort extends ThreadStorePort, UserStorePort {
  close?(): void;
  searchArticles(keyword: string, options?: { boardEname?: string; limit?: number }): ArticleRow[];
  searchThreadsContent(keyword: string, options?: { boardEname?: string; limit?: number }): LocalThreadSearchHit[];
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
