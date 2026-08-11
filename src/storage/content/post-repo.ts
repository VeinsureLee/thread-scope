import type { DatabaseSync } from "node:sqlite";
import { transaction } from "../db-common.js";
import { shouldUseFts, ftsPhraseQuery } from "../fts-bigrams.js";
import type { Post } from "../../model/dto/index.js";
import type { Thread } from "../../model/index.js";
import { flattenArticleNodes } from "../mapper/index.js";
import type { FtsIndex } from "./fts-index.js";
import type { UserRepo } from "./user-repo.js";
import type { ArticleRepo } from "./article-repo.js";
import type { PostRow } from "./types.js";
import { hashUrl } from "./util.js";
import { appendCommonFilters, appendLimit } from "./search-common.js";

/**
 * 帖子域仓储（post 表）+ 线程聚合写入。
 * 跨域依赖：user（作者去重映射）、article（版块/文章行）、fts（正文索引同步）。
 */
export class PostRepo {
  constructor(
    private db: DatabaseSync,
    private fts: FtsIndex,
    private users: UserRepo,
    private articles: ArticleRepo,
  ) {}

  /**
   * 原子写入一篇文章的正文 + 评论 + 作者（docs/02 §4.1、§6）。
   * 单个事务：作者 INSERT OR IGNORE → 文章 upsert → posts（首帖+评论）。
   *
   * @returns 文章行 id（article 表）；失败/无作者信息时仍会写入 posts
   */
  saveThread(
    boardEname: string,
    articleMeta: { url: string; title: string },
    authors: Array<{ uid: string; name: string; isAnon?: boolean }>,
    firstPost: Post,
    replies: Post[],
  ): number {
    return transaction(this.db, () => {
      // 1. 作者
      const uidMap = this.users.upsertUsers(authors.filter((a) => a.uid));

      // 2. 文章（url_hash 为去重锚点）
      const urlHash = hashUrl(articleMeta.url);
      const now = new Date().toISOString();
      this.db
        .prepare(
          `INSERT OR IGNORE INTO article
             (board_ename, title, url, author_uid, is_pinned, crawled_at, updated_at, url_hash)
           VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
        )
        .run(boardEname, articleMeta.title, articleMeta.url, null, now, now, urlHash);
      const articleRow = this.db
        .prepare(`SELECT id FROM article WHERE url_hash = ?`)
        .get(urlHash) as { id: number } | undefined;
      if (!articleRow) return 0;
      const articleId = articleRow.id;
      this.fts.syncArticle(articleId, articleMeta.title);

      // 3. posts
      const insertPost = this.db.prepare(
        `INSERT OR IGNORE INTO post
           (article_id, parent_id, floor, kind, author_uid, author_raw, is_anon, content, images, post_time, client, ip, crawled_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const p of [firstPost, ...replies]) {
        insertPost.run(
          articleId,
          p.parentId ?? null,
          p.floor,
          p.kind,
          p.authorUid ? (uidMap.get(p.authorUid) ?? null) : null,
          p.authorRaw,
          p.isAnon ? 1 : 0,
          p.content,
          JSON.stringify(p.images),
          p.postTime,
          p.client ?? null,
          p.ip ?? null,
          now,
        );
      }

      this.fts.syncPost(articleId, [firstPost, ...replies]);

      return articleId;
    });
  }

  /**
   * 写入新的 Thread 聚合模型。
   *
   * 与旧 saveThread 保持并存：旧调用方仍使用扁平 Post；新 Controller 使用
   * Thread/ArticleNode，并在写入时把 ArticleNode.parentId 映射为 post 表的整数主键。
   */
  saveThreadModel(thread: Thread): number {
    return transaction(this.db, () => {
      this.articles.upsertBoard(thread.boardEname, thread.boardEname, false);

      const nodes = flattenArticleNodes(thread.root);

      const authors = new Map<string, { uid: string; name: string }>();
      if (thread.overview.author) {
        authors.set(thread.overview.author.uid, {
          uid: thread.overview.author.uid,
          name: thread.overview.author.displayName,
        });
      }
      if (thread.overview.lastReplier) {
        authors.set(thread.overview.lastReplier.uid, {
          uid: thread.overview.lastReplier.uid,
          name: thread.overview.lastReplier.displayName,
        });
      }
      for (const node of nodes) {
        if (node.author) {
          authors.set(node.author.uid, {
            uid: node.author.uid,
            name: node.author.displayName,
          });
        }
      }
      const uidMap = this.users.upsertUsers([...authors.values()]);
      const overview = thread.overview;
      const now = new Date().toISOString();
      const urlHash = hashUrl(overview.url);
      this.db
        .prepare(
          `INSERT INTO article
             (board_ename, title, url, author_uid, is_pinned, date, reply_count, last_reply,
              last_replier_uid, crawled_at, updated_at, url_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(url_hash) DO UPDATE SET
             title = excluded.title,
             author_uid = excluded.author_uid,
             is_pinned = excluded.is_pinned,
             date = excluded.date,
             reply_count = excluded.reply_count,
             last_reply = excluded.last_reply,
             last_replier_uid = excluded.last_replier_uid,
             updated_at = excluded.updated_at`,
        )
        .run(
          overview.boardEname,
          overview.title,
          overview.url,
          overview.author ? (uidMap.get(overview.author.uid) ?? null) : null,
          overview.isPinned ? 1 : 0,
          overview.date,
          overview.replyCount,
          overview.lastReplyAt ?? "",
          overview.lastReplier ? (uidMap.get(overview.lastReplier.uid) ?? null) : null,
          now,
          now,
          urlHash,
        );
      const articleRow = this.db
        .prepare(`SELECT id FROM article WHERE url_hash = ?`)
        .get(urlHash) as { id: number } | undefined;
      if (!articleRow) return 0;
      this.fts.syncArticle(articleRow.id, overview.title);

      const postIds = new Map<string, number>();
      const insertPost = this.db.prepare(
        `INSERT INTO post
           (article_id, parent_id, floor, kind, author_uid, author_raw, is_anon,
            content, images, post_time, client, ip, crawled_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(article_id, kind, floor) DO UPDATE SET
           parent_id = excluded.parent_id,
           author_uid = excluded.author_uid,
           author_raw = excluded.author_raw,
           is_anon = excluded.is_anon,
           content = excluded.content,
           images = excluded.images,
           post_time = excluded.post_time,
           client = excluded.client,
           ip = excluded.ip,
           crawled_at = excluded.crawled_at`,
      );
      for (const node of nodes) {
        const parentDbId = node.parentId ? (postIds.get(node.parentId) ?? null) : null;
        insertPost.run(
          articleRow.id,
          parentDbId,
          node.forumFloor,
          node.kind,
          node.author ? (uidMap.get(node.author.uid) ?? null) : null,
          node.authorRaw,
          node.isAnonymous ? 1 : 0,
          node.content,
          JSON.stringify(node.images),
          node.postedAt,
          node.client ?? null,
          node.ip ?? null,
          now,
        );
        const postRow = this.db
          .prepare(`SELECT id FROM post WHERE article_id = ? AND kind = ? AND floor = ?`)
          .get(articleRow.id, node.kind, node.forumFloor) as { id: number } | undefined;
        if (postRow) postIds.set(node.id, postRow.id);
      }
      this.fts.syncPost(
        articleRow.id,
        nodes.map((n) => ({ floor: n.forumFloor, kind: n.kind, content: n.content })),
      );
      return articleRow.id;
    });
  }

  /** 获取一篇文章的全部楼层（按楼层升序） */
  getThreadPosts(articleId: number): Post[] {
    const rows = this.db
      .prepare(
        `SELECT p.*, parent.floor AS parent_floor, u.uid AS author_uid_str
         FROM post p
         LEFT JOIN post parent ON parent.id = p.parent_id
         LEFT JOIN user u ON u.id = p.author_uid
        WHERE p.article_id = ?
        ORDER BY p.floor ASC`,
      )
      .all(articleId) as unknown as Array<PostRow & { author_uid_str: string | null }>;
    return rows.map(rowToPost);
  }

  /**
   * 本地搜索帖子正文（post 表内容；优先 FTS5 bigram 索引，短词回退 LIKE）。
   *
   * 缓存命中路径：之前抓取落库过的帖子正文，从这里秒回。
   *
   * @param keyword 关键字（FTS 短语匹配 + LIKE 兜底）
   * @param opts    { boardEnames?/boardEname? 限定版面；from?/to? 发帖时间窗口；
   *                 sort? recent/relevant；limit? 返回上限 }
   * @returns 命中楼层（含所属文章标题/url、楼层号、正文、作者）
   */
  searchThreadsContent(
    keyword: string,
    opts: {
      boardEname?: string;
      boardEnames?: readonly string[];
      from?: string;
      to?: string;
      limit?: number;
      sort?: "recent" | "relevant";
    } = {},
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
    const { limit, sort = "recent" } = opts;
    const useFts = shouldUseFts(keyword) && this.fts.enabled;

    const select = `
      SELECT a.board_ename, a.title AS article_title, a.url AS article_url,
             p.floor, p.kind, p.author_raw, p.content, p.post_time, p.client, p.ip
    `;
    const params: (string | number)[] = [];

    let sql: string;
    if (useFts) {
      sql = `${select}
        FROM post_fts
        JOIN post p ON p.id = post_fts.rowid
        JOIN article a ON a.id = p.article_id
        WHERE post_fts MATCH ?
          AND p.content LIKE ?`;
      params.push(ftsPhraseQuery(keyword)!, `%${keyword}%`);
    } else {
      sql = `${select}
        FROM post p
        JOIN article a ON a.id = p.article_id
        WHERE p.content LIKE ?`;
      params.push(`%${keyword}%`);
    }

    const filtered = appendCommonFilters(sql, params, opts, "p.post_time");
    sql = filtered.sql; // params 引用未变（原地 push）

    if (sort === "relevant" && useFts) {
      sql += ` ORDER BY bm25(post_fts) ASC`;
    } else if (sort === "relevant") {
      sql += ` ORDER BY CASE WHEN p.content LIKE ? THEN 0 ELSE 1 END, p.post_time DESC, p.id DESC`;
      params.push(`${keyword}%`);
    } else {
      sql += ` ORDER BY p.post_time DESC, p.id DESC`;
    }

    const limited = appendLimit(sql, params, limit);
    sql = limited.sql;

    const rows = this.db.prepare(sql).all(...params) as unknown as Array<{
      board_ename: string;
      article_title: string;
      article_url: string;
      floor: number;
      kind: "article" | "reply";
      author_raw: string;
      content: string;
      post_time: string | null;
      client: string | null;
      ip: string | null;
    }>;
    return rows.map((r) => ({
      boardEname: r.board_ename,
      articleTitle: r.article_title,
      articleUrl: r.article_url,
      floor: r.floor,
      kind: r.kind,
      authorRaw: r.author_raw,
      content: r.content,
      postTime: r.post_time,
      client: r.client,
      ip: r.ip,
    }));
  }
}

/** SQLite 行 → Post */
function rowToPost(r: PostRow & { author_uid_str: string | null }): Post {
  return {
    parentId: r.parent_floor ?? null,
    floor: r.floor,
    kind: r.kind,
    authorUid: r.author_uid_str,
    authorRaw: r.author_raw,
    isAnon: !!r.is_anon,
    content: r.content,
    images: safeParseImages(r.images),
    postTime: r.post_time,
    posText: "",
  };
}

/** 解析 images JSON（异常回退空数组） */
function safeParseImages(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}
