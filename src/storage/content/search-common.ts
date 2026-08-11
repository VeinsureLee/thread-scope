/**
 * 搜索公共过滤子句（searchArticles / searchThreadsContent 共用）。
 *
 * 两个搜索函数结构高度对称：版块限定 + 时间窗口 + LIMIT 三段拼接完全一致，
 * 仅时间列名不同（article.date / post.post_time）。抽此辅助消除重复。
 */

export interface SearchCommonOpts {
  /** 限定单版面（兼容旧调用） */
  boardEname?: string;
  /** 限定多版面 */
  boardEnames?: readonly string[];
  /** 时间下界（YYYY-MM-DD / ISO datetime） */
  from?: string;
  /** 时间上界 */
  to?: string;
  /** 返回上限 */
  limit?: number;
}

/** 解析版块列表：多版面优先，其次单版面，缺省空（不限） */
export function parseBoards(opts: SearchCommonOpts): string[] {
  return opts.boardEnames && opts.boardEnames.length > 0
    ? [...opts.boardEnames]
    : opts.boardEname
      ? [opts.boardEname]
      : [];
}

/** 追加版块 IN + 时间窗口子句（返回累积 sql 与参数）。timeCol：时间列限定名，如 a.date / p.post_time */
export function appendCommonFilters(
  sql: string,
  params: (string | number)[],
  opts: SearchCommonOpts,
  timeCol: string,
): { sql: string; params: (string | number)[] } {
  const boards = parseBoards(opts);
  if (boards.length > 0) {
    sql += ` AND a.board_ename IN (${boards.map(() => "?").join(", ")})`;
    params.push(...boards);
  }
  if (opts.from) {
    sql += ` AND ${timeCol} >= ?`;
    params.push(opts.from);
  }
  if (opts.to) {
    sql += ` AND ${timeCol} <= ?`;
    params.push(opts.to);
  }
  return { sql, params };
}

/** 追加 LIMIT 子句（返回累积 sql 与参数） */
export function appendLimit(
  sql: string,
  params: (string | number)[],
  limit?: number,
): { sql: string; params: (string | number)[] } {
  if (limit) {
    sql += ` LIMIT ?`;
    params.push(limit);
  }
  return { sql, params };
}
