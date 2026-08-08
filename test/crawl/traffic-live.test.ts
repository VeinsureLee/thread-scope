/**
 * 集成测试（真实登录，需论坛凭证）。
 *
 * 运行: BYR_LIVE=1 npm test -- test/crawl/traffic-live.test.ts
 * 未设置 BYR_LIVE 时自动跳过（避免无凭证环境误挂）。
 *
 * 隐私约定：不硬编码任何论坛内部标识（版块名 / 分区 ID / 匿名版面）。
 * 测试目标版块均从 forum-fetch-structure 的实时树中动态选取。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { login, logout } from "../../src/auth/auth.js";
import { fetchForumTree } from "../../src/crawl/structure/index.js";
import { fetchTrafficUseCase } from "../../src/application/use-case/traffic/fetch-traffic-impl.js";
import type { ForumTreeNode, BoardNode } from "../../src/models/index.js";

const liveEnabled = process.env.BYR_LIVE === "1";

describe.skipIf(!liveEnabled)("live: 真实论坛集成测试（BYR_LIVE=1 时启用）", () => {
  beforeAll(async () => {
    const result = await login();
    if (!result.isLogin) throw new Error(`Login failed. Check .env credentials.`);
    console.log(`Logged in as: ${result.userName}`);
  }, 15000);

  afterAll(() => {
    logout();
  });

  // ============================================================
  // 步骤 1：验证结构树爬取
  // ============================================================

  it("step 1: 结构树爬取成功且存在真实英文名的版块", async () => {
    const tree = await fetchForumTree();
    const boards = collectAllBoards(tree);
    expect(boards.length).toBeGreaterThan(0);

    const hasRealEname = boards.filter((b) => !b.board.ename.startsWith("("));
    console.log(`总版块 ${boards.length}，含真实英文名 ${hasRealEname.length}`);
    expect(hasRealEname.length).toBeGreaterThan(0);
  }, 30000);

  // ============================================================
  // 步骤 2：动态选取版块，验证流量获取
  // ============================================================

  it("step 2: 从实时树动态选取版块并获取流量", async () => {
    const tree = await fetchForumTree();
    const boards = collectAllBoards(tree);
    expect(boards.length).toBeGreaterThan(0);

    // 动态选取，不硬编码论坛内部标识
    const leaf = boards[0]!;
    const snapshot = await fetchTrafficUseCase(leaf.id, {});
    expect(snapshot.records.length).toBeGreaterThan(0);

    const r = snapshot.records[0]!;
    expect(r.name).toBeTruthy();
    expect(r.ename).toBeTruthy();
    expect(r.onlineUsers, "onlineUsers should have value").toBeTruthy();
    expect(r.todayPosts, "todayPosts should have value").toBeTruthy();
    expect(r.threads, "threads should have value").toBeTruthy();
    expect(r.posts, "posts should have value").toBeTruthy();
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
