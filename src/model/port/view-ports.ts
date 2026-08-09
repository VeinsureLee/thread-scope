import type { ArticleRow, ForumTreeNode, SearchResult, ThreadDetail, TrafficInfo, TrafficTreeNode, UserProfile } from "../../model/dto/index.js";

export interface ArticleViewPort {
  fetchBoardArticles(
    boardName: string,
    options?: { maxPages?: number; maxItems?: number },
  ): Promise<readonly ArticleRow[]>;
}

export interface StructureViewPort {
  fetchForumTree(options?: { refresh?: boolean }): Promise<ForumTreeNode[]>;
  fetchNodeChildren(parentId: string): Promise<ForumTreeNode[]>;
  loadCachedTree(): ForumTreeNode[] | null;
}

export interface SearchViewPort {
  searchBoardArticles(
    boardName: string,
    keyword: string,
    options?: { author?: string; maxPages?: number; maxItems?: number },
  ): Promise<readonly SearchResult[]>;
}

export interface ThreadViewPort {
  fetchThreadDetail(
    boardName: string,
    articleId: string,
    options?: { maxPages?: number },
  ): Promise<ThreadDetail>;
}

export interface UserViewPort {
  fetchUserProfile(uid: string): Promise<UserProfile>;
  fetchUserProfiles(uids: readonly string[], options?: { concurrency?: number; force?: boolean }): Promise<unknown>;
  fetchUserTitles(uids: readonly string[]): Promise<ReadonlyMap<string, string[]>>;
}

export interface TrafficViewPort {
  /** 读取单个 section 页面并解析其下版块流量（文档 §4.8）；跨 section 并发由 Controller 编排。 */
  fetchSectionTraffic(
    sectionId: string,
    boards: ReadonlyArray<{ ename: string; name: string }>,
  ): Promise<{ readonly records: TrafficInfo[]; readonly error: string | null }>;
}

