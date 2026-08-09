import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { DEFAULT_CONCURRENCY, MAX_CONCURRENCY } from "../../../core/config.js";
import { searchThreadsUseCase } from "../../../application/use-case/search/search-threads-use-case.js";
import { presentThreadSearch } from "../../presenter/search.js";
import { registerLoggedTool } from "../with-logging.js";

const SOURCE_ENUM = ["auto", "local", "remote"] as const;

/** boards 元素说明（版块 ename / 分区 id / 分区·版块中文名 / 特殊值）。 */
const BOARDS_DESCRIBE =
  "搜索目标：数组元素可为版块英文名（如 \"Demo\"）、分区 ID（如 \"sec-0\"）、分区/版块中文名；或特殊值 \"all\"（全站）与 \"top\"（流量前5版）。省略 = 全站。例：[\"Demo\",\"sec-0\"]";

export function registerSearchThreadsTool(server: McpServer): void {
  registerLoggedTool(
    server,
    "forum-search-threads",
    {
      title: "搜索 · 搜索帖子并抓取正文",
      description: "分类: 搜索。按关键字搜索帖子并抓取正文与全部评论。source=local 只读本地缓存正文（秒回，无需登录）；source=remote 联网搜索并抓正文；source=auto 先本地后联网（默认）。boards 指定搜索范围（见参数说明），省略即全站。显式多版时每版最多抓 maxThreadsPerBoard 条；all/top 时全局限 maxThreads 条。联网命中可选写入 forum-content.db（persist=true）。联网需先 forum-login。",
      inputSchema: z.object({
        keyword: z.string().optional().describe("搜索关键字（与 author 至少提供一个）"),
        source: z.enum(SOURCE_ENUM).default("auto").describe("数据来源：local=只读本地缓存正文（秒回，无需登录）；remote=联网搜索并抓正文；auto=先本地后联网（默认）"),
        boards: z.union([z.string(), z.array(z.string())]).optional().describe(BOARDS_DESCRIBE),
        author: z.string().optional().describe("作者 ID（可选，精确匹配，仅联网搜索有效）"),
        maxPages: z.number().int().positive().max(100).optional().describe("搜索每个版块最多翻页数，默认 1（仅联网搜索有效）"),
        maxItems: z.number().int().positive().max(1000).optional().describe("搜索每个版块最多返回条数，可选（仅联网搜索有效）"),
        maxThreadsPerBoard: z.number().int().positive().max(50).optional().describe("显式指定 boards 时，每个版块最多抓取正文的文章数（默认 2，仅联网搜索有效）"),
        maxThreads: z.number().int().positive().max(500).optional().describe("all/top（未显式指定 boards）时的全局抓取上限（默认 100，仅联网搜索有效）"),
        maxThreadPages: z.number().int().positive().max(100).optional().describe("每篇文章楼层的最大页数（默认 5，仅联网搜索有效）"),
        persist: z.boolean().default(true).describe("是否将命中的文章与正文写入 forum-content.db（默认 true；local 搜索本就来自缓存，此参数无效）"),
        concurrency: z.number().int().positive().max(MAX_CONCURRENCY).default(DEFAULT_CONCURRENCY).describe(`联网搜索与抓正文的并发度（默认 ${DEFAULT_CONCURRENCY}，上限 ${MAX_CONCURRENCY}）`),
      }),
    },
    async ({ keyword, source, boards, author, maxPages, maxItems, maxThreadsPerBoard, maxThreads, maxThreadPages, persist, concurrency }) => {
      const result = await searchThreadsUseCase({ keyword, source, boards, author, maxPages, maxItems, maxThreadsPerBoard, maxThreads, maxThreadPages, persist, concurrency });
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
