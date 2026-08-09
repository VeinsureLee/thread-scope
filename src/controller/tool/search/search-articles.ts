import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { DEFAULT_CONCURRENCY, MAX_CONCURRENCY } from "../../../core/config.js";
import { searchArticlesUseCase } from "../../../application/use-case/search/search-articles-use-case.js";
import { presentArticleSearch } from "../../presenter/search.js";
import { registerLoggedTool } from "../with-logging.js";

const SOURCE_ENUM = ["auto", "local", "remote"] as const;
const SORT_ENUM = ["recent", "relevant"] as const;

/** boards 元素说明（版块 ename / 分区 id / 分区·版块中文名 / 特殊值）。 */
const BOARDS_DESCRIBE =
  "搜索目标：数组元素可为版块英文名（如 \"Demo\"）、分区 ID（如 \"sec-0\"）、分区/版块中文名；或特殊值 \"all\"（全站）与 \"top\"（流量前5版）。省略 = 全站。例：[\"Demo\",\"sec-0\",\"示例分区\"]";

export function registerSearchArticlesTool(server: McpServer): void {
  registerLoggedTool(
    server,
    "forum-search-articles",
    {
      title: "搜索 · 搜索文章",
      description: "分类: 搜索。按关键字/作者搜索文章（列表级，不抓正文），支持多版/全站，返回按版分组+每版命中数。用途: 首选的关键字定位工具。source=local 读本地缓存秒回（无需登录）；remote 联网；auto 先本地后联网。boards 可限定 forum-fetch-traffic 的高流量版面或 forum-fetch-structure 的分区定向搜索；若关键字命中率低，改用 forum-fetch-board-articles 浏览版面列表。返回: {total, boards:[{boardEname,count,items}], truncated}；结果过多时 truncated=true（可缩小 boards/加 from/to/换关键词收敛），命中含 articleId 可传 forum-fetch-thread 抓正文。联网需先 forum-login。",
      inputSchema: z.object({
        keyword: z.string().optional().describe("搜索关键字（与 author 至少提供一个）"),
        source: z.enum(SOURCE_ENUM).default("auto").describe("数据来源：local=只查本地缓存（秒回，无需登录）；remote=只联网搜索；auto=先本地后联网（默认）"),
        boards: z.union([z.string(), z.array(z.string())]).optional().describe(BOARDS_DESCRIBE),
        author: z.string().optional().describe("作者 ID（可选，精确匹配，仅联网搜索有效）"),
        maxPages: z.number().int().positive().max(100).optional().describe("每个版块最多翻页数，默认 1（仅联网搜索有效）"),
        maxItems: z.number().int().positive().max(1000).optional().describe("每个版块最多返回条数（默认 20；本地与联网均生效）"),
        maxResults: z.number().int().positive().max(1000).default(100).describe("全局返回上限（默认 100）：结果过多时截断并返回 truncated 信号，本地/联网均生效"),
        from: z.string().optional().describe("发帖日期下界（如 \"2024-01-01\"），仅本地搜索生效"),
        to: z.string().optional().describe("发帖日期上界（如 \"2024-12-31\"），仅本地搜索生效"),
        sort: z.enum(SORT_ENUM).default("recent").describe("排序：recent=按发帖时间+置顶优先（默认）；relevant=按相关性（本地 FTS bm25）。仅本地搜索生效"),
        persist: z.boolean().default(true).describe("是否将命中文章写入 forum-content.db（默认 true，url_hash 去重；local 搜索本就来自缓存，此参数无效）"),
        concurrency: z.number().int().positive().max(MAX_CONCURRENCY).default(DEFAULT_CONCURRENCY).describe(`联网搜索并发度（默认 ${DEFAULT_CONCURRENCY}，上限 ${MAX_CONCURRENCY}）`),
      }),
    },
    async ({ keyword, source, boards, author, maxPages, maxItems, maxResults, from, to, sort, persist, concurrency }) => {
      const result = await searchArticlesUseCase({ keyword, source, boards, author, maxPages, maxItems, maxResults, from, to, sort, persist, concurrency });
      if (result.kind === "invalid") return { content: [{ type: "text", text: result.message }] };
      const presentation = presentArticleSearch(result);
      return {
        content: [
          { type: "text", text: presentation.text },
          { type: "text", text: JSON.stringify(presentation.data, null, 2) },
        ],
      };
    },
  );
}
