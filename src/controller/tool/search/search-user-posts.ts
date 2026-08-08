import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { DEFAULT_CONCURRENCY, MAX_CONCURRENCY } from "../../../core/config.js";
import { searchUserPosts } from "../../../application/use-case/search/search-user-posts.js";
import { presentArticleSearch } from "../../presenter/search.js";
import { registerLoggedTool } from "../with-logging.js";

const SCOPE_ENUM = ["all", "top", "board", "section"] as const;

export function registerSearchUserPostsTool(server: McpServer): void {
  registerLoggedTool(
    server,
    "forum-search-user-posts",
    {
      title: "搜索 · 查询用户发帖",
      description: "分类: 搜索。按用户 uid 在指定范围内搜索其发布的文章（候选列表），不遍历版块获取用户资料。scope=all 全站；scope=top 流量前5版（默认）；scope=board 单版面（配 boardName）；scope=section 分区递归（配 boardName）。结果可选写入 forum-content.db（persist=true）。需先 forum-login。",
      inputSchema: z.object({
        uid: z.string().trim().min(1).describe("用户 ID（精确匹配）"),
        scope: z.enum(SCOPE_ENUM).optional().describe("搜索范围：all=全站；top=流量前5版（默认）；board=单版面；section=分区递归。不传时按 boardName/maxBoards 自动推断"),
        boardName: z.string().optional().describe("scope=board/section 时使用：版块英文名（如 Demo）或分区节点 ID（如 sec-0）"),
        maxPages: z.number().int().positive().max(100).optional().describe("每个版块最多翻页数，默认 1"),
        maxItems: z.number().int().positive().max(1000).optional().describe("每个版块最多返回条数，可选"),
        maxBoards: z.number().int().positive().max(500).optional().describe("scope=all 时最多搜索的版块数（可选；不传则搜全部版面）"),
        persist: z.boolean().default(true).describe("是否将命中文章写入 forum-content.db（默认 true）"),
        concurrency: z.number().int().positive().max(MAX_CONCURRENCY).default(DEFAULT_CONCURRENCY).describe(`联网搜索并发度（默认 ${DEFAULT_CONCURRENCY}，上限 ${MAX_CONCURRENCY}）`),
      }),
    },
    async ({ uid, scope, boardName, maxPages, maxItems, maxBoards, persist, concurrency }) => {
      const result = await searchUserPosts(uid, { scope, boardName, maxPages, maxItems, maxBoards, persist, concurrency });
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
