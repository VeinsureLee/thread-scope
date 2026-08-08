import { describe, expect, it } from "vitest";
import { ArticleNode, Thread } from "../../src/model/index.js";

const overview = {
  boardEname: "Demo",
  articleId: "1001",
  title: "示例主题",
  url: "/article/Demo/1001",
  author: { uid: "user_1", displayName: "user_1" },
  authorRaw: "user_1",
  date: "2026-01-01",
  isPinned: false,
  replyCount: 2,
  lastReplyAt: null,
  lastReplier: null,
  urlHash: "hash-demo",
} as const;

describe("Thread / ArticleNode 领域模型", () => {
  it("区分论坛楼层和回复树深度", () => {
    const root = new ArticleNode({
      id: "1001-1",
      kind: "article",
      title: "示例主题",
      content: "首帖",
      author: overview.author,
      authorRaw: "user_1",
      isAnonymous: false,
      forumFloor: 1,
    });
    const reply = new ArticleNode({
      id: "1001-8",
      kind: "reply",
      content: "回复",
      author: { uid: "user_2", displayName: "user_2" },
      authorRaw: "user_2",
      isAnonymous: false,
      forumFloor: 8,
    });
    root.addReply(reply);
    expect(reply.forumFloor).toBe(8);
    expect(reply.replyDepth).toBe(1);
    expect(root.searchLocal({ authorUid: "user_2" })).toEqual([reply]);
  });

  it("Thread 只负责内容增改查，不负责网络并发", () => {
    const thread = Thread.create(overview);
    const root = new ArticleNode({
      id: "1001-1",
      kind: "article",
      content: "首帖",
      author: overview.author,
      authorRaw: "user_1",
      isAnonymous: false,
      forumFloor: 1,
    });
    thread.replaceContent(root, "complete");
    expect(thread.contentState).toBe("complete");
    expect(thread.findPost("1001-1")).toBe(root);
  });
});
