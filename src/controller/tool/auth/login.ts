import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { login } from "../../../auth/auth.js";
import { registerLoggedTool } from "../with-logging.js";

export function registerLoginTool(server: McpServer): void {
  registerLoggedTool(
    server,
    "forum-login",
    {
      title: "认证 · 论坛登录",
      description: "分类: 认证。登录目标论坛并保存会话 Cookie。所有联网抓取工具调用前需要先执行此工具。",
      inputSchema: z.object({}),
    },
    async () => {
      const result = await login();
      return {
        content: [{
          type: "text",
          text: `${result.isLogin ? "✓ 登录成功" : "✗ 登录失败"}\n用户: ${result.userName}\najax_st: ${result.ajaxSt}`,
        }],
      };
    },
  );
}
