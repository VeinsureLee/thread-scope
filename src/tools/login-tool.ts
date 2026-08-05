import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { login } from "../auth/auth.js";

/** 注册论坛登录工具 */
export function registerLoginTool(server: McpServer): void {
  server.registerTool(
    "forum-login",
    {
      title: "论坛登录",
      description:
        "登录目标论坛，获取认证 Cookie。所有爬取工具调用前必须先执行此工具。",
      inputSchema: z.object({}),
    },
    async () => {
      const result = await login();
      const status = result.isLogin ? "✅ 登录成功" : "❌ 登录失败";
      return {
        content: [
          {
            type: "text",
            text: `${status}\n用户: ${result.userName}\najax_st: ${result.ajaxSt}`,
          },
        ],
      };
    },
  );
}
