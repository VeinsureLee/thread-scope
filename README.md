# Thread Scope

**为 LLM/Agent 提供论坛内容访问能力的 MCP 服务** —— 让 Claude Code 等 AI 助手通过标准 MCP 工具,直接发现论坛结构、监控版面流量、搜索并本地持久化文章/正文/用户,构建可查询的内容库。

> 版本：1.0.0 · 12 个 MCP 工具全部就绪 · 面向 [BYR 北邮人论坛] 的内容爬取与检索

---

## 项目定位

Thread Scope 解决的是"**AI 助手如何高效、合规地获取论坛数据**"这一场景:

| 痛点 | Thread Scope 的解法 |
|---|---|
| AI 没有访问论坛数据的能力 | 12 个 MCP 工具暴露结构/流量/搜索/内容/用户能力,宿主(如 Claude Code)可直接调用 |
| 论坛数据量大、网络抓取慢 | 增量爬取 + `url_hash` 去重 + 本地缓存优先,能查库不重爬 |
| 搜索无相关性、结果过多 | FTS5 全文索引(中文 bigram 预切分)+ bm25 相关性排序 + 结果规模控制(截断信号) |
| 内容含大量冗余噪音 | 正文清洗(剥离发信人/来源头部尾部,提取时间/客户端/IP) |
| 爬取无序、容易重复 | 结构树 + 任务计划 + 统一并发池,失败隔离不中断 |

**典型用途**:版面内容运营分析、论坛数据研究、基于论坛内容的 LLM 应用(检索增强)、历史帖子检索。

---

## 功能总览

| 能力 | 工具 | 数据来源 | 需要登录 |
|---|---|---|---|
| 认证 | `forum-login` | 论坛 | — |
| 结构发现 | `forum-fetch-structure` | 本地缓存（默认）/ 联网刷新 | 联网时 |
| 文章列表 | `forum-fetch-board-articles` | 联网，落库 article 表 | ✅ |
| 版面流量 | `forum-fetch-traffic` | 联网，采样异步落库 | ✅ |
| 历史流量 | `forum-query-traffic-history` | 本地 traffic.db | ❌ |
| 一键初始化 | `forum-init` | 联网，保存结构 JSON | ✅ |
| 搜索文章 | `forum-search-articles` | 本地 / 联网 / 自动 | 联网时 |
| 搜索正文 | `forum-search-threads` | 本地 / 联网 / 自动 | 联网时 |
| 用户资料 | `forum-get-user` / `forum-fetch-user-profiles` / `forum-fetch-user-titles` | 联网，落库 user 表 | ✅ |

---

## 效果展示

三份端到端测试会话记录（关键信息已打码处理），覆盖：登录 → 结构/流量 → 搜索 → 抓正文 → 用户查询。

<table>
  <tr>
    <td align="center"><img src="docs/imgs/Test%20snapshot/实习.png" alt="实习快照" width="250"><br>① 招聘实习检索<br><a href="docs/E2E%20Test/E2E%20Test%20-%20实习.md">详细记录</a></td>
    <td align="center"><img src="docs/imgs/Test%20snapshot/征友.png" alt="征友快照" width="250"><br>② 征友检索<br><a href="docs/E2E%20Test/E2E%20Test%20-%20征友.md">详细记录</a></td>
    <td align="center"><img src="docs/imgs/Test%20snapshot/日常.png" alt="日常快照" width="250"><br>③ 日常闲聊与版面分析<br><a href="docs/E2E%20Test/E2E%20Test%20-%20日常.md">详细记录</a></td>
  </tr>
</table>

**对话详情示例**（还挺有意思的）：

<div align="center">
  <img src="docs/imgs/Test%20snapshot/interesting.png" alt="有意思的截图" width="180">
</div>

### 测试方法

