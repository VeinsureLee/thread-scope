/** SQLite 存储行类型（snake_case，与 TS 命名不同），仅限 storage/content 内部使用。 */

export interface PostRow {
  id: number;
  article_id: number;
  parent_id: number | null;
  parent_floor?: number | null;
  floor: number;
  kind: "article" | "reply";
  author_uid: number | null;
  author_raw: string;
  is_anon: number;
  content: string;
  images: string;
  post_time: string | null;
  crawled_at: string;
}
