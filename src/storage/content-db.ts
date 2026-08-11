import * as fs from "fs";
import type { DatabaseSync } from "node:sqlite";
import { openDb, dbFilePath } from "./db-common.js";
import { runMigrations } from "./migrations/index.js";
import { FtsIndex } from "./content/fts-index.js";
import { UserRepo } from "./content/user-repo.js";
import { ArticleRepo } from "./content/article-repo.js";
import { PostRepo } from "./content/post-repo.js";
import { repairLegacyPosts } from "./content/repairs.js";
import type { ArticleRow, Post } from "../model/dto/index.js";
import type { Thread } from "../model/index.js";

/**
 * 内容库门面（forum-content.db）。
 *
 * 职责编排（docs/02 §3）：开库 + 版本化迁移 + 装配领域仓储，暴露统一 API。
 * 具体 SQL/行类型按领域拆分到 content/（user/article/post 仓储）与
 * migrations/（schema 演进，PRAGMA user_version 记录版本，只跑一次）。
 * 跨域聚合写入（saveThreadModel）委托 PostRepo 事务编排。
 */
export class ContentDb {
  private db: DatabaseSync;
  /** 实际 db 文件绝对路径（维护统计用） */
  private readonly dbPath: string;

  private fts: FtsIndex;
  private users: UserRepo;
  private articles: ArticleRepo;
  private posts: PostRepo;

  constructor(dbPath?: string) {
    this.dbPath = dbFilePath(dbPath ?? "forum-content.db");
    this.db = openDb(this.dbPath);
    // 版本化迁移：只执行未应用的版本（PRAGMA user_version），失败整体回滚
    runMigrations(this.db);
    // 启动期幂等数据修复（脏帖清洗，依赖 v5 补列）
    repairLegacyPosts(this.db);
    // 领域仓储装配（FTS 可降级：失败仅回退 LIKE 搜索）
    this.fts = new FtsIndex(this.db);
    this.users = new UserRepo(this.db);
    this.articles = new ArticleRepo(this.db, this.fts);
    this.posts = new PostRepo(this.db, this.fts, this.users, this.articles);
  }

  // ════════════ 版块 / 文章（board / article 域） ════════════

  upsertBoard(ename: string, name: string, isAnonymous: boolean): void {
    this.articles.upsertBoard(ename, name, isAnonymous);
  }

  upsertArticle(article: ArticleRow): number {
    return this.articles.upsertArticle(article);
  }

  upsertArticles(articles: ArticleRow[]): number {
    return this.articles.upsertArticles(articles);
  }

  findArticleIdByUrl(url: string): number | null {
    return this.articles.findArticleIdByUrl(url);
  }

  hasThreadContent(articleId: number): boolean {
    return this.articles.hasThreadContent(articleId);
  }

  searchArticles(
    keyword: string,
    opts: Parameters<ArticleRepo["searchArticles"]>[1] = {},
  ): ArticleRow[] {
    return this.articles.searchArticles(keyword, opts);
  }

  // ════════════ 用户（user 域） ════════════

  upsertUser(user: Parameters<UserRepo["upsertUser"]>[0]): number {
    return this.users.upsertUser(user);
  }

  upsertUsers(users: Parameters<UserRepo["upsertUsers"]>[0]): Map<string, number> {
    return this.users.upsertUsers(users);
  }

  upsertUserProfile(uid: string, profile: unknown, fetchedAt?: string): void {
    this.users.upsertUserProfile(uid, profile, fetchedAt);
  }

  setUserManager(uid: string): void {
    this.users.setUserManager(uid);
  }

  isManager(uid: string): boolean {
    return this.users.isManager(uid);
  }

  getUserId(uid: string): number | null {
    return this.users.getUserId(uid);
  }

  getUserProfile(uid: string): unknown | null {
    return this.users.getUserProfile(uid);
  }

  getUserProfileFetchedAt(uid: string): string | null {
    return this.users.getUserProfileFetchedAt(uid);
  }

  getAllUserUids(): string[] {
    return this.users.getAllUserUids();
  }

  getAllUserUidsWithFetchedAt(): Array<{ uid: string; profileFetchedAt: string | null }> {
    return this.users.getAllUserUidsWithFetchedAt();
  }

  getUserThreads(
    uid: string,
    opts: Parameters<UserRepo["getUserThreads"]>[1] = {},
  ): Array<{
    boardEname: string;
    articleTitle: string;
    articleUrl: string;
    floor: number;
    kind: "article" | "reply";
    postTime: string | null;
    content: string;
  }> {
    return this.users.getUserThreads(uid, opts);
  }

  // ════════════ 帖子 / 线程（post 域，含跨域聚合写入） ════════════

  saveThread(
    boardEname: string,
    articleMeta: { url: string; title: string },
    authors: Array<{ uid: string; name: string; isAnon?: boolean }>,
    firstPost: Post,
    replies: Post[],
  ): number {
    return this.posts.saveThread(boardEname, articleMeta, authors, firstPost, replies);
  }

  saveThreadModel(thread: Thread): number {
    return this.posts.saveThreadModel(thread);
  }

  getThreadPosts(articleId: number): Post[] {
    return this.posts.getThreadPosts(articleId);
  }

  searchThreadsContent(
    keyword: string,
    opts: Parameters<PostRepo["searchThreadsContent"]>[1] = {},
  ): Array<{
    boardEname: string;
    articleTitle: string;
    articleUrl: string;
    floor: number;
    kind: "article" | "reply";
    authorRaw: string;
    content: string;
    postTime: string | null;
  }> {
    return this.posts.searchThreadsContent(keyword, opts);
  }

  // ════════════ 维护 ════════════

  /** 重建 FTS5 索引（bigram 预切分重灌；维护脚本 npm run maintain 调用）。 */
  rebuildFts(): void {
    this.fts.rebuild();
  }

  /** 维护统计：各表行数 + 最新抓取时间 + 文件大小（维护脚本输出用） */
  stats(): {
    board: number;
    article: number;
    post: number;
    user: number;
    latestCrawledAt: string | null;
    fileBytes: number;
  } {
    const count = (table: string): number =>
      (this.db.prepare(`SELECT count(*) AS c FROM ${table}`).get() as { c: number }).c;
    const latest = this.db
      .prepare(
        `SELECT MAX(crawled_at) AS m FROM (SELECT crawled_at FROM article UNION ALL SELECT crawled_at FROM post)`,
      )
      .get() as { m: string | null };
    let fileBytes = 0;
    try {
      fileBytes = fs.statSync(this.dbPath).size;
    } catch {
      fileBytes = 0;
    }
    return {
      board: count("board"),
      article: count("article"),
      post: count("post"),
      user: count("user"),
      latestCrawledAt: latest.m,
      fileBytes,
    };
  }

  /** 关闭连接 */
  close(): void {
    this.db.close();
  }
}
