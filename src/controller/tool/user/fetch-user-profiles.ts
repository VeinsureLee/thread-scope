import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { fetchUserProfilesUseCase } from "../../../application/use-case/user/fetch-user-profiles-impl.js";
import { DEFAULT_CONCURRENCY, MAX_CONCURRENCY } from "../../../core/config.js";
import { presentUserProfiles } from "../../presenter/user-batch.js";
import { registerLoggedTool } from "../with-logging.js";

export function registerFetchUserProfilesTool(server: McpServer): void {
  registerLoggedTool(
    server,
    "forum-fetch-user-profiles",
    {
      title: "用户 · 批量抓取用户资料",
      description: "分类: 用户。批量抓取用户资料并写入 user 表；uids 支持单个字符串或字符串数组。不传 uids 时抓取已落库的全部用户（TTL 72h 内跳过，force 可强制）。前置: forum-login。关联: 版主可经 forum-init withManagers 批量；其余 uid 可在此批量补全资料。返回: 抓取统计与失败列表。",
      inputSchema: z.object({
        uids: z.union([z.string(), z.array(z.string())]).optional().describe("目标用户 uid：单个字符串（如 \"user_a\"）或字符串数组（如 [\"user_a\",\"user_b\"]）；不传则更新已落库的全部用户"),
        concurrency: z.number().int().positive().max(MAX_CONCURRENCY).default(DEFAULT_CONCURRENCY).describe(`并发度（默认 ${DEFAULT_CONCURRENCY}，上限 ${MAX_CONCURRENCY}）`),
        force: z.boolean().default(false).describe("是否忽略 TTL 强制重抓（默认 false：profile_fetched_at 距今 72h 内的用户跳过；true 则全部重抓）"),
        persist: z.boolean().default(true).describe("是否将抓取的资料写入 user 表（默认 true）"),
      }),
    },
    async ({ uids, concurrency, force, persist }) => {
      const result = await fetchUserProfilesUseCase({ uids, concurrency, force, persist });
      if (result.targets.length === 0) return { content: [{ type: "text", text: "没有可抓取的用户。" }] };
      const presentation = presentUserProfiles(result);
      return {
        content: [
          { type: "text", text: presentation.text },
          { type: "text", text: JSON.stringify(presentation.data, null, 2) },
        ],
      };
    },
  );
}
