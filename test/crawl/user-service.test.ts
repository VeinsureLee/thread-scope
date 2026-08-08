import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  fetchUserProfile,
  fetchUserProfiles,
  fetchUserTitles,
  updateAllUserTitles,
  profileValues,
  profileStats,
  defaultIsFresh,
} from "../../src/crawl/user/service.js";
import type { UserRepository } from "../../src/crawl/user/repository.js";

// 登录状态：直接注入假 cookie（绕过 requireLogin）
import { saveCookie, clearCookie } from "../../src/core/http-client.js";

/** 注入一个测试 cookie（saveCookie 需要 AxiosResponse 形态） */
function setTestCookie(): void {
  saveCookie({ headers: { "set-cookie": "test_cookie=1" } } as never);
}

// 合成测试数据
const QUERY_OK = JSON.stringify({
  id: "user_a",
  user_name: "测试昵称",
  gender: "m",
  astro: "天秤座",
  level: "用户",
  post_count: 5,
  score: 100,
  life: 10,
  status: "目前不在站上",
  ajax_st: 1,
});
const TQUERY_OK = JSON.stringify({
  data: [{ uid: "user_a", path: [{ name: "示例官方账号" }] }],
  ajax_st: 1,
});

/** 假 Repository：可配置响应与调用记录 */
function makeFakeRepo(opts: {
  queryByUid?: Record<string, string>;
  defaultQuery?: string;
  tquery?: string;
  failQueryUids?: string[];
} = {}): UserRepository & { queryCalls: string[]; postCalls: string[] } {
  const calls = { queryCalls: [] as string[], postCalls: [] as string[] };
  return {
    queryUrl: (uid) => `/user/query/${uid}.json`,
    titlesUrl: () => "/user/ajax_tquery.json",
    fetch: async (path) => {
      calls.queryCalls.push(path);
      const m = path.match(/\/user\/query\/([^?.]+)\.json/);
      const uid = m ? m[1]! : "";
      if (opts.failQueryUids?.includes(uid)) {
        throw new Error(`fake network error: ${uid}`);
      }
      if (opts.queryByUid?.[uid]) return opts.queryByUid[uid]!;
      return opts.defaultQuery ?? QUERY_OK;
    },
    post: async (path, body) => {
      calls.postCalls.push(`${path}?${body}`);
      return opts.tquery ?? TQUERY_OK;
    },
    ...calls,
  };
}

describe("crawl/user — fetchUserProfile（单用户）", () => {
  beforeEach(() => setTestCookie());

  it("抓取 query.json 主体（不含头衔，title 为空数组）", async () => {
    const repo = makeFakeRepo();
    const p = await fetchUserProfile("user_a", repo);
    expect(p.uid).toBe("user_a");
    expect(p.nickname).toBe("测试昵称");
    expect(p.title).toEqual([]); // 头衔独立获取，主体不含
    expect(repo.queryCalls).toEqual(["/user/query/user_a.json"]);
    // 不调 tquery
    expect(repo.postCalls).toHaveLength(0);
  });

  it("匿名占位名不请求，直接抛错", async () => {
    const repo = makeFakeRepo();
    await expect(fetchUserProfile("IWhisper#123", repo)).rejects.toThrow(
      "匿名占位名不可抓取资料",
    );
    expect(repo.queryCalls).toHaveLength(0);
  });
});

describe("crawl/user — fetchUserProfiles（批量）", () => {
  beforeEach(() => setTestCookie());

  it("并发抓取全部 uid（不含头衔）", async () => {
    const repo = makeFakeRepo();
    const results = await fetchUserProfiles(["user_a", "user_b"], { concurrency: 2 }, repo);
    const ok = results.filter((r) => r.profile);
    expect(ok).toHaveLength(2);
    expect(ok[0]!.profile!.uid).toBe("user_a");
    expect(ok[1]!.profile!.uid).toBe("user_b");
    // 主体抓取不含头衔（不调 tquery）
    expect(repo.postCalls).toHaveLength(0);
    expect(ok.every((r) => r.profile!.title.length === 0)).toBe(true);
  });

  it("匿名占位名跳过（skipped=anonymous），不请求", async () => {
    const repo = makeFakeRepo();
    const results = await fetchUserProfiles(["user_a", "IWhisper#123"], {}, repo);
    expect(results).toHaveLength(2);
    const anon = results.find((r) => r.uid === "IWhisper#123")!;
    expect(anon.skipped).toBe("anonymous");
    expect(anon.profile).toBeUndefined();
    // 未对匿名发起请求
    expect(repo.queryCalls.every((c) => !c.includes("IWhisper"))).toBe(true);
  });

  it("isFresh 返回 true → 跳过（skipped=fresh）", async () => {
    const repo = makeFakeRepo();
    const results = await fetchUserProfiles(
      ["user_a"],
      { isFresh: () => true },
      repo,
    );
    expect(results[0]!.skipped).toBe("fresh");
    expect(repo.queryCalls).toHaveLength(0); // 未请求
  });

  it("force=true → 忽略 isFresh，强制抓取", async () => {
    const repo = makeFakeRepo();
    const results = await fetchUserProfiles(
      ["user_a"],
      { force: true, isFresh: () => true },
      repo,
    );
    expect(results[0]!.profile).toBeTruthy();
    expect(repo.queryCalls).toHaveLength(1);
  });

  it("单个失败 → error 记录，不影响其他", async () => {
    const repo = makeFakeRepo({ failQueryUids: ["user_a"] });
    const results = await fetchUserProfiles(["user_a", "user_b"], { concurrency: 2 }, repo);
    const a = results.find((r) => r.uid === "user_a")!;
    const b = results.find((r) => r.uid === "user_b")!;
    expect(a.error).toContain("fake network error");
    expect(b.profile).toBeTruthy();
  });

  it("结果保持传入顺序", async () => {
    const repo = makeFakeRepo();
    const results = await fetchUserProfiles(["user_b", "user_a", "user_c"], {}, repo);
    expect(results.map((r) => r.uid)).toEqual(["user_b", "user_a", "user_c"]);
  });
});

