import type { ArticleNode, Thread } from "../../model/index.js";

interface ArticleNodeDto {
  id: string;
  kind: ArticleNode["kind"];
  title: string | null;
  content: string;
  authorUid: string | null;
  authorRaw: string;
  isAnonymous: boolean;
  forumFloor: number;
  replyDepth: number;
  parentId: string | null;
  images: readonly string[];
  postedAt: string | null;
  children: ArticleNodeDto[];
}

function toArticleNodeDto(node: ArticleNode): ArticleNodeDto {
  return {
    id: node.id,
    kind: node.kind,
    title: node.title,
    content: node.content,
    authorUid: node.author?.uid ?? null,
    authorRaw: node.authorRaw,
    isAnonymous: node.isAnonymous,
    forumFloor: node.forumFloor,
    replyDepth: node.replyDepth,
    parentId: node.parentId,
    images: node.images,
    postedAt: node.postedAt,
    children: node.children.map(toArticleNodeDto),
  };
}

export function threadDto(thread: Thread): object {
  return {
    id: thread.id,
    boardEname: thread.boardEname,
    overview: {
      ...thread.overview,
      author: thread.overview.author ? { ...thread.overview.author } : null,
      lastReplier: thread.overview.lastReplier ? { ...thread.overview.lastReplier } : null,
    },
    contentState: thread.contentState,
    contentFetchedAt: thread.contentFetchedAt,
    updatedAt: thread.updatedAt,
    root: thread.root ? toArticleNodeDto(thread.root) : null,
  };
}

export function presentThread(result: {
  thread: Thread;
  persisted: boolean;
}): { text: string; data: object } {
  const thread = result.thread;
  const postCount = thread.root ? countNodes(thread.root) : 0;
  return {
    text: [
      `版块: ${thread.boardEname}`,
      `标题: ${thread.overview.title}`,
      `文章 ID: ${thread.id}`,
      `正文节点: ${postCount}`,
      `状态: ${thread.contentState}`,
      `落库: ${result.persisted ? "是" : "否"}`,
    ].join("\n"),
    data: threadDto(thread),
  };
}

function countNodes(node: ArticleNode): number {
  return 1 + node.children.reduce((total, child) => total + countNodes(child), 0);
}
