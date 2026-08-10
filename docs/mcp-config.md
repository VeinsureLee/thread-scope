# MCP 服务配置教程

thread-scope 以 **stdio 传输**运行：客户端 spawn 一条命令，通过 stdin/stdout 走 JSON-RPC。服务内部相对路径（`config/`、`data/`、`.env`、日志）锚定项目根，**对 cwd 不敏感**，因此从任意工作目录启动均可。

## 服务命令

```bash
npm run dev            # 开发：tsx 直接运行（src/index.ts）
npm run build && npm run start   # 生产：node build/index.js
```

MCP 配置里统一使用**绝对路径**（避免客户端 cwd 差异）：

```
npx tsx /绝对路径/thread-scope/src/index.ts
```

## 方式 A：命令行配置（claude mcp add）

用户级（推荐，任意项目可用，写入 `~/.claude.json`）：

```bash
claude mcp add thread-scope -- npx tsx /绝对路径/thread-scope/src/index.ts
```

项目级（写入项目根 `.mcp.json`，随仓库分享）：

```bash
claude mcp add --scope project thread-scope -- npx tsx src/index.ts
```

两条命令最终都生成如下 `mcpServers` 配置：

```json
{
  "mcpServers": {
    "thread-scope": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "/绝对路径/thread-scope/src/index.ts"]
    }
  }
}
```

## 方式 B：cc-switch 图形化配置（保姆级图文）

cc-switch 管理 Claude Code 的 MCP 配置，与命令行配置**同源**（都写 `mcpServers`），**二选一即可**。

1. 打开 cc-switch，进入 **MCP 管理** 页：

<img src="imgs/config/1-cc%20switch%20mcp位置.png" alt="1-找到 MCP 管理入口" width="240">

2. 点击新增 MCP Server，填写：
   - **名称**：`thread-scope`
   - **命令**：`npx`
   - **参数**：`["tsx", "/绝对路径/thread-scope/src/index.ts"]`
   - **环境变量**：可留空（账号凭证走项目根 `.env`）

<img src="imgs/config/2-cc%20switch%20添加mcp.png" alt="2-添加 MCP Server" width="240">

<img src="imgs/config/3-cc%20switch%20mcp配置信息.png" alt="3-填写配置信息" width="240">

3. 保存后，重启 Claude Code；
4. 在 Claude Code 中输入 `/mcp`，确认 `thread-scope` 显示为已连接。

## 方式 C：项目 .mcp.json（可选，便于团队分享）

在项目根放一个 `.mcp.json`（内容同方式 A 的 JSON 结构），Claude Code 打开该项目时自动加载，无需手动添加。

## 使用流程

1. 在 Claude Code 输入 `/mcp` 确认服务已连接；
2. 先调用 **`forum-login`**（需要项目根 `.env` 中的账号密码）；
3. 再调用联网工具（结构刷新 / 流量 / 搜索 / 抓正文 / 用户资料）；
4. 读缓存类操作（本地搜索、结构缓存、历史流量查询）**无需登录**，可随时调用。

## 环境变量

`.env` 位于项目根（不提交，参考 `.env.example`）：

```
USER_ID=你的账号
USER_PASSWORD=你的密码
```
