import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { fetchUserTitlesUseCase } from "../../../application/use-case/user/fetch-user-titles-impl.js";
import { presentAllUserTitles, presentSelectedUserTitles } from "../../presenter/user-titles.js";
import { registerLoggedTool } from "../with-logging.js";

export function registerFetchUserTitlesTool(server: McpServer): void {
  registerLoggedTool(
    server,
    "forum-fetch-user-titles",
    {
      title: "用户 · 抓取特殊头衔",
      description: "分类: 用户。抓取指定用户的特殊头衔；不传 uids 时更新已落库用户。uids 支持字符串或字符串数组。",
      inputSchema: z.object({
        uids: z.union([z.string(), z.array(z.string())]).optional(),
        force: z.boolean().default(false),
      }),
    },
    async ({ uids, force }) => {
      const result = await fetchUserTitlesUseCase({ uids, force });
      if (result.mode === "selected") {
        const presentation = presentSelectedUserTitles(result);
        return {
          content: [
            { type: "text", text: presentation.text },
            { type: "text", text: JSON.stringify(presentation.data, null, 2) },
          ],
        };
      }
      return { content: [{ type: "text", text: presentAllUserTitles(result.stats) }] };
    },
  );
}
