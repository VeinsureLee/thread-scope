import { requireLogin } from "../../../auth/auth.js";
import {
  fetchUserProfiles,
  profileStats,
  profileValues,
  defaultIsFresh,
} from "../../../view/user/index.js";
import type { FetchUserProfileResult } from "../../../view/user/index.js";
import type { UserProfile } from "../../../model/dto/index.js";
import { ContentDb } from "../../../storage/content-db.js";
import type { ContentStorePort } from "../../../model/index.js";

export interface FetchUserProfilesUseCaseResult {
  readonly targets: string[];
  readonly results: FetchUserProfileResult[];
  readonly profiles: UserProfile[];
  readonly stats: ReturnType<typeof profileStats>;
  readonly persisted: boolean;
}

export async function fetchUserProfilesUseCase(
  input: {
    uids?: string | string[];
    concurrency: number;
    force?: boolean;
    persist?: boolean;
    store?: ContentStorePort;
  },
): Promise<FetchUserProfilesUseCaseResult> {
  requireLogin();
  const uidList = typeof input.uids === "string" ? [input.uids] : input.uids;
  const db = input.store ?? new ContentDb();
  try {
    const targets = uidList && uidList.length > 0 ? uidList : db.getAllUserUids();
    if (targets.length === 0) {
      return {
        targets,
        results: [],
        profiles: [],
        stats: { success: 0, skippedAnon: 0, skippedFresh: 0, failed: 0 },
        persisted: input.persist ?? true,
      };
    }

    const results = await fetchUserProfiles(targets, {
      concurrency: input.concurrency,
      force: input.force,
      isFresh: (uid) => defaultIsFresh(db.getUserProfileFetchedAt(uid)),
    });
    const profiles = profileValues(results);
    const persist = input.persist ?? true;
    if (persist) {
      for (const result of results) {
        if (result.profile) db.upsertUserProfile(result.uid, result.profile);
      }
    }
    return { targets, results, profiles, stats: profileStats(results), persisted: persist };
  } finally {
    if (!input.store) db.close?.();
  }
}
