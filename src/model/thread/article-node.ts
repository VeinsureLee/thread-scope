import type { UserRef } from "../user/user-ref.js";
import { bfs, dfs } from "../algorithm/common/traversal.js";

export type ArticleNodeKind = "article" | "reply";

export interface LocalPostQuery {
  readonly keyword?: string;
  readonly authorUid?: string;
  readonly forumFloor?: number;
}

export interface ArticleNodeOptions {
  readonly id: string;
  readonly kind: ArticleNodeKind;
  readonly title?: string | null;
  readonly content: string;
  readonly author?: UserRef | null;
  readonly authorRaw: string;
  readonly isAnonymous: boolean;
  readonly forumFloor: number;
  readonly replyDepth?: number;
  readonly parentId?: string | null;
  readonly children?: readonly ArticleNode[];
  readonly images?: readonly string[];
  readonly postedAt?: string | null;
  /** 客户端类型（"手机客户端" | "网页" | null） */
  readonly client?: string | null;
  /** 来源 IP（匿名 → null） */
  readonly ip?: string | null;
}

export class ArticleNode {
  readonly id: string;
  readonly kind: ArticleNodeKind;
  title: string | null;
  content: string;
  author: UserRef | null;
  authorRaw: string;
  isAnonymous: boolean;
  readonly forumFloor: number;
  replyDepth: number;
  parentId: string | null;
  readonly children: ArticleNode[];
  images: string[];
  postedAt: string | null;
  client: string | null;
  ip: string | null;

  constructor(options: ArticleNodeOptions) {
    this.id = options.id;
    this.kind = options.kind;
    this.title = options.title ?? null;
    this.content = options.content;
    this.author = options.author ?? null;
    this.authorRaw = options.authorRaw;
    this.isAnonymous = options.isAnonymous;
    this.forumFloor = options.forumFloor;
    this.replyDepth = options.replyDepth ?? 0;
    this.parentId = options.parentId ?? null;
    this.children = [...(options.children ?? [])];
    this.images = [...(options.images ?? [])];
    this.postedAt = options.postedAt ?? null;
    this.client = options.client ?? null;
    this.ip = options.ip ?? null;
    for (const child of this.children) child.setParent(this.id, this.replyDepth + 1);
  }

  private setParent(parentId: string, replyDepth: number): void {
    this.parentId = parentId;
    this.replyDepth = replyDepth;
    for (const child of this.children) child.setParent(this.id, replyDepth + 1);
  }

  addReply(reply: ArticleNode): void {
    if (reply.id === this.id || this.findById(reply.id)) {
      throw new Error(`ArticleNode 重复: ${reply.id}`);
    }
    reply.setParent(this.id, this.replyDepth + 1);
    this.children.push(reply);
  }

  updateContent(patch: Partial<Pick<ArticleNode, "title" | "content" | "author" | "images" | "postedAt" | "client" | "ip">>): void {
    if (patch.title !== undefined) this.title = patch.title;
    if (patch.content !== undefined) this.content = patch.content;
    if (patch.author !== undefined) this.author = patch.author;
    if (patch.images !== undefined) this.images = [...patch.images];
    if (patch.postedAt !== undefined) this.postedAt = patch.postedAt;
    if (patch.client !== undefined) this.client = patch.client;
    if (patch.ip !== undefined) this.ip = patch.ip;
  }

  findById(id: string, order: "dfs" | "bfs" = "dfs"): ArticleNode | null {
    const adapter = { childrenOf: (node: ArticleNode): readonly ArticleNode[] => node.children };
    const roots: ArticleNode[] = [this];
    const nodes = order === "dfs" ? dfs(roots, adapter) : bfs(roots, adapter);
    return nodes.find((node) => node.id === id) ?? null;
  }

  searchLocal(query: LocalPostQuery, order: "dfs" | "bfs" = "dfs"): ArticleNode[] {
    const keyword = query.keyword?.trim().toLocaleLowerCase();
    const adapter = { childrenOf: (node: ArticleNode): readonly ArticleNode[] => node.children };
    const roots: ArticleNode[] = [this];
    const nodes = order === "dfs" ? dfs(roots, adapter) : bfs(roots, adapter);
    return nodes.filter((node) => {
      if (query.authorUid && node.author?.uid !== query.authorUid) return false;
      if (query.forumFloor !== undefined && node.forumFloor !== query.forumFloor) return false;
      if (keyword && !`${node.title ?? ""}\n${node.content}`.toLocaleLowerCase().includes(keyword)) return false;
      return true;
    });
  }
}
