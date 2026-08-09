import type { UserProfile } from "../user/user-profile.js";

/**
 * 用户（user）DTO — 作者身份（持久化形态）。
 *
 * 对应 DB 表 forum-content.db 的 user 表（docs/02 §3.4）。
 * 只放持久真实身份；匿名占位名（IWhisper#xxx）永不进入该表。
 * 与领域实体 User（model/user/user.ts）区分：这是可序列化的持久化形态。
 */
export interface User {
  /** 站点用户标识，如 "/user/query/123" 提取的 "user_a"（唯一） */
  uid: string;
  /** 用户名（昵称） */
  name: string;
  /** 是否匿名注册身份（悄悄话版特殊，默认 false） */
  isAnon: boolean;
  /** 头像 URL（可空） */
  avatar: string | null;
  /** 用户资料（query.json + tquery 合并，可空） */
  profile?: UserProfile | null;
  /** 资料更新时间 */
  updatedAt: string;
}

/** 用户名（nickname）空时的回退值 */
export const USER_DEFAULT_NICKNAME = "";
/** 特殊头衔空时的回退（无头衔 → 空数组，与弹窗「暂无」语义一致） */
export const USER_NO_TITLE: string[] = [];
