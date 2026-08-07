/**
 * 用户（user）— 作者身份。
 *
 * 对应 DB 表 forum-content.db 的 user 表（docs/02 §3.4）。
 * 只放持久真实身份；匿名占位名（IWhisper#xxx）永不进入该表。
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
  /** 用户资料（弹窗解析，可空） */
  profile?: UserProfile | null;
  /** 资料更新时间 */
  updatedAt: string;
}

/** 用户资料（element-05，/user/query/{uid} 弹窗） */
export interface UserProfile {
  uid: string;
  /** 昵称 */
  nickname: string;
  /** 性别 */
  gender: string;
  /** 星座 */
  constellation: string;
  /** QQ / MSN / 主页 */
  qq: string;
  msn: string;
  homepage: string;
  /** 论坛属性 */
  level: string;
  title: string;
  postCount: string;
  points: string;
  vitality: string;
  lastLogin: string;
  lastIp: string;
  onlineStatus: string;
}
