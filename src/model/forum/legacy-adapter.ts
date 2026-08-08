import type { ForumTreeNode } from "../../models/index.js";
import { ForumRootNode } from "./forum-root-node.js";
import { SectionNode } from "./section-node.js";
import { BoardNode } from "./board-node.js";
import type { UserRef } from "../user/user-ref.js";

function toManagerRefs(names: readonly string[]): UserRef[] {
  const refs = new Map<string, UserRef>();
  for (const name of names) {
    const uid = name.trim();
    if (!uid || /^IWhisper#\d+$/.test(uid)) continue;
    refs.set(uid, { uid, displayName: uid });
  }
  return [...refs.values()];
}

/**
 * 将旧的可序列化 ForumTreeNode 快照水合为新的 ForumNode 实体。
 * 这是迁移兼容层：旧 JSON 格式不变，新的实体方法在运行时恢复。
 */
export function forumRootFromLegacyTree(
  tree: readonly ForumTreeNode[],
  baseUrl = "",
): ForumRootNode {
  function convert(node: ForumTreeNode): SectionNode | BoardNode {
    if (node.type === "board") {
      return new BoardNode({
        id: node.id,
        name: node.name,
        ename: node.board.ename,
        depth: node.level,
        managers: toManagerRefs(node.board.manager),
      });
    }
    return new SectionNode({
      id: node.id,
      name: node.name,
      ename: null,
      depth: node.level,
      nodes: node.children.map(convert),
    });
  }

  const root = new ForumRootNode({
    id: "forum-root",
    name: "Forum",
    ename: null,
    depth: 0,
    baseUrl,
    nodes: tree.map(convert),
  });
  root.refreshDerivedState();
  return root;
}