| 工具 \ 测试 | [实习](docs/E2E%20Test/E2E%20Test%20-%20实习.md)（找招聘/实习） | [征友](docs/E2E%20Test/E2E%20Test%20-%20征友.md)（找对象） | [日常](docs/E2E%20Test/E2E%20Test%20-%20日常.md)（闲聊+版面分析） |
|---|---|---|---|
| `forum-login` | 1 | 1 | 1 |
| `forum-fetch-structure` | 1 | 1 | 1 |
| `forum-fetch-board-articles` | 5 | — | 6 |
| `forum-fetch-thread` | 8 | — | 12 |
| `forum-fetch-traffic` | — | — | 1 |
| `forum-search-articles` | 1 | 11 | 6 |
| `forum-get-user` | — | — | 4 |

> MCP 配置教程见 [docs/mcp-config.md](docs/mcp-config.md)。

---

## 架构

```
┌────────────────────────────────────────────────────┐
│                 MCP Client (stdio)                  │
└────────────────────────┬───────────────────────────┘
                         │ JSON-RPC
┌────────────────────────▼───────────────────────────┐
│                    src/index.ts                     │
│              MCP Server（工具注册唯一入口）           │
└───────────────┬─────────────┬──────────────────────┘
                │             │
        ┌───────▼─────┐ ┌─────▼──────────┐
        │   tools/    │ │  logging/      │   ← 工具层（Zod schema + handler）
        │ 12 个工具    │ │  traceId/日志   │
        └───────┬─────┘ └─────┬──────────┘
                │             │
┌───────────────▼─────────────▼──────────────────────┐
│              auth/ · crawl/ · storage/             │   ← 领域层
│   crawl 按域：structure / traffic / article /      │
│               content / search / user              │
│   storage：content-db（门面 + migrations/ 版本化迁移 +│
│               content/ 领域仓储）/ traffic-db /       │
│               traffic-queue / structure-store         │
└───────────────────────┬────────────────────────────┘
                        │
┌───────────────────────▼────────────────────────────┐
│                    core/                           │   ← 基础设施层
│   config / paths / http-client / encoding          │
└────────────────────────────────────────────────────┘
```

**依赖方向（无循环）**：`core/ ← auth/ · crawl/ · storage/ ← tools/ ← index.ts`

**领域层约定**：每个爬取域统一「同构四件套」—— `index.ts`（出口）· `service.ts`（编排）· `repository.ts`（数据访问）· `parser.ts`（HTML 解析）。工具层只走 `index.ts`，不直接 import 内部文件。

---

## 核心设计

### 1. 结构：缓存优先

`forum-fetch-structure` 默认读取本地缓存 `data/structure-overview.json`（秒回，无需登录）；`refresh=true` 强制联网重爬并更新缓存；`parentId` 展开子节点需联网。

### 2. 搜索：本地 / 联网 双通道 + 全文索引

| source | 行为 |
|---|---|
| `local` | 只读本地 forum-content.db（秒回，无需登录） |
| `remote` | 只联网搜索（+抓正文，需登录） |
| `auto`（默认） | 先查本地，有命中即返回；无命中再联网 |

本地搜索基于 **FTS5 全文索引**（中文按重叠二元组预切分，1 字关键词回退 LIKE），支持 bm25 相关性排序；结果按版分组、每版/全局限量，返回 `truncated` 截断信号引导宿主收敛（`boards` / `from` / `to` / 换词）。

### 3. 流量：采样 + 异步落库

`forum-fetch-traffic` 实时爬取（支持 `concurrency` 并发），采样经 `traffic-queue` **异步**写入 traffic.db，不阻塞工具返回；`forum-query-traffic-history` 查询随时间变化的趋势。

### 4. 并发

搜索与流量均使用工作池（`crawl/common/async-pool.ts`）。`concurrency` 工具参数控制：默认 8，上限 16。单版块翻页保持串行（尊重目标站点）。

### 5. 日志

`logging/` 分层命名空间（`system`/`crawl`/`tool`…），每次工具调用生成 traceId，调用链日志共享。**日志不记录返回内容与凭证**；stderr 输出人类可读格式，protocol 通道保持干净。

