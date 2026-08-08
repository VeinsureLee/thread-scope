import { routes, fillRoute } from "../../core/config.js";
import { PageFetcher, defaultPageFetcher } from "../common/page-fetcher.js";
import type { TrafficInfo } from "../../models/index.js";
import type { LeafBoardRef } from "./collector.js";
import { parseSectionTraffic } from "./parser.js";

/**
 * 读取单个分区的版块流量页面（?count=1），解析出目标版块的流量。
 *
 * View 职责（文档 §4.8）：只读取一个 section 页面并解析；跨 section 并发、
 * 树加载、聚合、落库由 Application UseCase 编排。
 *
 * @param sectionId 分区 ID（如 sec-0）
 * @param refs      该分区下需要流量的版块叶子引用
 * @param errors    分区级错误收集（由调用方传入，跨调用不共享）
 * @param fetcher   页面抓取器（默认全局 defaultPageFetcher，共享全站限速队列）
 */
export async function fetchSectionTraffic(
  sectionId: string,
  refs: LeafBoardRef[],
  errors: string[],
  fetcher: PageFetcher = defaultPageFetcher,
): Promise<TrafficInfo[]> {
  // 统一清理括号：树中 ename 可能为 "(Advice)"，HTML 提取的是 "Advice"
  const enames = new Set(refs.map((r) => r.node.board.ename.replace(/[()]/g, "")));
  // 收集中文名，用于纯中文版面（如 "悄悄话"）的回退匹配
  const names = new Set(refs.map((r) => r.node.name));

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
    for (const ref of refs) {
      const cleanEname = ref.node.board.ename.replace(/[()]/g, "");
      if (!matched.has(cleanEname) && !matched.has(ref.node.name)) {
        parsed.push({
          ename: ref.node.board.ename,
          name: ref.node.name,
          onlineUsers: "",
          todayPosts: "",
          threads: "",
          posts: "",
        });
      }
    }
    return parsed;
  } catch (err) {
    const msg = `分区 [${sectionId}] 流量获取失败: ${String(err)}`;
    errors.push(msg);
    return refs.map((ref) => ({
      ename: ref.node.board.ename,
      name: ref.node.name,
      onlineUsers: "",
      todayPosts: "",
      threads: "",
      posts: "",
    }));
  }
}
