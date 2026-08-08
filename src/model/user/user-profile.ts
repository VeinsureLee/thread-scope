/**
 * 用户资料（UserProfile）。
 *
 * 数据源（docs/06 §2.2 / §2.4）：
 * - 主体字段（nickname~status）来自 `/user/query/{uid}.json`（query.json，单 uid 一请求）；
 * - `title`（特殊头衔，可多个）来自 `/user/ajax_tquery.json`（tquery，批量接口，POST `list[]=uid`）。
 */
export interface UserProfile {
  uid: string;
  /** 昵称（query.json: user_name） */
  nickname: string;
  /** 性别（query.json: gender，m/f → 男生/女生） */
  gender: string;
  /** 星座（query.json: astro） */
  constellation: string;
  /** QQ（query.json: qq，多数用户未填） */
  qq: string;
  /** MSN（query.json: msn，多数用户未填） */
  msn: string;
  /** 主页（query.json: home_page） */
  homepage: string;
  /** 头像 URL（query.json: face_url） */
  avatar: string;
  /** 论坛等级（query.json: level，如 用户/版主/站务） */
  level: string;
  /** 特殊头衔（tquery: path[].name，可多个；无头衔用户为空数组） */
  title: string[];
  /** 帖子总数（query.json: post_count，单位篇） */
  postCount: string;
  /** 积分（query.json: score） */
  points: string;
  /** 生命力（query.json: life） */
  vitality: string;
  /** 上次登录（query.json: last_login_time，unix 秒 → ISO 时间） */
  lastLogin: string;
  /** 最后访问 IP（query.json: last_login_ip，论坛已脱敏打星） */
  lastIp: string;
  /** 当前状态（query.json: status，如 目前不在站上） */
  onlineStatus: string;
  /** 是否在线（query.json: is_online） */
  isOnline: boolean;
  /** 关注数（query.json: follow_num） */
  followNum: number;
  /** 粉丝数（query.json: fans_num） */
  fansNum: number;
  /** 资料抓取时间（ISO，写入方记录，供 TTL 判断） */
  fetchedAt: string;
}
