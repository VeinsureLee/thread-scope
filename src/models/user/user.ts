/**
 * 用户（user）— 作者身份。
 *
 * 对应 DB 表 forum-content.db 的 user 表（docs/02 §3.4）。
 * 只放持久真实身份；匿名占位名（IWhisper#xxx）永不进入该表。
 */
export interface User {
  /** 站点用户标识，如 "/user/query/123" 提取的 "user_a"（唯一） */
  uid: string;
  /** 用户名（昵称） */
  name: string;
  /** 是否匿名注册身份（悄悄话版特殊，默认 false） */
  isAnon: boolean;
  /** 头像 URL（可空） */
  avatar: string | null;
  /** 用户资料（query.json + tquery 合并，可空） */
  profile?: UserProfile | null;
  /** 资料更新时间 */
  updatedAt: string;
}

/**
 * 用户资料。
 *
 * 数据源（docs/06 §2.2 / §2.4，2026-08-07 在线验证）：
 * - 主体字段（nickname~status）来自 `/user/query/{uid}.json`（query.json，单 uid 一请求）；
 * - `title`（特殊头衔，可多个）来自 `/user/ajax_tquery.json`（tquery，批量接口，POST `list[]=uid`）。
 *
 * 弹窗字段对照：14 项中 13 项来自 query.json，特殊头衔来自 tquery，已确认真实数据一致。
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
  /** 资料抓取时间（ISO，本工具写入，供 TTL 判断） */
  fetchedAt: string;
}

/** 用户名（nickname）空时的回退值 */
export const USER_DEFAULT_NICKNAME = "";
/** 特殊头衔空时的回退（无头衔 → 空数组，与弹窗「暂无」语义一致） */
export const USER_NO_TITLE: string[] = [];
