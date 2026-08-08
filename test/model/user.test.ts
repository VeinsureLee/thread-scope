import { describe, expect, it } from "vitest";
import { User } from "../../src/model/index.js";

describe("User 领域模型", () => {
  it("最小身份：uid 即显示名，非匿名，无资料", () => {
    const user = new User({ uid: "user_1" });
    expect(user.uid).toBe("user_1");
    expect(user.displayName).toBe("user_1");
    expect(user.isAnonymous).toBe(false);
    expect(user.profile).toBeNull();
    expect(user.isManager).toBe(false);
    expect(user.toRef()).toEqual({ uid: "user_1", displayName: "user_1" });
  });

  it("mergeProfile 合并完整资料并更新昵称/头像/抓取时间", () => {
    const user = new User({ uid: "user_1", displayName: "user_1" });
    user.mergeProfile({
      uid: "user_1",
      nickname: "真实昵称",
      gender: "男生",
      constellation: "",
      qq: "",
      msn: "",
      homepage: "",
      avatar: "/img/a.png",
      level: "用户",
      title: [],
      postCount: "",
      points: "",
      vitality: "",
      lastLogin: "",
      lastIp: "",
      onlineStatus: "",
      isOnline: false,
      followNum: 0,
      fansNum: 0,
      fetchedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(user.displayName).toBe("真实昵称");
    expect(user.avatar).toBe("/img/a.png");
    expect(user.profileFetchedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("markAsManager 置位版主标记", () => {
    const user = new User({ uid: "user_1" });
    user.markAsManager();
    expect(user.isManager).toBe(true);
  });

  it("isProfileFresh 按 TTL 判断", () => {
    const now = new Date("2026-01-02T00:00:00.000Z");
    const user = new User({
      uid: "user_1",
      profile: {
        uid: "user_1",
        nickname: "",
        gender: "",
        constellation: "",
        qq: "",
        msn: "",
        homepage: "",
        avatar: "",
        level: "",
        title: [],
        postCount: "",
        points: "",
        vitality: "",
        lastLogin: "",
        lastIp: "",
        onlineStatus: "",
        isOnline: false,
        followNum: 0,
        fansNum: 0,
        fetchedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    // 24h 内 → 新鲜
    expect(user.isProfileFresh(now, 72 * 60 * 60 * 1000)).toBe(true);
    // 7 天后 → 不新鲜
    const later = new Date("2026-01-09T00:00:00.000Z");
    expect(user.isProfileFresh(later, 72 * 60 * 60 * 1000)).toBe(false);
  });

  it("未抓取资料 → 不新鲜", () => {
    const user = new User({ uid: "user_1" });
    expect(user.isProfileFresh(new Date(), 1000)).toBe(false);
  });
});
