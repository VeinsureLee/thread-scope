import type { UserProfile } from "./user-profile.js";
import type { UserRef } from "./user-ref.js";

/**
 * 真实用户实体及资料。
 *
 * 约束（docs/07 §1.4）：
 * - `uid` 是实体唯一标识，显示名不是主键；
 * - 匿名占位身份不进入真实用户表；
 * - 版主不是独立表/独立模型，只是 `isManager=true`；
 * - 特殊头衔属于 `UserProfile.title[]`，通过批量头衔接口补充；
 * - 列表页只有 uid/显示名时只建立 UserRef 或最小 User；不得用空字段覆盖已抓取的完整资料。
 */
export class User {
  readonly uid: string;
  displayName: string;
  isAnonymous: boolean;
  avatar: string | null;
  profile: UserProfile | null;
  isManager: boolean;
  profileFetchedAt: string | null;
  updatedAt: string;

  constructor(options: {
    uid: string;
    displayName?: string;
    isAnonymous?: boolean;
    avatar?: string | null;
    profile?: UserProfile | null;
    isManager?: boolean;
  }) {
    this.uid = options.uid;
    this.displayName = options.displayName ?? options.uid;
    this.isAnonymous = options.isAnonymous ?? false;
    this.avatar = options.avatar ?? null;
    this.profile = options.profile ?? null;
    this.isManager = options.isManager ?? false;
    this.profileFetchedAt = options.profile?.fetchedAt ?? null;
    this.updatedAt = new Date().toISOString();
  }

  /** 合并完整资料（不覆盖 uid/name 以外已有字段为空的场景）；同时更新抓取时间。 */
  mergeProfile(profile: UserProfile): void {
    this.profile = profile;
    this.profileFetchedAt = profile.fetchedAt ?? new Date().toISOString();
    if (profile.nickname) this.displayName = profile.nickname;
    if (profile.avatar) this.avatar = profile.avatar;
    this.updatedAt = new Date().toISOString();
  }

  /** 标记为版主（版主不是独立实体，仅是用户属性）。 */
  markAsManager(): void {
    this.isManager = true;
  }

  /** 资料是否在 TTL 内（未抓取过则视为不新鲜）。 */
  isProfileFresh(now: Date, ttlMs: number): boolean {
    if (!this.profileFetchedAt) return false;
    const fetched = new Date(this.profileFetchedAt).getTime();
    if (Number.isNaN(fetched)) return false;
    return now.getTime() - fetched < ttlMs;
  }

  /** 转为轻量引用（避免把完整 User 重复嵌入多个节点）。 */
  toRef(): UserRef {
    return { uid: this.uid, displayName: this.displayName };
  }
}
