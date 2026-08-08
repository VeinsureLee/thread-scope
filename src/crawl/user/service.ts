import { requireLogin } from "../../auth/auth.js";
import type { UserProfile } from "../../models/index.js";
import { mapWithConcurrency } from "../common/async-pool.js";
import { DEFAULT_CONCURRENCY, USER_PROFILE_TTL_HOURS } from "../../core/config.js";
import { logWarn } from "../../logging/logger.js";
import { UserRepository, HttpUserRepository } from "./repository.js";
import { parseUserProfile, parseUserTitles, mergeTitles, isAnonUid } from "./parser.js";

/** tquery 批量接口单次查询的 uid 上限（避免超大请求体） */
const TITLES_BATCH_SIZE = 50;

/** 批量抓取单个用户的资料（query.json 主体，不含特殊头衔） */
export interface FetchUserProfileResult {
  uid: string;
  profile?: UserProfile;
  /** 失败原因（匿名/未过期跳过时无） */
  skipped?: "anonymous" | "fresh";
  error?: string;
}

/**
 * 抓取单个用户的资料（query.json 主体，不含特殊头衔）。
 *
 * 需要登录。匿名占位名（IWhisper#xxx）不请求，直接抛错。
 * 特殊头衔由独立入口 fetchUserTitles 提供（docs/06 头衔独立爬取）。
 *
 * @param uid  用户 ID
 * @param repo 数据访问实现（默认 HTTP）
 */
export async function fetchUserProfile(
  uid: string,
  repo: UserRepository = new HttpUserRepository(),
): Promise<UserProfile> {
  requireLogin();
  if (isAnonUid(uid)) {
    throw new Error(`匿名占位名不可抓取资料: ${uid}`);
  }

  // query.json 主体（title 留空数组，头衔独立获取）
  const raw = await repo.fetch(repo.queryUrl(uid));
  return parseUserProfile(uid, raw);
}

/**
 * 批量抓取用户资料（并发 + TTL 过滤，不含特殊头衔）。
 *
 * 流程：
 * 1. 过滤匿名占位名（isAnon）→ skipped="anonymous"；
 * 2. 按 profile_fetched_at + TTL 过滤（force=false 时）→ skipped="fresh"；
 * 3. 对剩余 uid 并发抓 query.json（mapWithConcurrency）。
 *
 * 特殊头衔由独立入口 fetchUserTitles / updateAllUserTitles 提供（docs/06 头衔独立爬取）。
 * 请求频率由 PageFetcher 令牌队列统一兜底（全站 ≤50 req/s），并发不突破。
 *
 * @param uids  目标 uid 列表
 * @param opts  { concurrency?, force?, isFresh? } — isFresh(uid)=>boolean 由调用方注入（TTL 判断）
 * @param repo  数据访问实现（默认 HTTP）
 */
export async function fetchUserProfiles(
  uids: string[],
  opts: {
    concurrency?: number;
    force?: boolean;
    /** 判断 uid 资料是否未过期（返回 true 则跳过）；缺省返回 false（全抓） */
    isFresh?: (uid: string) => boolean;
  } = {},
  repo: UserRepository = new HttpUserRepository(),
): Promise<FetchUserProfileResult[]> {
  requireLogin();

  const { concurrency = DEFAULT_CONCURRENCY, force = false, isFresh } = opts;
  const freshCheck = force ? () => false : (isFresh ?? (() => false));

  // 1. 过滤匿名 + 未过期
  const targets: string[] = [];
  const results: FetchUserProfileResult[] = [];
  for (const uid of uids) {
    if (isAnonUid(uid)) {
      results.push({ uid, skipped: "anonymous" });
      continue;
    }
    if (freshCheck(uid)) {
      results.push({ uid, skipped: "fresh" });
      continue;
    }
    targets.push(uid);
  }

  // 2. 并发抓 query.json 主体（失败由池捕获为 error，fn 只返回成功 shape）
  const fetched = await mapWithConcurrency(
    targets,
    concurrency,
    async (uid): Promise<{ uid: string; profile: UserProfile }> => {
      const raw = await repo.fetch(repo.queryUrl(uid));
      return { uid, profile: parseUserProfile(uid, raw) };
    },
  );
  const profiles = new Map<string, UserProfile>();
  const errors: string[] = [];
  for (const r of fetched) {
    if (r.error !== undefined) {
      errors.push(`[${targets[r.index]}] ${r.error.message}`);
      continue;
    }
    if (r.value) profiles.set(r.value.uid, r.value.profile);
  }
  if (errors.length > 0) {
    logWarn("crawl", { message: "部分用户资料抓取失败", uids: errors }, "crawler.user");
  }

  // 3. 组装结果（保持 uids 传入顺序）
  const uidIndex = new Map<string, number>();
  uids.forEach((u, i) => uidIndex.set(u, i));
  for (const r of fetched) {
    if (r.error !== undefined) {
      results.push({ uid: targets[r.index]!, error: r.error.message });
      continue;
    }
    if (r.value) {
      const uid = r.value.uid;
      results.push({ uid, profile: profiles.get(uid) ?? r.value.profile });
    }
  }

  return results.sort((a, b) => {
    const ia = uidIndex.get(a.uid) ?? 0;
    const ib = uidIndex.get(b.uid) ?? 0;
    return ia - ib;
  });
}

/** 便捷：过滤结果只取成功项（profile 非空） */
export function profileValues(results: FetchUserProfileResult[]): UserProfile[] {
  return results
    .filter((r) => r.profile !== undefined && r.profile !== null)
    .map((r) => r.profile!);
}

