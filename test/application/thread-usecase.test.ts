import { describe, expect, it } from "vitest";
import { fetchThread } from "../../src/application/use-case/thread/fetch-thread.js";
import { presentThread } from "../../src/controller/presenter/thread.js";
import type { ThreadViewPort } from "../../src/model/index.js";

const view: ThreadViewPort = {
  async fetchThreadDetail() {
    return {
      boardEname: "Demo",
      articleId: "1001",
      title: "示例帖子",
      url: "/article/Demo/1001",
      firstPost: {
        floor: 1,
        kind: "article",
        authorUid: "user_1",
        authorRaw: "user_1",
        isAnon: false,
        content: "示例首帖",
        images: [],
        postTime: "2026-01-01T00:00:00.000Z",
        posText: "楼主",
      },
      replies: [
        {
          floor: 2,
          kind: "reply",
          authorUid: "user_2",
          authorRaw: "user_2",
          isAnon: false,
          content: "示例回复",
          images: [],
          postTime: "2026-01-01T00:01:00.000Z",
          posText: "沙发",
          parentId: 1,
        },
        {
          floor: 3,
          kind: "reply",
          authorUid: "user_3",
          authorRaw: "user_3",
          isAnon: false,
          content: "示例二层回复",
          images: [],
          postTime: "2026-01-01T00:02:00.000Z",
          posText: "板凳",
          parentId: 2,
        },
      ],
    };
  },
};

describe("FetchThreadUseCase", () => {
  it("通过 Thread 模型构建 ArticleNode 树并由 Presenter 输出 DTO", async () => {
    const result = await fetchThread("Demo", "1001", { persist: false, view });
    const presentation = presentThread(result);

    expect(result.thread.contentState).toBe("complete");
    expect(result.thread.root?.children).toHaveLength(1);
    expect(result.thread.root?.children[0]?.children).toHaveLength(1);
    expect(presentation.data).toMatchObject({
      id: "1001",
      boardEname: "Demo",
      root: { children: [{ id: "1001-2", forumFloor: 2, children: [{ id: "1001-3" }] }] },
    });
  });
});
