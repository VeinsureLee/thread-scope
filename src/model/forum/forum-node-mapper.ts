import type { ForumNode } from "./forum-node.js";
import { ForumRootNode as Root } from "./forum-root-node.js";
import { SectionNode as Section } from "./section-node.js";
import { BoardNode as Board } from "./board-node.js";
import type { ForumNodeSnapshot } from "./forum-node-snapshot.js";

/**
 * ForumNode 实体 <-> 快照 DTO 的 Mapper（文档 §1.7）。
 *
 * 写入前用 toSnapshot 序列化，读取后用 fromSnapshot 重新水合为类实例，
 * 保证运行时具有 createSearchArticlesPlan() 等方法。
 */
export class ForumNodeMapper {
  static toSnapshot(node: ForumNode): ForumNodeSnapshot {
    const base: ForumNodeSnapshot = {
      id: node.id,
      type: node.type,
      name: node.name,
      ename: node.ename,
      depth: node.depth,
      managers: node.managers.map((m) => ({ ...m })),
      traffic: node.traffic ? { ...node.traffic } : null,
      trafficUpdatedAt: node.trafficUpdatedAt,
      parentSectionId: node.parentSectionId,
    };
    if (node instanceof Root) {
      base.baseUrl = node.baseUrl;
      base.nodes = node.nodes.map((child) => ForumNodeMapper.toSnapshot(child));
    } else if (node instanceof Section) {
      base.nodes = node.nodes.map((child) => ForumNodeMapper.toSnapshot(child));
    }
    return base;
  }

  static fromSnapshot(snapshot: ForumNodeSnapshot): ForumNode {
    if (snapshot.type === "board") {
      return new Board({
        id: snapshot.id,
        name: snapshot.name,
        ename: snapshot.ename ?? "",
        depth: snapshot.depth,
        managers: snapshot.managers,
        traffic: snapshot.traffic,
        trafficUpdatedAt: snapshot.trafficUpdatedAt,
        parentSectionId: snapshot.parentSectionId ?? null,
      });
    }
    if (snapshot.type === "section") {
      return new Section({
        id: snapshot.id,
        name: snapshot.name,
        ename: snapshot.ename,
        depth: snapshot.depth,
        managers: snapshot.managers,
        traffic: snapshot.traffic,
        trafficUpdatedAt: snapshot.trafficUpdatedAt,
        parentSectionId: snapshot.parentSectionId ?? null,
        nodes: (snapshot.nodes ?? []).map((child) => ForumNodeMapper.fromSnapshot(child)),
      });
    }
    return new Root({
      id: snapshot.id,
      name: snapshot.name,
      ename: snapshot.ename,
      depth: snapshot.depth,
      managers: snapshot.managers,
      traffic: snapshot.traffic,
      trafficUpdatedAt: snapshot.trafficUpdatedAt,
      parentSectionId: snapshot.parentSectionId ?? null,
      baseUrl: snapshot.baseUrl,
      nodes: (snapshot.nodes ?? []).map((child) => ForumNodeMapper.fromSnapshot(child)),
    });
  }
}