describe("crawl/user — profileValues / profileStats", () => {
  it("profileValues 只取成功项", () => {
    const vals = profileValues([
      { uid: "a", profile: { uid: "a", nickname: "A" } as never },
      { uid: "b", skipped: "anonymous" },
      { uid: "c", error: "x" },
    ]);
    expect(vals.map((v) => v.uid)).toEqual(["a"]);
  });

  it("profileStats 统计", () => {
    const stats = profileStats([
      { uid: "a", profile: {} as never },
      { uid: "b", skipped: "anonymous" },
      { uid: "c", skipped: "fresh" },
      { uid: "d", error: "x" },
    ]);
    expect(stats).toEqual({ success: 1, skippedAnon: 1, skippedFresh: 1, failed: 1 });
  });
});

describe("crawl/user — defaultIsFresh（TTL）", () => {
  it("无 fetchedAt → 不新鲜（false）", () => {
    expect(defaultIsFresh(null)).toBe(false);
  });

  it("72h 内 → 新鲜（true）", () => {
    const recent = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    expect(defaultIsFresh(recent)).toBe(true);
  });

  it("超过 72h → 不新鲜（false）", () => {
    const old = new Date(Date.now() - 73 * 60 * 60 * 1000).toISOString();
    expect(defaultIsFresh(old)).toBe(false);
  });

  it("非法日期 → 不新鲜（false）", () => {
    expect(defaultIsFresh("not-a-date")).toBe(false);
  });
});

describe("crawl/user — fetchUserTitles（头衔批量）", () => {
  beforeEach(() => setTestCookie());

  it("单 uid 查头衔", async () => {
    const repo = makeFakeRepo();
    const titles = await fetchUserTitles(["user_a"], repo);
    expect(titles.get("user_a")).toEqual(["示例官方账号"]);
    // 调了 tquery
    expect(repo.postCalls.some((c) => c.includes("list[]=user_a"))).toBe(true);
  });

  it("多 uid 一次批量查（同一 tquery 请求）", async () => {
    const repo = makeFakeRepo();
    await fetchUserTitles(["user_a", "user_b"], repo);
    expect(repo.postCalls).toHaveLength(1);
    expect(repo.postCalls[0]).toContain("list[]=user_a");
    expect(repo.postCalls[0]).toContain("list[]=user_b");
  });

  it("无头衔 uid → 空数组", async () => {
    const repo = makeFakeRepo({ tquery: JSON.stringify({ data: false, ajax_st: 1 }) });
    const titles = await fetchUserTitles(["user_a"], repo);
    expect(titles.get("user_a")).toEqual([]);
  });

  it("匿名占位名跳过（不请求）", async () => {
    const repo = makeFakeRepo();
    const titles = await fetchUserTitles(["IWhisper#123"], repo);
    expect(repo.postCalls).toHaveLength(0);
    expect(titles.size).toBe(0);
  });
});

describe("crawl/user — updateAllUserTitles（全量）", () => {
  beforeEach(() => setTestCookie());

  /** 假 ContentDb：模拟库内用户 + profile 读写 */
  function makeFakeDb() {
    const profiles = new Map<string, unknown>();
    const all = [
      { uid: "user_a", profileFetchedAt: null },
      { uid: "user_b", profileFetchedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() }, // 新鲜
      { uid: "IWhisper#123", profileFetchedAt: null }, // 匿名
    ];
    return {
      getAllUserUidsWithFetchedAt: () => all,
      getUserProfile: (uid: string) => profiles.get(uid) ?? null,
      upsertUserProfile: (uid: string, p: unknown) => {
        profiles.set(uid, p);
      },
      profiles,
    };
  }

  it("全量更新：跳过匿名 + 跳过新鲜，更新其余", async () => {
    const db = makeFakeDb();
    const result = await updateAllUserTitles(db, makeFakeRepo());
    expect(result.updated).toBe(1); // 只 user_a 被更新
    expect(result.skippedAnon).toBe(1);
    expect(result.skippedFresh).toBe(1);
    expect(db.profiles.get("user_a")).toMatchObject({ title: ["示例官方账号"] });
  });

  it("force=true → 强制全量（含新鲜）", async () => {
    const db = makeFakeDb();
    const result = await updateAllUserTitles(db, makeFakeRepo(), { force: true });
    expect(result.updated).toBe(2); // user_a + user_b
    expect(result.skippedFresh).toBe(0);
  });

  it("无主体资料但有 uid → 建最小 profile", async () => {
    const db = makeFakeDb();
    await updateAllUserTitles(db, makeFakeRepo());
    const p = db.profiles.get("user_a") as { title: string[] };
    expect(p.title).toEqual(["示例官方账号"]);
  });
});
