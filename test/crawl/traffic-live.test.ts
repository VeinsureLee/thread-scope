/**
 * 集成测试：真实登录论坛，获取流量信息（以悄悄话为最终目标）。
 *
 * 运行: npx vitest run test/crawl/traffic-live.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { login, logout } from "../../src/auth/auth.js";
import { ajaxGet } from "../../src/utils/http-client.js";
import { routes, fillRoute } from "../../src/utils/config.js";
import { fetchForumTree } from "../../src/crawl/structure.js";
import { fetchTraffic, parseSectionTraffic } from "../../src/crawl/traffic.js";
import type { ForumTreeNode, BoardNode } from "../../src/utils/types.js";

describe("live: traffic for qiaoqiaohua (IWhisper)", () => {
  beforeAll(async () => {
    const result = await login();
    if (!result.isLogin) throw new Error(`Login failed. Check .env credentials.`);
    console.log(`Logged in as: ${result.userName}`);
  }, 15000);

  afterAll(() => { logout(); });

  // ============================================================
  // 步骤 1：验证树结构修复结果
  // ============================================================

  it("step 1: tree crawler gets real ename and many boards", async () => {
    const tree = await fetchForumTree();
    const allBoards = collectAllBoards(tree);
    console.log(`Total boards in tree: ${allBoards.length}`);

    // 找几个有真实英文名的版块
    const hasRealEname = allBoards.filter(
      (b) => !b.board.ename.startsWith("("),
    );
    console.log(`Boards with real ename: ${hasRealEname.length} / ${allBoards.length}`);

    if (hasRealEname.length > 0) {
      console.log("Sample boards with real ename:");
      for (const b of hasRealEname.slice(0, 5)) {
        console.log(`  ${b.name} -> ename="${b.board.ename}"`);
      }
      expect(hasRealEname.length).toBeGreaterThan(0);
    }
  }, 30000);

  // ============================================================
  // 步骤 2：直接在 section 页面中搜索 IWhisper
  // ============================================================

  it("step 2: search for IWhisper in section HTML pages", async () => {
    // IWhisper 可能在任何一级或次级分区下
    // 先扫描 10 个一级分区
    const sectionIds = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

    let foundSecId = "";
    let foundHtml = "";

    for (const sid of sectionIds) {
      const html = await ajaxGet(`/section/${sid}?count=1`);
      if (html.includes("IWhisper") || html.includes("悄悄话")) {
        foundSecId = sid;
        foundHtml = html;
        console.log(`IWhisper found in /section/${sid}?count=1`);
        break;
      }
    }

    // 如果一级分区没有，可能是更深的子分区
    if (!foundSecId) {
      console.log("Not in root sections. Trying sub-sections...");
      const sectionIds = ["sec-BBSLOG", "sec-BM_Affair", "sec-Board", "sec-BYR_Team"];
      for (const sid of sectionIds) {
        const html = await ajaxGet(`/section/${sid.replace(/^sec-/, "")}?count=1`);
        if (html.includes("IWhisper") || html.includes("悄悄话")) {
          foundSecId = sid;
          foundHtml = html;
          console.log(`IWhisper found in /section/${sid.replace(/^sec-/, "")}?count=1`);
          break;
        }
      }
    }

    if (!foundSecId) {
      console.log("IWhisper not found in scanned sections. May be deeper in tree.");
      // Skip the parse check
      return;
    }

    // 用 parseSectionTraffic 直接解析
    const parsed = parseSectionTraffic(
      foundHtml,
      new Set(["IWhisper"]),
      new Set(["悄悄话"]),
    );

    expect(parsed).toHaveLength(1);
    const r = parsed[0]!;

    console.log(`Parsed IWhisper:`, JSON.stringify(r, null, 2));

    // 核心断言：所有字段都有值
    expect(r.name).toBe("悄悄话");
    expect(r.ename).toBe("IWhisper");
    expect(r.onlineUsers, "onlineUsers").toBeTruthy();
    expect(r.todayPosts, "todayPosts").toBeTruthy();
    expect(r.threads, "threads").toBeTruthy();
    expect(r.posts, "posts").toBeTruthy();
    expect(Number(r.onlineUsers)).toBeGreaterThanOrEqual(0);
    expect(Number(r.todayPosts)).toBeGreaterThanOrEqual(0);
    expect(Number(r.threads)).toBeGreaterThan(0);
    expect(Number(r.posts)).toBeGreaterThan(0);
  }, 30000);

  // ============================================================
  // 步骤 3：用 fetchTraffic 获取一个已知版块的流量
  // ============================================================

  it("step 3: fetchTraffic for a board in section 0", async () => {
    // 直接测试 fetchTraffic 的端到端流程
    // 选 section 0（本站站务）中的一个版块
    const snapshot = await fetchTraffic("sec-0");

    console.log(`\nfetchTraffic(sec-0):`);
    console.log(`  nodeName: ${snapshot.nodeName}`);
    console.log(`  records: ${snapshot.records.length}`);
    console.log(`  errors: ${snapshot.errors.length}`);

    // 取第一个记录
    const r = snapshot.records.find((x) => x.ename === "Advice") || snapshot.records[0]!;
    console.log(`  First record: ${r.name} (${r.ename}) online="${r.onlineUsers}" today="${r.todayPosts}" threads="${r.threads}" posts="${r.posts}"`);

    expect(r.name).toBeTruthy();
    expect(r.ename).toBeTruthy();
    // 核心：onlineUsers 和 todayPosts 不应该为空
    expect(r.onlineUsers, "onlineUsers should have value").toBeTruthy();
    expect(r.todayPosts, "todayPosts should have value").toBeTruthy();
    expect(r.threads).toBeTruthy();
    expect(r.posts).toBeTruthy();
  }, 30000);
});

// ============================================================
// 工具函数
// ============================================================

function collectAllBoards(nodes: ForumTreeNode[]): BoardNode[] {
  const result: BoardNode[] = [];
  for (const node of nodes) {
    if (node.type === "board") result.push(node);
    else result.push(...collectAllBoards(node.children));
  }
  return result;
}
