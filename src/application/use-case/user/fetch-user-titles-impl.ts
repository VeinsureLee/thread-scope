import { requireLogin } from "../../../auth/auth.js";
import { fetchUserTitles, updateAllUserTitles } from "../../../view/user/index.js";
import { ContentDb } from "../../../storage/content-db.js";
import type { ContentStorePort } from "../../../model/index.js";

export type FetchUserTitlesUseCaseResult =
  | { readonly mode: "selected"; readonly uids: string[]; readonly titles: Map<string, string[]> }
  | { readonly mode: "all"; readonly stats: Awaited<ReturnType<typeof updateAllUserTitles>> };

export async function fetchUserTitlesUseCase(input: {
  uids?: string | string[];
  force?: boolean;
  store?: ContentStorePort;
}): Promise<FetchUserTitlesUseCaseResult> {
  requireLogin();
  const uids = typeof input.uids === "string" ? [input.uids] : input.uids;
  const db = input.store ?? new ContentDb();
  try {
    if (uids && uids.length > 0) {
      const titles = await fetchUserTitles(uids);
      for (const uid of uids) {
        const title = titles.get(uid);
        if (title === undefined) continue;
        const profile = db.getUserProfile(uid) as (Record<string, unknown> & { uid?: string }) | null;
        db.upsertUserProfile(
          uid,
          profile
            ? { ...profile, title }
            : { uid, title, nickname: "", fetchedAt: new Date().toISOString() },
        );
      }
      return { mode: "selected", uids, titles };
    }
    return {
      mode: "all",
      stats: await updateAllUserTitles(db, undefined, { force: input.force }),
    };
  } finally {
    if (!input.store) db.close?.();
  }
}
