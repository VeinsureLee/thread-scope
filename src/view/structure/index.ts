import * as structureCrawl from "../../crawl/structure/index.js";
import type { StructureViewPort } from "../../model/index.js";

/** Structure View：读取结构页面/JSON，并转换成 ForumTreeNode DTO。 */
export function loadCachedTree(): ReturnType<typeof structureCrawl.loadCachedTree> {
  return structureCrawl.loadCachedTree();
}

export function fetchForumTree(options: { refresh?: boolean } = {}): ReturnType<typeof structureCrawl.fetchForumTree> {
  return structureCrawl.fetchForumTree(options);
}

export function fetchNodeChildren(parentId: string): ReturnType<typeof structureCrawl.fetchNodeChildren> {
  return structureCrawl.fetchNodeChildren(parentId);
}

export const structureView: StructureViewPort = {
  fetchForumTree,
  fetchNodeChildren,
  loadCachedTree,
};

export { structureCrawl as structureSource };
export const STRUCTURE_CACHE_FILE = structureCrawl.STRUCTURE_CACHE_FILE;
export type { SectionRepository, AjaxEntry } from "../../crawl/structure/index.js";
