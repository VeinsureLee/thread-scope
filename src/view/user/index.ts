import * as userCrawl from "../../crawl/user/index.js";
import type { UserRepository } from "../../crawl/user/index.js";
import type { UserViewPort } from "../../model/index.js";

/** User View：提供用户直连页面读取接口；批量并发策略由 Application 控制。 */
export function fetchUserProfile(uid: string, repo?: UserRepository): ReturnType<typeof userCrawl.fetchUserProfile> {
  return userCrawl.fetchUserProfile(uid, repo);
}

export function fetchUserProfiles(
  uids: string[],
  options: Parameters<typeof userCrawl.fetchUserProfiles>[1] = {},
  repo?: UserRepository,
): ReturnType<typeof userCrawl.fetchUserProfiles> {
  return userCrawl.fetchUserProfiles(uids, options, repo);
}

export function fetchUserTitles(uids: string[], repo?: UserRepository): ReturnType<typeof userCrawl.fetchUserTitles> {
  return userCrawl.fetchUserTitles(uids, repo);
}

export const updateAllUserTitles = userCrawl.updateAllUserTitles;
export const profileStats = userCrawl.profileStats;
export const profileValues = userCrawl.profileValues;
export const defaultIsFresh = userCrawl.defaultIsFresh;
export const userView: UserViewPort = { fetchUserProfile, fetchUserProfiles, fetchUserTitles };
export type { UserRepository, HttpUserRepository, FetchUserProfileResult } from "../../crawl/user/index.js";
