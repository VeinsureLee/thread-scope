import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { DEFAULT_CONCURRENCY, MAX_CONCURRENCY } from "../../../core/config.js";
import { searchThreadsUseCase } from "../../../application/use-case/search/search-threads-use-case.js";
import { presentThreadSearch } from "../../presenter/search.js";
import { registerLoggedTool } from "../with-logging.js";

const SOURCE_ENUM = ["auto", "local", "remote"] as const;
const SCOPE_ENUM = ["all", "top", "board", "section"] as const;

export function registerSearchThreadsTool(server: McpServer): void {
  registerLoggedTool(
    server,
    "forum-search-threads",
    {
      title: "搜索 · 搜索帖子并抓取正文",
      description: "分类: 搜索。按关键字搜索帖子并抓取正文与全部评论。source=local 只读本地缓存正文（秒回，无需登录）；source=remote 联网搜索并抓正文；source=auto 先本地后联网（默认）。scope=all 全站（约3分钟）；scope=top 流量前5版（默认）；scope=board 单版面（配 boardName）；scope=section 分区递归（配 boardName）。联网命中可选写入 forum-content.db（persist=true）。联网需先 forum-login。",
      inputSchema: z.object({
        keyword: z.string().optional().describe("搜索关键字（与 author 至少提供一个）"),
        source: z.enum(SOURCE_ENUM).default("auto").describe("数据来源：local=只读本地缓存正文（秒回，无需登录）；remote=联网搜索并抓正文；auto=先本地后联网（默认）"),
        scope: z.enum(SCOPE_ENUM).optional().describe("搜索范围：all=全站（约3分钟）；top=流量前5版（默认）；board=单版面；section=分区递归。不传时按 boardName/maxBoards 自动推断"),
        boardName: z.string().optional().describe("scope=board/section 时使用：版块英文名（如 Demo）或分区节点 ID（如 sec-0）"),
        author: z.string().optional().describe("作者 ID（可选，精确匹配，仅联网搜索有效）"),
        maxPages: z.number().int().positive().max(100).optional().describe("搜索每个版块最多翻页数，默认 1（仅联网搜索有效）"),
        maxItems: z.number().int().positive().max(1000).optional().describe("搜索每个版块最多返回条数，可选（仅联网搜索有效）"),
        maxBoards: z.number().int().positive().max(500).optional().describe("scope=all 时最多搜索的版块数（可选；不传则搜全部版面）"),
        maxThreads: z.number().int().positive().max(50).optional().describe("最多抓取正文的文章数（默认 20，仅联网搜索有效）"),
        maxThreadPages: z.number().int().positive().max(100).optional().describe("每篇文章楼层的最大页数（默认 5，仅联网搜索有效）"),
        persist: z.boolean().default(true).describe("是否将命中的文章与正文写入 forum-content.db（默认 true；local 搜索本就来自缓存，此参数无效）"),
        concurrency: z.number().int().positive().max(MAX_CONCURRENCY).default(DEFAULT_CONCURRENCY).describe(`联网搜索与抓正文的并发度（默认 ${DEFAULT_CONCURRENCY}，上限 ${MAX_CONCURRENCY}）`),
      }),
    },
    async ({ keyword, source, scope, boardName, author, maxPages, maxItems, maxBoards, maxThreads, maxThreadPages, persist, concurrency }) => {
      const result = await searchThreadsUseCase({ keyword, source, scope, boardName, author, maxPages, maxItems, maxBoards, maxThreads, maxThreadPages, persist, concurrency });
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
