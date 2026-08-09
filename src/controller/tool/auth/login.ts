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
      description: "分类: 认证。登录目标论坛并保存会话 Cookie。所有联网工具（初始化、结构刷新、文章/帖子抓取、联网搜索、流量采集、用户抓取）调用前需先执行本工具；仅读本地缓存的操作（结构缓存、本地搜索 source=local、历史流量、get-user 持久化读取）无需登录。返回: 登录结果与用户名。",
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
