import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { DEFAULT_CONCURRENCY, MAX_CONCURRENCY } from "../../../core/config.js";
import { searchThreadsUseCase } from "../../../application/use-case/search/search-threads-use-case.js";
import { presentThreadSearch } from "../../presenter/search.js";
import { registerLoggedTool } from "../with-logging.js";

const SOURCE_ENUM = ["auto", "local", "remote"] as const;
const SORT_ENUM = ["recent", "relevant"] as const;

/** boards 元素说明（版块 ename / 分区 id / 分区·版块中文名 / 特殊值）。 */
const BOARDS_DESCRIBE =
  "搜索目标：数组元素可为版块英文名（如 \"Demo\"）、分区 ID（如 \"sec-0\"）、分区/版块中文名；或特殊值 \"all\"（全站）与 \"top\"（流量前5版）。省略 = 全站。例：[\"Demo\",\"sec-0\"]";

export function registerSearchThreadsTool(server: McpServer): void {
  registerLoggedTool(
    server,
    "forum-search-threads",
    {
      title: "搜索 · 搜索帖子并抓取正文",
      description: "分类: 搜索。按关键字搜索帖子并抓取正文+全部评论（比 forum-search-articles 更深更重）。用途: 需要帖子正文内容时使用。source=local 读本地缓存正文秒回（无需登录）；remote 联网搜索并抓正文；auto 先本地后联网。显式 boards 每版最多抓 maxThreadsPerBoard 条；all/top 时全局限 maxThreads 条。建议: 先 forum-search-articles 缩小范围，再对命中的帖子用 forum-fetch-thread 补齐页数。返回: {hits, truncated}，命中的帖子（首帖+评论）；truncated=true 表示结果过多已截断（可缩小 boards/加 from/to/换关键词收敛）。联网需先 forum-login。",
      inputSchema: z.object({
        keyword: z.string().optional().describe("搜索关键字（与 author 至少提供一个）"),
        source: z.enum(SOURCE_ENUM).default("auto").describe("数据来源：local=只读本地缓存正文（秒回，无需登录）；remote=联网搜索并抓正文；auto=先本地后联网（默认）"),
        boards: z.union([z.string(), z.array(z.string())]).optional().describe(BOARDS_DESCRIBE),
        author: z.string().optional().describe("作者 ID（可选，精确匹配，仅联网搜索有效）"),
        maxPages: z.number().int().positive().max(100).optional().describe("搜索每个版块最多翻页数，默认 1（仅联网搜索有效）"),
        maxItems: z.number().int().positive().max(1000).optional().describe("搜索每个版块最多返回条数，可选（仅联网搜索有效）"),
        maxThreadsPerBoard: z.number().int().positive().max(50).optional().describe("每个版块最多抓取正文的文章数（默认 10；本地与联网均生效，本地搜索时同样按版限量）"),
        maxThreads: z.number().int().positive().max(500).optional().describe("全局抓取上限（默认 50；all/top 时每版平衡后取前 N。本地与联网均生效）"),
        maxThreadPages: z.number().int().positive().max(100).optional().describe("每篇文章楼层的最大页数（默认 5，仅联网搜索有效）"),
        from: z.string().optional().describe("发帖时间下界（如 \"2024-01-01\"），仅本地搜索生效"),
        to: z.string().optional().describe("发帖时间上界（如 \"2024-12-31\"），仅本地搜索生效"),
        sort: z.enum(SORT_ENUM).default("recent").describe("排序：recent=按发帖时间（默认）；relevant=按相关性（本地 FTS bm25）。仅本地搜索生效"),
        persist: z.boolean().default(true).describe("是否将命中的文章与正文写入 forum-content.db（默认 true；local 搜索本就来自缓存，此参数无效）"),
        concurrency: z.number().int().positive().max(MAX_CONCURRENCY).default(DEFAULT_CONCURRENCY).describe(`联网搜索与抓正文的并发度（默认 ${DEFAULT_CONCURRENCY}，上限 ${MAX_CONCURRENCY}）`),
      }),
    },
    async ({ keyword, source, boards, author, maxPages, maxItems, maxThreadsPerBoard, maxThreads, maxThreadPages, from, to, sort, persist, concurrency }) => {
      const result = await searchThreadsUseCase({ keyword, source, boards, author, maxPages, maxItems, maxThreadsPerBoard, maxThreads, maxThreadPages, from, to, sort, persist, concurrency });
      if (result.kind === "invalid") return { content: [{ type: "text", text: result.message }] };
      const presentation = presentThreadSearch(result);
      return {
        content: [
          { type: "text", text: presentation.text },
          { type: "text", text: JSON.stringify(presentation.data, null, 2) },
        ],
      };
    },
  );
}
