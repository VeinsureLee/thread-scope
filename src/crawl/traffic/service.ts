import { routes, fillRoute } from "../../core/config.js";
import { PageFetcher, defaultPageFetcher } from "../common/page-fetcher.js";
import type { TrafficInfo } from "../../model/dto/index.js";
import type { BoardNode } from "../../model/index.js";
import { parseSectionTraffic } from "./parser.js";

/** 单分区流量读取结果：records 为命中版块，error 为分区级失败信息（无失败为 null）。 */
export interface SectionTrafficResult {
  readonly records: TrafficInfo[];
  readonly error: string | null;
}

/**
 * 读取单个分区的版块流量页面（?count=1），解析出该分区下目标版块的流量。
 *
 * View 职责（文档 §4.8）：只读取一个 section 页面并解析；跨 section 并发、
 * 树加载、聚合、落库由 Application UseCase 编排。错误作为返回值而非共享数组，
 * 由 UseCase 统一收集，避免 View 层与调用方的错误收集耦合。
 *
 * @param sectionId 分区 ID（如 sec-0）
 * @param boards    该分区下需要流量的版块叶子
 * @param fetcher   页面抓取器（默认全局 defaultPageFetcher，共享全站限速队列）
 */
export async function fetchSectionTraffic(
  sectionId: string,
  boards: readonly BoardNode[],
  fetcher: PageFetcher = defaultPageFetcher,
): Promise<SectionTrafficResult> {
  // 统一清理括号：树中 ename 可能为 "(Advice)"，HTML 提取的是 "Advice"
  const enames = new Set(boards.map((b) => b.ename.replace(/[()]/g, "")));
  // 收集中文名，用于纯中文版面（如 "悄悄话"）的回退匹配
  const names = new Set(boards.map((b) => b.name));

  try {
    const sectionPath = fillRoute(routes.section_detail, {
      sectionId: sectionId.replace(/^sec-/, ""),
    });
    const path = `${sectionPath}?count=1`;
    const html = await fetcher.fetch(path);
    const parsed = parseSectionTraffic(html, enames, names);

    // 补充未匹配到的版面（可能 HTML 行数不足）
    const matched = new Set([
      ...parsed.map((p) => p.ename.replace(/[()]/g, "")),
      ...parsed.map((p) => p.name),
    ]);
    for (const board of boards) {
      const cleanEname = board.ename.replace(/[()]/g, "");
      if (!matched.has(cleanEname) && !matched.has(board.name)) {
        parsed.push({
          ename: board.ename,
          name: board.name,
          onlineUsers: "",
          todayPosts: "",
          threads: "",
          posts: "",
        });
      }
    }
    return { records: parsed, error: null };
  } catch (err) {
    return {
      records: boards.map((board) => ({
        ename: board.ename,
        name: board.name,
        onlineUsers: "",
        todayPosts: "",
        threads: "",
        posts: "",
      })),
      error: `分区 [${sectionId}] 流量获取失败: ${String(err)}`,
    };
  }
}
