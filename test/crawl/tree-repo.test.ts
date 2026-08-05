import { describe, it, expect } from "vitest";
import { crawlNodeTree } from "../../src/crawl/structure/tree.js";
import type { SectionRepository, AjaxEntry } from "../../src/crawl/structure/repository.js";

/**
 * 单元测试：用 fake repository 验证树爬取算法，完全不依赖真实网络。
 *
 * 通过注入 SectionRepository 的假实现，覆盖：
 * - 分区/版块条目分离
 * - 版块详情解析（含退化路径）
 * - 子分区递归
 * - 分区详情失败时的降级行为
 */

/** 构造一个内存版 SectionRepository */
function makeFakeRepo(
  children: Record<string, AjaxEntry[]>,
  detailHtml: (sectionId: string) => string,
): SectionRepository {
  return {
    async listChildren(parentId: string): Promise<AjaxEntry[]> {
      if (!(parentId in children)) throw new Error(`unknown parent: ${parentId}`);
      return children[parentId]!;
    },
    async getSectionDetail(sectionId: string): Promise<string> {
      const html = detailHtml(sectionId);
      if (html.startsWith("__ERROR__")) throw new Error(html);
      return html;
    },
  };
}

/** 构建版块列表 HTML（与真实页面结构一致） */
function boardListHtml(boards: { ename: string; name: string; manager?: string; posts?: string; threads?: string }[]): string {
  const rows = boards
    .map(
      (b) => `<tr>
        <td class="title_1"><a href="/board/${b.ename}">${b.name}</a><br>${b.ename}</td>
        <td class="title_2">${b.manager ?? ""}</td>
        <td class="title_6">${b.threads ?? ""}</td>
        <td class="title_7">${b.posts ?? ""}</td>
      </tr>`,
    )
    .join("\n    ");
  return `<table class="board-list"><tbody>
    ${rows}
  </tbody></table>`;
}

/** 根级：两个分区 + 一个版块 */
const children: Record<string, AjaxEntry[]> = {
  "list-section": [
    { t: '<a href="/section/sec-0">本站站务</a>', id: "sec-0" },
    { t: '<a href="/section/news">校园生活</a>', id: "news" },
    { t: '<a href="/board/Advice">意见与建议</a>', id: "" },
  ],
  "sec-0": [
    { t: '<a href="/board/BBShelp">论坛帮助</a>', id: "" },
  ],
  news: [
    { t: '<a href="/section/college">院系风采</a>', id: "college" },
    { t: '<a href="/board/JobInfo">招聘信息</a>', id: "" },
  ],
  college: [
    { t: '<a href="/board/CS">计算机学院</a>', id: "" },
    { t: '<a href="/board/SE">软件学院</a>', id: "" },
  ],
};

describe("crawlNodeTree（fake repository，无网络）", () => {
  it("递归构建完整树：分区、子分区、版块", async () => {
    const repo = makeFakeRepo(children, (sid) =>
      boardListHtml(
        sid === "sec-0"
          ? [{ ename: "BBShelp", name: "论坛帮助", manager: "admin", posts: "2000", threads: "150" }]
          : sid === "news"
            ? [{ ename: "JobInfo", name: "招聘信息", manager: "recruiter", posts: "50000", threads: "3000" }]
            : sid === "college"
              ? [
                  { ename: "CS", name: "计算机学院", posts: "10000", threads: "500" },
                  { ename: "SE", name: "软件学院", posts: "8000", threads: "400" },
                ]
              : [{ ename: "Advice", name: "意见与建议" }],
      ),
    );

    const tree = await crawlNodeTree("list-section", repo);

    // 根：2 分区 + 1 版块
    expect(tree).toHaveLength(3);

    const sec0 = tree.find((n) => n.id === "sec-0")!;
    expect(sec0.type).toBe("section");
    expect(sec0.name).toBe("本站站务");
    if (sec0.type !== "section") return;
    expect(sec0.children).toHaveLength(1);
    expect(sec0.children[0]!.type).toBe("board");

    // 直接版块叶子（根下）
    const advice = tree.find((n) => n.id === "board-Advice")!;
    expect(advice.type).toBe("board");
    if (advice.type !== "board") return;
    expect(advice.board.name).toBe("意见与建议");
    expect(advice.board.ename).toBe("Advice");
    expect(advice.level).toBe(1);

    // 三层嵌套：news → college → CS/SE
    const news = tree.find((n) => n.id === "news")!;
    if (news.type !== "section") throw new Error("expected section");
    const college = news.children.find((n) => n.id === "college")!;
    expect(college.type).toBe("section");
    if (college.type !== "section") return;
    expect(college.children).toHaveLength(2);
    const cs = college.children.find((n) => n.name === "计算机学院")!;
    expect(cs.type).toBe("board");
    if (cs.type !== "board") return;
    expect(cs.board.posts).toBe("10000");
    expect(cs.board.threads).toBe("500");
    expect(cs.level).toBe(3);
  });

  it("分区详情失败时版块退化为基本信息（不抛出）", async () => {
    // news 分区详情返回错误 → JobInfo 退化为基本数据
    // （ename 从 href 恢复为真实值 "JobInfo"，但 posts/threads 为空）
    const repo = makeFakeRepo(children, (sid) =>
      sid === "news" ? "__ERROR__detail failed__" : boardListHtml([]),
    );

    const tree = await crawlNodeTree("list-section", repo);

    const news = tree.find((n) => n.id === "news")!;
    expect(news.type).toBe("section");
    if (news.type !== "section") return;
    // news 下有 college 子分区 + JobInfo 版块
    const jobInfo = news.children.find((n) => n.type === "board");
    expect(jobInfo?.type).toBe("board");
    if (jobInfo?.type !== "board") return;
    expect(jobInfo.board.ename).toBe("JobInfo");
    expect(jobInfo.board.posts).toBe("");
    expect(jobInfo.board.threads).toBe("");
  });

  it("子分区递归失败时降级为空 children", async () => {
    // 只提供根级数据，news 的子分区 college 查不到 → children=[]
    const repo = makeFakeRepo(
      {
        "list-section": [{ t: '<a href="/section/news">校园生活</a>', id: "news" }],
        news: [{ t: '<a href="/section/college">院系风采</a>', id: "college" }],
      },
      () => "",
    );

    const tree = await crawlNodeTree("list-section", repo);

    const news = tree.find((n) => n.id === "news")!;
    if (news.type !== "section") throw new Error("expected section");
    const college = news.children.find((n) => n.id === "college")!;
    expect(college.type).toBe("section");
    if (college.type !== "section") return;
    expect(college.children).toEqual([]);
  });

  it("空条目 / 空名称被跳过", async () => {
    const repo = makeFakeRepo(
      {
        "list-section": [
          { t: "", id: "" },
          { t: "   ", id: "" },
          { t: '<a href="/other/unknown">未知</a>', id: "1" },
          { t: '<a href="/board/Advice">意见与建议</a>', id: "" },
        ],
      },
      () => boardListHtml([{ ename: "Advice", name: "意见与建议" }]),
    );

    const tree = await crawlNodeTree("list-section", repo);

    expect(tree).toHaveLength(1);
    expect(tree[0]!.id).toBe("board-Advice");
  });
});
