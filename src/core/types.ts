/** 论坛相关的共享类型定义 */

/** 分区（section），论坛的顶级分类 */
export interface Section {
  id: string;
  name: string;
}

/** 版块（board），隶属于某个分区 */
export interface Board {
  name: string;
  ename: string;
  manager: string;
  posts: string;
  threads: string;
}

/** 文章（article），版块中的帖子 */
export interface Article {
  title: string;
  url: string;
  author: string;
  date: string;
}