---

## 本地数据

| 数据 | 存储 | 说明 |
|---|---|---|
| 论坛结构 | `data/structure-overview.json` | `forum-init` / `fetch-structure(refresh)` 产出 |
| 内容库 | `data/forum-content.db`（SQLite，WAL） | board / article / post / user 表，增量去重（url_hash） |
| 流量库 | `data/forum-traffic.db`（SQLite，WAL） | 历史流量采样 |
| 会话 Cookie | `data/session-cookie.txt`（权限 600） | 启动自动恢复，免每次手动登录 |

> `data/`、`.env`、`*.log`、`output/` 均在 `.gitignore` 中，不进入版本控制。凭证只在 `.env`，从不进入工具入参或日志。

### 数据库维护

内容库增量累积，长期运行后文件会虚涨（更新/删除留下的空洞）。提供一键维护脚本：

```bash
npm run maintain   # WAL checkpoint + VACUUM + FTS5 bigram 索引重建 + 规模/新鲜度统计
```

纯本地操作，不联网、不需要登录，可定期执行。

> **Schema 演进**：建表/补列/删列等结构变更放在 `src/storage/migrations/`（版本化迁移，
> 以 SQLite `PRAGMA user_version` 记录已应用版本，只执行一次、失败整体回滚）。新增变更 →
> 追加一个 `v00X-*.ts` 文件并在 `migrations/index.ts` 注册即可。早期脏数据的幂等修复
> （如旧帖正文清洗）则在启动期由 `content/repairs.ts` 执行。

### 会话管理

- **自动恢复**：进程启动时自动从 `data/session-cookie.txt` 恢复上次登录态，大多数场景启动即可用，无需每次手动 `forum-login`；
- **过期自检**：会话过期后论坛会把受保护页面换成未登录页。PageFetcher 按 `config/rules/http.yaml` 的 `session_expired` 特征检测：命中强特征 → 立即报错并清除本地 Cookie（提示重新登录），不静默返回空结果；命中弱特征 → 仅记 warn 日志，用于站点改版/选择器失效诊断。

---

## 快速开始

### 环境要求

- Node.js ≥ 22.5（使用内置 `node:sqlite`，FTS5 全文索引）
- npm

### 安装与配置

```bash
npm install
cp .env.example .env
# 编辑 .env，填入论坛账号密码
```

### 启动 / 调试

```bash
npm run dev          # tsx 直接运行 MCP 服务
npm run inspect      # 构建后启动 MCP Inspector
```

`npm run inspect` 会启动 **MCP Inspector**——官方图形化调试面板：可在网页里浏览、调用本服务的全部工具、查看请求/响应 JSON，适合本地联调工具行为（无需经过 Claude Code）。

### 测试

```bash
npm test             # 单元 + 解析测试（无需登录）
npm run test:coverage
BYR_LIVE=1 npm test -- test/crawl/traffic-live.test.ts   # 真实登录的集成测试（需 .env 凭证）
```

---

## 作为 MCP 服务使用

MCP 服务以 **stdio 传输**运行：客户端 spawn 一条命令（`npx tsx /绝对路径/thread-scope/src/index.ts`），通过 stdin/stdout 走 JSON-RPC；服务内部路径锚定项目根，cwd 不敏感。

**配置教程见 [docs/mcp-config.md](docs/mcp-config.md)** —— 包含命令行 `claude mcp add`、cc-switch 保姆级图文、项目 `.mcp.json` 三种方式，及使用流程与 `.env` 说明。

快速开始（用户级，写入 `~/.claude.json`）：

```bash
claude mcp add thread-scope -- npx tsx /绝对路径/thread-scope/src/index.ts
```

> 使用前先 `forum-login`（需 `.env` 账号密码）；读缓存类操作（本地搜索 / 结构缓存 / 历史流量）无需登录。

---

## MCP 工具