/** 便捷：统计跳过（匿名 / 未过期）与失败 */
export function profileStats(results: FetchUserProfileResult[]): {
  success: number;
  skippedAnon: number;
  skippedFresh: number;
  failed: number;
} {
  return {
    success: results.filter((r) => r.profile).length,
    skippedAnon: results.filter((r) => r.skipped === "anonymous").length,
    skippedFresh: results.filter((r) => r.skipped === "fresh").length,
    failed: results.filter((r) => r.error).length,
  };
}

/** 供 ContentDb 判断 TTL 的默认实现（fetchedAt + TTL 小时数） */
export function defaultIsFresh(fetchedAt: string | null): boolean {
  if (!fetchedAt) return false;
  const ttlMs = USER_PROFILE_TTL_HOURS * 60 * 60 * 1000;
  const fetched = new Date(fetchedAt).getTime();
  if (Number.isNaN(fetched)) return false;
  return Date.now() - fetched < ttlMs;
}

// ════════════ 特殊头衔（docs/06，独立于普通资料） ════════════

/**
 * 批量查询用户特殊头衔（单/多 uid 统一入口）。
 *
 * 数据源：POST /user/ajax_tquery.json，body `list[]=uid1&list[]=uid2`（批量）。
 * 分批次调用（TITLES_BATCH_SIZE），避免超大请求体。
 *
 * @param uids 目标 uid 列表（单个也可）
 * @param repo 数据访问实现（默认 HTTP）
 * @returns Map<uid, string[]>（头衔名数组；无头衔用户为空数组）
 */
export async function fetchUserTitles(
  uids: string[],
  repo: UserRepository = new HttpUserRepository(),
): Promise<Map<string, string[]>> {
  requireLogin();

  const titles = new Map<string, string[]>();
  const realUids = uids.filter((u) => !isAnonUid(u)); // 匿名占位名跳过
  if (realUids.length === 0) return titles;

  for (let i = 0; i < realUids.length; i += TITLES_BATCH_SIZE) {
    const batch = realUids.slice(i, i + TITLES_BATCH_SIZE);
    const body = batch.map((u) => `list[]=${encodeURIComponent(u)}`).join("&");
    try {
      const raw = await repo.post(repo.titlesUrl(), body);
      for (const uid of batch) {
        titles.set(uid, parseUserTitles(uid, raw));
      }
    } catch (err) {
      logWarn(
        "crawl",
        { message: "特殊头衔批量抓取失败", uids: batch.join(","), error: err instanceof Error ? err.message : String(err) },
        "crawler.user",
      );
    }
  }
  return titles;
}

/** 全量头衔更新结果 */
export interface UpdateAllTitlesResult {
  /** 实际抓取并更新的用户数 */
  updated: number;
  /** 因 TTL 未过期跳过的用户数 */
  skippedFresh: number;
  /** 匿名跳过数 */
  skippedAnon: number;
  /** 失败数 */
  failed: number;
  errors: string[];
}

/**
 * 全量更新数据库中全部用户特殊头衔（docs/06 头衔全量模式）。
 *
 * 从 user 表收集全部 uid → fetchUserTitles 批量查 → 更新 user.profile.title。
 * 带 TTL 去重（defaultIsFresh，默认 72h）；force=true 强制全量。
 *
 * @param db   ContentDb 实例（用于读 uid 列表 + 写回 title）
 * @param repo 数据访问实现（默认 HTTP）
 * @param opts { force? } — force=true 忽略 TTL
 */
export async function updateAllUserTitles(
  db: {
    getAllUserUidsWithFetchedAt(): Array<{ uid: string; profileFetchedAt: string | null }>;
    getUserProfile(uid: string): unknown | null;
    upsertUserProfile(uid: string, profile: unknown): void;
  },
  repo: UserRepository = new HttpUserRepository(),
  opts: { force?: boolean } = {},
): Promise<UpdateAllTitlesResult> {
  requireLogin();

  const force = opts.force ?? false;
  const all = db.getAllUserUidsWithFetchedAt();
  const result: UpdateAllTitlesResult = { updated: 0, skippedFresh: 0, skippedAnon: 0, failed: 0, errors: [] };

  // 1. 过滤：匿名 + TTL 未过期
  const targets: string[] = [];
  for (const { uid, profileFetchedAt } of all) {
    if (isAnonUid(uid)) {
      result.skippedAnon++;
      continue;
    }
    if (!force && defaultIsFresh(profileFetchedAt)) {
      result.skippedFresh++;
      continue;
    }
    targets.push(uid);
  }
  if (targets.length === 0) return result;

  // 2. 批量查头衔
  const titles = await fetchUserTitles(targets, repo);

  // 3. 更新 user.profile.title（保留 profile 其他字段）
  for (const uid of targets) {
    const t = titles.get(uid);
    if (t === undefined) {
      // 该用户整批抓取失败（fetchUserTitles 已记日志）
      result.failed++;
      result.errors.push(uid);
      continue;
    }
    const profile = db.getUserProfile(uid) as (Record<string, unknown> & { uid?: string }) | null;
    if (profile) {
      db.upsertUserProfile(uid, { ...profile, title: t });
    } else {
      // 无主体资料但有 uid → 建最小 profile（仅 title + uid）
      db.upsertUserProfile(uid, { uid, title: t, nickname: "", fetchedAt: new Date().toISOString() });
    }
    result.updated++;
  }
  return result;
}
