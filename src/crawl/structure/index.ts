// ============================================================
// structure 模块统一出口
// ============================================================

export {
  loadCachedTree,
  fetchForumTree,
  fetchNodeChildren,
} from "./service.js";
export type { ForumTreeNode } from "../../models/index.js";

// ============================================================
// 底层算法导出（供高级用法 / 测试注入 repository）
// ============================================================

export { crawlNodeTree } from "./tree.js";
export type { SectionRepository, AjaxEntry } from "./repository.js";
