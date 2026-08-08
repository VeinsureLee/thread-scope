/**
 * crawl/user 统一出口。
 *
 * 身份解析是【唯一权威】（docs/01 §4.4）：article / content 的作者解析复用此模块。
 * 工具层只走 index.ts，不直接 import parser.ts。
 */
export {
  parseAuthor,
  parseUserProfile,
  parseUserTitles,
  mergeTitles,
  profileToUser,
  isAnonUid,
} from "./parser.js";
export {
  fetchUserProfile,
  fetchUserProfiles,
  fetchUserTitles,
  updateAllUserTitles,
  profileValues,
  profileStats,
  defaultIsFresh,
} from "./service.js";
export type { FetchUserProfileResult, UpdateAllTitlesResult } from "./service.js";
export type { UserRepository } from "./repository.js";
export { HttpUserRepository } from "./repository.js";
export type { User, UserProfile } from "../../models/index.js";
