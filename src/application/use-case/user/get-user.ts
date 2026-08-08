import { requireLogin } from "../../../auth/auth.js";
import { fetchUserProfile, fetchUserTitles } from "../../../view/user/index.js";
import { ContentDb } from "../../../storage/content-db.js";
import type { ClosablePort, UserStorePort, UserViewPort } from "../../../model/index.js";

export interface GetUserResult {
  uid: string;
  profile: Record<string, unknown>;
  titles: string[];
  persisted: boolean;
}

/** 用户资料用例：单 uid 直连；不会调用 ForumNode 或 Search View。 */
export async function getUser(
  uid: string,
  options: {
    includeTitles?: boolean;
    persist?: boolean;
    view?: UserViewPort;
    store?: UserStorePort & ClosablePort;
  } = {},
): Promise<GetUserResult> {
  requireLogin();
  const profile = options.view ? await options.view.fetchUserProfile(uid) : await fetchUserProfile(uid);
  const titles = options.includeTitles === false
    ? []
    : ((await (options.view ? options.view.fetchUserTitles([uid]) : fetchUserTitles([uid]))).get(uid) ?? []);
  const merged = { ...profile, title: titles.length > 0 ? titles : profile.title } as unknown as Record<string, unknown>;
  const persist = options.persist ?? true;
  if (persist) {
    const db = options.store ?? new ContentDb();
    try {
      db.upsertUser({ uid, name: profile.nickname || uid, profile: merged });
    } finally {
      if (!options.store) db.close();
    }
  }
  return { uid, profile: merged, titles, persisted: persist };
}
