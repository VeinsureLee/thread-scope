import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { initStructure } from "../../../application/use-case/init/init-forum.js";
import { presentInitStructure } from "../../presenter/init.js";
import { registerLoggedTool } from "../with-logging.js";

export function registerInitStructureTool(server: McpServer): void {
  registerLoggedTool(
    server,
    "forum-init-structure",
    {
      title: "初始化 · 初始化论坛结构",
      description: "分类: 初始化。递归爬取全站结构树（分区/版块/版主名单）并保存 JSON 缓存；轻量，不爬首页文章、不采集流量。需要先执行 forum-login。",
      inputSchema: z.object({}),
    },
    async () => {
      const result = await initStructure();
      return { content: [{ type: "text", text: presentInitStructure(result) }] };
    },
  );
}
