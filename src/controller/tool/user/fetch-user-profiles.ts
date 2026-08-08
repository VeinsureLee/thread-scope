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
      description: "分类: 用户。批量抓取用户资料并写入 user 表；uids 支持单个字符串或字符串数组。",
      inputSchema: z.object({
        uids: z.union([z.string(), z.array(z.string())]).optional(),
        concurrency: z.number().int().positive().max(MAX_CONCURRENCY).default(DEFAULT_CONCURRENCY),
        force: z.boolean().default(false),
        persist: z.boolean().default(true),
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
