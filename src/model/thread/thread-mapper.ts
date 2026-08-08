import { ArticleNode } from "./article-node.js";
import { Thread, type ArticleOverview } from "./thread.js";
import type { UserRef } from "../user/user-ref.js";

/** 持久化 DTO：article 表的一行（数据库读取结果）。 */
export interface ArticleRecord {
  boardEname: string;
  title: string;
  url: string;
  articleId: string;
  authorUid: string | null;
  authorRaw: string;
  isPinned: boolean;
  date: string;
  replyCount: number;
  lastReplyAt: string | null;
  lastReplierUid: string | null;
  lastReplierName?: string | null;
}

/** 持久化 DTO：post 表的一行楼层记录。 */
export interface PostRecord {
  id: string;
  kind: "article" | "reply";
  title: string | null;
  content: string;
  authorUid: string | null;
  authorRaw: string;
  isAnon: boolean;
  forumFloor: number;
  parentId: string | null;
  images: string[];
  postedAt: string | null;
}

function toUserRef(uid: string | null, displayName: string | null, isAnon: boolean): UserRef | null {
  if (!uid || isAnon) return null;
  return { uid, displayName: displayName ?? uid };
}

/**
 * Thread 的持久化 Mapper。
 *
 * 实体与持久化 DTO 分离：类实例写入 JSON/SQLite 后必须通过 Mapper 重新水合，
 * 不能假设方法会被序列化。本 Mapper 将 article/post 表读取结果还原为
 * Thread 实体（ArticleNode 树）；没有明确 parentId 的回复挂到 root。
 */
export class ThreadMapper {
  static fromRecords(
    article: ArticleRecord,
    posts: readonly PostRecord[],
    fallbackUrl?: string,
  ): Thread {
    const first = posts.find((post) => post.kind === "article") ?? posts[0]!;
    const root = new ArticleNode({
      id: first.id,
      kind: first.kind,
      title: first.title ?? article.title,
      content: first.content,
      author: toUserRef(first.authorUid, first.authorRaw, first.isAnon),
      authorRaw: first.authorRaw,
      isAnonymous: first.isAnon,
      forumFloor: first.forumFloor,
      images: first.images,
      postedAt: first.postedAt,
    });

    const nodesByFloor = new Map<number, ArticleNode>([[first.forumFloor, root]]);
    const replies = posts.filter((post) => post !== first).map((post) => {
      const node = new ArticleNode({
        id: post.id,
        kind: post.kind,
        title: post.title,
        content: post.content,
        author: toUserRef(post.authorUid, post.authorRaw, post.isAnon),
        authorRaw: post.authorRaw,
        isAnonymous: post.isAnon,
        forumFloor: post.forumFloor,
        images: post.images,
        postedAt: post.postedAt,
      });
      nodesByFloor.set(post.forumFloor, node);
      return { post, node };
    });
    for (const { post, node } of replies) {
      // parentId 是楼层引用；无法确认父节点时挂到 root，不根据楼层距离猜测
      const parentFloor = post.parentId ? Number.parseInt(post.parentId, 10) : NaN;
      const parent = Number.isFinite(parentFloor) ? nodesByFloor.get(parentFloor) : undefined;
      if (parent && parent !== root) {
        parent.addReply(node);
      } else {
        root.addReply(node);
      }
    }

    const overview: ArticleOverview = {
      boardEname: article.boardEname,
      articleId: article.articleId,
      title: article.title,
      url: fallbackUrl ?? article.url,
      author: toUserRef(first.authorUid, first.authorRaw, first.isAnon),
      authorRaw: first.authorRaw,
      date: article.date,
      isPinned: article.isPinned,
      replyCount: article.replyCount,
      lastReplyAt: article.lastReplyAt,
      lastReplier: toUserRef(article.lastReplierUid, article.lastReplierName ?? null, false),
      urlHash: "",
    };

    const thread = Thread.create(overview);
    thread.replaceContent(root, "complete");
    return thread;
  }
}
