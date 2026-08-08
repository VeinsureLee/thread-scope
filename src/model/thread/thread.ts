import type { UserRef } from "../user/user-ref.js";
import type { ArticleOverview } from "./article-overview.js";
import { ArticleNode } from "./article-node.js";

export type { ArticleOverview } from "./article-overview.js";

export type ThreadContentState = "overview-only" | "partial" | "complete";

export interface ThreadMergeResult {
  readonly added: number;
  readonly updated: number;
  readonly ignored: number;
}

export class Thread {
  readonly id: string;
  readonly boardEname: string;
  overview: ArticleOverview;
  root: ArticleNode | null = null;
  contentState: ThreadContentState = "overview-only";
  contentFetchedAt: string | null = null;
  updatedAt: string;

  private constructor(overview: ArticleOverview) {
    this.id = overview.articleId;
    this.boardEname = overview.boardEname;
    this.overview = overview;
    this.updatedAt = new Date().toISOString();
  }

  static create(overview: ArticleOverview): Thread {
    return new Thread(overview);
  }

  mergeOverview(next: ArticleOverview): void {
    if (next.articleId !== this.id || next.boardEname !== this.boardEname) {
      throw new Error("不能把不同文章合并到同一个 Thread");
    }
    this.overview = next;
    this.updatedAt = new Date().toISOString();
  }

  replaceContent(root: ArticleNode, state: Exclude<ThreadContentState, "overview-only">): void {
    if (root.kind !== "article") throw new Error("Thread root 必须是 kind=article 的首帖");
    this.root = root;
    this.contentState = state;
    this.contentFetchedAt = new Date().toISOString();
    this.updatedAt = this.contentFetchedAt;
  }

  /** 将新抓取的节点幂等合并到已有内容树。网络抓取由 Controller 在外部完成。 */
  mergeContent(nodes: readonly ArticleNode[]): ThreadMergeResult {
    let added = 0;
    let updated = 0;
    let ignored = 0;
    for (const next of nodes) {
      if (!this.root) {
        if (next.kind === "article") {
          this.root = next;
          added++;
        } else {
          ignored++;
        }
        continue;
      }
      const existing = this.root.findById(next.id);
      if (existing) {
        existing.updateContent({
          title: next.title,
          content: next.content,
          author: next.author,
          images: next.images,
          postedAt: next.postedAt,
        });
        updated++;
        continue;
      }
      const parent = next.parentId ? this.root.findById(next.parentId) : this.root;
      if (parent) {
        parent.addReply(next);
        added++;
      } else {
        ignored++;
      }
    }
    if (this.root) {
      this.contentState = "partial";
      this.contentFetchedAt = new Date().toISOString();
      this.updatedAt = this.contentFetchedAt;
    }
    return { added, updated, ignored };
  }

  findPost(id: string): ArticleNode | null {
    return this.root?.findById(id) ?? null;
  }

  searchPosts(query: Parameters<ArticleNode["searchLocal"]>[0]): ArticleNode[] {
    return this.root?.searchLocal(query) ?? [];
  }
}