| 工具名 | 主要参数 | 说明 |
|---|---|---|
| `forum-login` | — | 登录论坛，保存认证 Cookie（所有联网工具前置） |
| `forum-init` | `withStructure?` `withManagers?` `withArticles?` `concurrency?` | 一键初始化：结构（默认）+ 版主（默认）+ 可选首页文章 |
| `forum-fetch-structure` | `parentId?` `refresh?` | 论坛结构树；默认读缓存，refresh 联网，parentId 展开 |
| `forum-fetch-board-articles` | `boardName` `maxPages?` `maxItems?` | 版块文章列表，落库 article 表 |
| `forum-fetch-thread` | `boardName` `articleId` `maxPages?` `persist?` | 单帖首帖+评论树，落库 |
| `forum-fetch-traffic` | `nodeId?` `concurrency?` | 版面/分区实时流量；树状聚合，采样异步落库 |
| `forum-query-traffic-history` | `boardEname` `from?` `to?` `limit?` | 历史流量查询（本地库） |
| `forum-search-articles` | `keyword` `source?` `boards?` `author?` `maxPages?` `maxItems?` `maxResults?` `from?` `to?` `sort?` `persist?` `concurrency?` | 搜索文章（列表级，不抓正文），按版分组返回，含 truncated 截断信号 |
| `forum-search-threads` | `keyword` `source?` `boards?` `author?` `maxPages?` `maxItems?` `maxThreadsPerBoard?` `maxThreads?` `maxThreadPages?` `from?` `to?` `sort?` `persist?` `concurrency?` | 搜索帖子并抓正文与全部评论，可落库 |
| `forum-get-user` | `uid` `includeTitles?` `persist?` | 按 uid 查询单用户资料 |
| `forum-fetch-user-profiles` | `uids?` `concurrency?` `force?` `persist?` | 批量抓取用户资料 |
| `forum-fetch-user-titles` | `uids?` `force?` | 抓取用户特殊头衔 |

`source ∈ {auto, local, remote}`；`boards` 数组元素可为版块英文名/分区 id/分区·版块中文名，或特殊值 `"all"`（全站）与 `"top"`（流量前5版），省略 = 全站。`sort ∈ {recent, relevant}`、`from`/`to` 仅本地搜索生效。

---

## 配置

| 文件 | 说明 |
|---|---|
| `config/external/forum.yaml` | 论坛入口（base_url 等） |
| `config/rules/routes.yaml` | 路由模板 |
| `config/rules/selectors.yaml` | CSS 选择器与匿名版面规则 |
| `config/rules/login.yaml` | 登录方式 |
| `config/rules/http.yaml` | 请求头 / 超时 / 编码 / 限速 / 会话过期特征 |
| `config/rules/log.yaml` | 日志配置 |
| `.env` | 账号密码（不提交；参考 `.env.example`） |

---

## 技术栈

| 组件 | 选型 | 说明 |
|---|---|---|
| 运行时 | Node.js（ESM）+ TypeScript strict | — |
| MCP | `@modelcontextprotocol/sdk` | stdio 传输 |
| HTTP | axios | arraybuffer 响应 |
| 解析 | cheerio | HTML → 数据 |
| 编码 | iconv-lite | GBK → UTF-8 |
| 存储 | `node:sqlite`（内置） | 零额外依赖，FTS5 全文索引 |
| 校验 | zod v4 | 工具入参 schema |
| 测试 | vitest | 单元 + 解析 + 集成 |
| 配置 | js-yaml + dotenv | 规则 YAML + 凭证 env |

---

## 设计原则

1. **尊重目标站点**：控制请求频率，单版块翻页串行
2. **增量优先**：url_hash 去重、能查缓存不重爬
3. **模块解耦**：爬取不依赖存储实现，存储不依赖查询接口
4. **失败可恢复**：单版面失败隔离，不中断整体；写库失败不影响返回
5. **隐私边界**：凭证只在 .env，日志与返回不含论坛内部信息

[BYR 北邮人论坛]: https://bbs.byr.cn
