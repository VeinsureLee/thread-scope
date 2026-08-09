import type { Post, ThreadDetail } from "../../model/dto/index.js";
import { ArticleNode } from "./article-node.js";
import { Thread } from "./thread.js";
import type { ArticleOverview } from "./article-overview.js";
import type { UserRef } from "../user/user-ref.js";

function toUserRef(uid: string | null, displayName: string, isAnon: boolean): UserRef | null {
  if (!uid || isAnon) return null;
  return { uid, displayName };
}

function postId(post: Post, articleId: string): string {
  return `${articleId}-${post.floor}`;
}

function toArticleNode(post: Post, articleId: string, title: string | null, depth: number): ArticleNode {
  return new ArticleNode({
    id: postId(post, articleId),
    kind: post.kind,
    title,
    content: post.content,
    author: toUserRef(post.authorUid, post.authorRaw, post.isAnon),
    authorRaw: post.authorRaw,
    isAnonymous: post.isAnon,
    forumFloor: post.floor,
    replyDepth: depth,
    images: post.images,
    postedAt: post.postTime,
  });
}

/** 将现有扁平 ThreadDetail 转换为新 Thread；没有明确 parentId 的回复挂到 root。 */
export function threadFromLegacyDetail(
  detail: ThreadDetail,
  overview?: Partial<ArticleOverview>,
): Thread {
  const firstPost = detail.firstPost;
  const root = toArticleNode(firstPost, detail.articleId, detail.title, 0);
  const nodesByFloor = new Map<number, ArticleNode>([[firstPost.floor, root]]);
  const replies = detail.replies.map((reply) => {
    const node = toArticleNode(reply, detail.articleId, null, 1);
    nodesByFloor.set(reply.floor, node);
    return { reply, node };
  });
  for (const { reply, node } of replies) {
    const parent = reply.parentId == null ? root : (nodesByFloor.get(reply.parentId) ?? root);
    parent.addReply(node);
  }
  const articleOverview: ArticleOverview = {
    boardEname: detail.boardEname,
    articleId: detail.articleId,
    title: detail.title,
    url: detail.url,
    author: toUserRef(firstPost.authorUid, firstPost.authorRaw, firstPost.isAnon),
    authorRaw: firstPost.authorRaw,
    date: firstPost.postTime ?? "",
    isPinned: false,
    replyCount: detail.replies.length,
    lastReplyAt: detail.replies.at(-1)?.postTime ?? null,
    lastReplier: detail.replies.length > 0
      ? toUserRef(detail.replies.at(-1)!.authorUid, detail.replies.at(-1)!.authorRaw, detail.replies.at(-1)!.isAnon)
      : null,
    urlHash: overview?.urlHash ?? "",
    ...overview,
  };
  const thread = Thread.create(articleOverview);
  thread.replaceContent(root, "complete");
  return thread;
}
