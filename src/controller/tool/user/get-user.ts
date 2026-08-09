import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getUser } from "../../../application/use-case/user/get-user.js";
import { presentGetUser } from "../../presenter/user.js";
import { registerLoggedTool } from "../with-logging.js";

export function registerGetUserTool(server: McpServer): void {
  registerLoggedTool(
    server,
    "forum-get-user",
    {
      title: "用户 · 查询用户资料",
      description: "分类: 用户。按 uid 直接查询用户资料，可选查询特殊头衔；不遍历版块。",
      inputSchema: z.object({
        uid: z.string().trim().min(1).describe("用户 ID（精确匹配，如 \"user_a\"）"),
        includeTitles: z.boolean().default(true).describe("是否同时查询特殊头衔（默认 true）"),
        persist: z.boolean().default(true).describe("是否将查询结果写入 user 表（默认 true）"),
      }),
    },
    async ({ uid, includeTitles, persist }) => {
      const result = await getUser(uid, { includeTitles, persist });
      const presentation = presentGetUser(result);
      return {
        content: [
          { type: "text", text: presentation.text },
          { type: "text", text: JSON.stringify(presentation.data, null, 2) },
        ],
      };
    },
  );
}
