import { requireLogin } from "../../../auth/auth.js";
import {
  fetchForumTree,
  fetchNodeChildren,
  loadCachedTree,
} from "../../../view/structure/index.js";
import type { ForumTreeNode } from "../../../models/index.js";
import type { StructureViewPort } from "../../../model/index.js";

export type FetchStructureResult =
  | { readonly kind: "children"; readonly nodes: ForumTreeNode[] }
  | { readonly kind: "tree"; readonly nodes: ForumTreeNode[]; readonly cached: boolean };

/** 结构查询用例：缓存策略和登录边界集中在 Application 层。 */
export async function fetchStructure(options: {
  parentId?: string;
  refresh?: boolean;
  view?: StructureViewPort;
} = {}): Promise<FetchStructureResult> {
  const view = options.view ?? {
    fetchForumTree,
    fetchNodeChildren,
    loadCachedTree,
  } satisfies StructureViewPort;
  if (options.parentId) {
    requireLogin();
    return { kind: "children", nodes: await view.fetchNodeChildren(options.parentId) };
  }

  if (!options.refresh) {
    const cached = view.loadCachedTree();
    if (cached) return { kind: "tree", nodes: cached, cached: true };
  }
  return { kind: "tree", nodes: await view.fetchForumTree({ refresh: true }), cached: false };
}
