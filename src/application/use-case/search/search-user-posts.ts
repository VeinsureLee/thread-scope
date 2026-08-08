import {
  searchArticlesUseCase,
  type SearchArticlesUseCaseOptions,
  type SearchArticlesUseCaseResult,
} from "./search-articles-use-case.js";

export function searchUserPosts(
  uid: string,
  options: Omit<SearchArticlesUseCaseOptions, "author" | "keyword" | "source"> = {},
): Promise<SearchArticlesUseCaseResult> {
  return searchArticlesUseCase({
    ...options,
    author: uid,
    source: "remote",
  });
}
