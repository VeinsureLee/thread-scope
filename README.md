# Thread Scope

针对论坛设计的内容爬取 MCP 服务：论坛结构发现、版面流量监控、文章/正文搜索与本地持久化。

> 版本：1.0.0 · 8 个 MCP 工具全部就绪。

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
        │ 8 个工具     │ │  traceId/日志   │
        └───────┬─────┘ └─────┬──────────┘
                │             │
┌───────────────▼─────────────▼──────────────────────┐
│              auth/ · crawl/ · storage/             │   ← 领域层
│   crawl 按域：structure / traffic / article /      │
│               content / search / user              │
│   storage：content-db / traffic-db / traffic-queue │
│               / structure-store                    │
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

### 2. 搜索：本地 / 联网 双通道

| source | 行为 |
|---|---|
| `local` | 只读本地 forum-content.db（秒回，无需登录） |
| `remote` | 只联网搜索（+抓正文，需登录） |
| `auto`（默认） | 先查本地，有命中即返回；无命中再联网 |

| scope | 范围 |
|---|---|
| `all` | 全站所有版面（约 3 分钟） |
| `top`（默认） | 流量最高的前 5 个版面 |
| `board` | 单版面（配 `boardName`） |
| `section` | 分区递归（配 `boardName` 分区节点 ID） |

本地命中返回的是**历史已持久化**的子集，不是全站；要全量结果用 `scope=all` + `source=remote`。

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
| 内容库 | `data/forum-content.db`（SQLite） | board / article / post / user 表，增量去重（url_hash） |
| 流量库 | `data/forum-traffic.db`（SQLite） | 历史流量采样 |

> `data/`、`.env`、`*.log` 均在 `.gitignore` 中，不进入版本控制。凭证只在 `.env`，从不进入工具入参或日志。

---

## 快速开始

### 环境要求

- Node.js ≥ 22.5（使用内置 `node:sqlite`）
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

### 测试

```bash
npm test             # 单元 + 解析测试（无需登录）
npm run test:coverage
BYR_LIVE=1 npm test -- test/crawl/traffic-live.test.ts   # 真实登录的集成测试（需 .env 凭证）
```

---

## MCP 工具

| 工具名 | 主要参数 | 说明 |
|---|---|---|
| `forum-login` | — | 登录论坛，保存认证 Cookie |
| `forum-fetch-structure` | `parentId?` `refresh?` | 论坛结构树；默认读缓存，refresh 联网 |
| `forum-fetch-board-articles` | `boardName` `maxPages?` `maxItems?` | 版块文章列表，落库 article 表 |
| `forum-fetch-traffic` | `nodeId?` `concurrency?` | 版面/分区流量；采样异步落库 |
| `forum-query-traffic-history` | `boardEname` `from?` `to?` `limit?` | 历史流量查询 |
| `forum-init` | — | 一键爬取全站结构并保存 |
| `forum-search-articles` | `keyword` `source?` `scope?` `boardName?` `author?` `maxPages?` `maxItems?` `maxBoards?` `persist?` `concurrency?` | 搜索文章候选（标题/URL/作者/回复数），不抓正文 |
| `forum-search-threads` | `keyword` `source?` `scope?` `boardName?` `author?` `maxPages?` `maxItems?` `maxBoards?` `maxThreads?` `maxThreadPages?` `persist?` `concurrency?` | 搜索帖子并抓取正文与全部评论，可落库 |

`source ∈ {auto, local, remote}`，`scope ∈ {all, top, board, section}` —— 语义见上文「核心设计」。

---

## 配置

| 文件 | 说明 |
|---|---|
| `config/external/forum.yaml` | 论坛入口（base_url 等） |
| `config/rules/routes.yaml` | 路由模板 |
| `config/rules/selectors.yaml` | CSS 选择器与匿名版面规则 |
| `config/rules/login.yaml` | 登录方式 |
| `config/rules/http.yaml` | 请求头 / 超时 / 编码 |
| `config/rules/log.yaml` | 日志配置 |
| `.env` | 账号密码（不提交；参考 `.env.example`） |

---

## 技术栈

| 组件 | 选型 | 说明 |
|---|---|---|
| 运行时 | Node.js（ESM）+ TypeScript strict | — |
| MCP | `@modelcontextprotocol/server` | stdio 传输 |
| HTTP | axios | arraybuffer 响应 |
| 解析 | cheerio | HTML → 数据 |
| 编码 | iconv-lite | GBK → UTF-8 |
| 存储 | `node:sqlite`（内置） | 零额外依赖 |
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
