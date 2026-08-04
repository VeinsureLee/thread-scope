# Thread Scope

针对论坛设计的内容爬取 MCP 服务，提供论坛结构发现、帖子增量爬取、内容查询等能力。

## 项目状态

**当前版本：0.1.0** — 基础爬取能力已就绪。

### 已实现

| 功能 | 状态 | 说明 |
|---|---|---|
| 论坛登录 | ✅ | Cookie 认证，自动保存会话 |
| 分区列表 | ✅ | 获取所有分区 |
| 版块列表 | ✅ | 获取指定分区下所有版块及统计信息 |
| 文章列表 | ✅ | 获取版块前 30 篇文章（标题/作者/日期） |
| MCP 工具注册 | ✅ | 4 个工具已注册到 MCP Server |
| GBK 解码 | ✅ | 自动检测 charset，iconv-lite 解码 |

### 待实现

| 功能 | 优先级 | 说明 |
|---|---|---|
| 帖子正文爬取 | P0 | 进入帖子获取楼主内容 |
| 回复爬取 | P0 | 多页回复的增量爬取 |
| SQLite 存储 | P0 | 帖子+回复的持久化存储 |
| 初始化流程 | P1 | 一键爬取全站结构 + 置顶帖 |
| 版块流量信息 | P1 | 在线人数等统计 |
| 增量更新 | P1 | 只爬新帖/新回复，不重复 |
| 流水线架构 | P2 | 爬取→保存→查询解耦 |

---

## 架构设计

### 当前架构（v0.1）

```
┌─────────────────────────────────────────────────┐
│                  MCP Client                      │
└─────────────────────┬───────────────────────────┘
                      │ JSON-RPC (stdio)
┌─────────────────────▼───────────────────────────┐
│               src/index.ts                       │
│            MCP Server 入口（唯一入口）             │
│                                                  │
│  注册工具: hello / forum-login                    │
│           forum-fetch-sections                   │
│           forum-fetch-boards                     │
│           forum-fetch-articles                   │
└──┬────────────┬────────────┬────────────────────┘
   │            │            │
   ▼            ▼            ▼
┌──────┐  ┌──────┐  ┌──────────┐
│ auth │  │crawl │  │ storage  │    ← 功能域
│ 登录  │  │ 爬取  │  │  存储    │
└──┬───┘  └──┬───┘  └────┬─────┘
   │         │            │
   └────┬────┴─────┬──────┘
        │          │
   ┌────▼──────────▼────┐
   │     core/           │          ← 基础设施层
   │ config / types      │
   │ encoding            │
   │ http-client         │
   └─────────────────────┘
```

**功能域划分**：

| 目录 | 领域 | 职责 | 可扩展 |
|---|---|---|---|
| `core/` | 基础设施 | 配置、类型、编码、HTTP 客户端 | 变更基础设施不影响上层 |
| `auth/` | 认证 | 登录流程、`requireLogin` 守卫 | 更换论坛时替换此模块 |
| `crawl/` | 爬取 | 业务爬取函数（分区/版块/文章/帖子） | 新增论坛时添加 `forum2.ts` |
| `storage/` | 存储 | JSON 读写、[未来] SQLite | 换存储引擎不改爬取层 |
| `tools/` | MCP 注册 | Zod schema + handler 组装 | 新工具只需新建文件 + `index.ts` 增加一行 import |

**文件数**：`src/` 下 12 个 `.ts` 文件，其中 `index.ts` 是唯一入口。

**依赖方向**（无循环）：
```
core/  ←  auth/  ←  crawl/  ←  tools/  ←  index.ts
 ↑                    ↑
 └── storage/ ────────┘
```

### 目标架构（v1.0）— 流水线模式

```
┌──────────────────────────────────────────────────────┐
│                    MCP Client                        │
└────────────────────────┬─────────────────────────────┘
                         │ JSON-RPC
┌────────────────────────▼─────────────────────────────┐
│                  src/index.ts                         │
│              MCP Server（工具注册）                    │
└──┬──────────┬──────────┬─────────────────────────────┘
   │          │          │
   ▼          ▼          ▼
┌──────┐ ┌──────┐ ┌──────────┐
│ 查询  │ │ 爬取  │ │ 初始化    │
│ 工具  │ │ 工具  │ │ 工具      │
└──┬───┘ └──┬───┘ └────┬─────┘
   │        │           │
   │   ┌────▼───────────▼────┐
   │   │    Pipeline          │  ← 流水线调度层（新增）
   │   │  ┌──────┐ ┌───────┐ │
   │   │  │Crawler│→│Store  │→│→ 通知
   │   │  │ 爬取  │ │ 存储  │ │
   │   │  └──────┘ └───────┘ │
   │   └─────────────────────┘
   │              │
   │   ┌──────────▼──────────┐
   │   │   Data Layer         │
   │   │  ┌────────┐ ┌─────┐ │
   │   │  │ SQLite │ │JSON │ │
   │   │  │帖子/回复│ │结构 │ │
   │   │  └────────┘ └─────┘ │
   │   └──────────┬──────────┘
   │              │
   └──────────────┘
```

**流水线三阶段**：

| 阶段 | 模块 | 职责 | 并发策略 |
|---|---|---|---|
| **Crawler** | `src/pipeline/crawler.ts` | HTTP 请求、HTML 解析、数据提取 | 多版块并发，单版块串行（尊重论坛） |
| **Store** | `src/pipeline/store.ts` | 数据去重、写入 SQLite/JSON | 单线程串行写入（避免锁冲突） |
| **Query** | `src/pipeline/query.ts` | 从 SQLite/JSON 读取数据返回 | 读操作，无锁竞争 |

**数据流向**：
```
Crawler ──(raw data)──▶ Store ──(saved)──▶ [SQLite / JSON]
                                                  │
Query  ◀──────────────(read)──────────────────────┘
```

**为什么不直接用多线程全部并行？**
- 目标论坛是学校论坛，请求过快可能被限制
- 爬取是 IO 密集型（网络等待），Node.js 异步足够
- 写入 SQLite 需要串行（better-sqlite3 同步 API）
- 流水线模式让不同阶段可以重叠执行：爬第 2 版时，第 1 版正在写入

**为什么 MCP Tool 的"返回数据"和"保存数据"必须分开？**

当前 `forum-fetch-*` 工具只将数据返回给 MCP Client，不做持久化。这是有意为之：

| 模式 | 说明 | 适用场景 |
|---|---|---|
| **返回数据** | Tool handler 返回 JSON 给 MCP Client | 即时查询、预览、调试 |
| **保存数据** | 后台写入 SQLite / JSON 文件 | 批量爬取、增量更新、离线查询 |

分开的原因：

1. **职责单一** — Crawler 不应该知道自己抓到的数据最终去哪了（文件？数据库？API？）。换存储方式时只改 Store，不动 Crawler。

2. **并发安全** — `better-sqlite3` 是同步 API，多线程并发写入会锁冲突。收集阶段的爬取可以并发跑，但写入由 Store 串行处理（事务 + 批量 INSERT）。

3. **去重与合并** — 批量爬 50 个版块时，Store 可以在写入前统一去重、标记增量、合并相邻写入，避免 50 次独立的文件操作。

4. **失败隔离** — 爬取失败（网络超时）不应该污染已有数据；存储失败（磁盘满）不应该让爬取重跑。

在批量爬取场景中，推荐做法是：

```
MCP 工具 "forum-crawl-all"
  │
  ├─ 阶段1: Crawler
  │   并发爬取所有版块 → 收集到内存
  │   如果某个版块失败 → 记录错误，继续下一个
  │
  └─ 阶段2: Store
      批量写入 SQLite（单事务）
      返回统计: "爬了 50 版块，新增 230 帖，失败 3 版块"
```

### 数据存储策略

| 数据类型 | 存储方式 | 理由 |
|---|---|---|
| 论坛结构（分区/版块） | `data/forum-structure.json` | < 50KB，只读为主，版本化管理 |
| 版块统计（在线人数等） | `data/board-stats.json` | 快照数据，每次爬取覆盖 |
| 文章列表索引 | `data/board-{name}.json` | 临时快照，方便快速查询最新帖 |
| 帖子正文 + 回复 | `data/forum.db` (SQLite) | 大体积、增量更新、关联查询 |
| 用户信息 | `data/forum.db` (SQLite) | 与帖子关联，需要 join |

**SQLite 表设计**（待探索版块页面后细化）：

```sql
-- 帖子主表
CREATE TABLE thread (
  id          INTEGER PRIMARY KEY,   -- 论坛帖子 ID（从 URL 提取）
  board_name  TEXT NOT NULL,         -- 所属版块
  title       TEXT NOT NULL,         -- 标题
  author_id   TEXT,                  -- 作者用户名
  created_at  TEXT,                  -- 发帖时间
  updated_at  TEXT,                  -- 最后回复时间
  is_pinned   INTEGER DEFAULT 0,     -- 是否置顶
  content     TEXT,                  -- 楼主正文（HTML）
  crawled_at  TEXT,                  -- 本服务爬取时间
  reply_count INTEGER DEFAULT 0     -- 已知回复数（用于增量判断）
);

-- 回复表
CREATE TABLE reply (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id   INTEGER NOT NULL REFERENCES thread(id),
  floor       INTEGER NOT NULL,      -- 楼层号
  author_id   TEXT,                  -- 回复者
  content     TEXT,                  -- 回复正文（HTML）
  created_at  TEXT,                  -- 回复时间
  crawled_at  TEXT,                  -- 本服务爬取时间
  UNIQUE(thread_id, floor)           -- 防止重复爬取
);

-- 索引
CREATE INDEX idx_thread_board ON thread(board_name, crawled_at);
CREATE INDEX idx_reply_thread ON reply(thread_id, floor);
```

---

## 目录结构

```
thread-scope/
├── src/
│   ├── index.ts                   # MCP Server 入口（唯一入口文件）
│   │
│   ├── core/                      # 基础设施层
│   │   ├── config.ts              #   配置加载（.env → 配置对象）
│   │   ├── types.ts               #   共享类型定义（Section / Board / Article）
│   │   ├── encoding.ts            #   GBK / UTF-8 响应体解码
│   │   └── http-client.ts         #   Cookie 管理 + AJAX GET 请求
│   │
│   ├── auth/                      # 认证层
│   │   └── auth.ts                #   登录流程 + requireLogin 守卫
│   │
│   ├── crawl/                     # 爬取层（业务逻辑）
│   │   └── forum.ts               #   分区列表 / 版块列表 / 文章列表爬取
│   │                              #   [未来] thread.ts — 帖子正文爬取
│   │
│   ├── storage/                   # 存储层
│   │   └── store.ts               #   JSON 读写（结构/统计）
│   │                              #   [未来] db.ts — SQLite 连接
│   │
│   └── tools/                     # MCP 工具注册层
│       ├── login-tool.ts          #   forum-login
│       ├── fetch-sections.ts      #   forum-fetch-sections
│       ├── fetch-boards.ts        #   forum-fetch-boards
│       └── fetch-articles.ts      #   forum-fetch-articles
│
├── test/                          # 测试目录（结构与 src/ 一一对应）
│   ├── core/
│   │   ├── encoding.test.ts      #   GBK/UTF-8 解码
│   │   └── http-client.test.ts   #   Cookie 管理
│   ├── auth/
│   │   └── auth.test.ts          #   认证守卫
│   ├── crawl/
│   │   └── html-parser.test.ts   #   cheerio HTML 解析（本地 fixture）
│   └── storage/
│       └── storage.test.ts       #   JSON 读写
│
├── data/                          # 持久化数据
│   ├── forum-structure.json       #   [计划中] 论坛结构缓存
│   └── forum.db                   #   [计划中] SQLite 数据库
│
├── config/
│   └── config.yaml                # 备用配置（当前未使用）
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

---

## 开发计划

### Phase 1：帖子详情爬取 + SQLite（当前）

**目标**：能够爬取单帖的完整内容（正文 + 回复）并存入 SQLite。

- [ ] 添加 `better-sqlite3` 依赖
- [ ] 实现 `src/db.ts`：SQLite 连接 + 建表
- [ ] 实现 `fetchThreadDetail(threadUrl)`：爬取帖子正文 + 多页回复
- [ ] 实现 `saveThread()` / `saveReply()`：写入 SQLite
- [ ] 注册 MCP 工具 `forum-fetch-thread`

### Phase 2：初始化流程 + 版块统计

**目标**：一键初始化全站数据。

- [ ] 实现 `initForum()`：
  1. 爬取所有分区 → 所有版块 → 保存 `forum-structure.json`
  2. 遍历每个版块，爬取置顶帖 → 存入 SQLite
  3. 记录每个版块的流量信息（在线人数等）
- [ ] 注册 MCP 工具 `forum-init`
- [ ] 实现 `getBoardStats(boardName)`：版块统计

### Phase 3：流水线架构

**目标**：解耦爬取、存储、查询，支持增量更新。

- [ ] 实现 `src/pipeline/crawler.ts`：
  - 任务队列（要爬的版块/帖子）
  - 并发控制（限制同时请求数）
  - 解析器注册机制（不同论坛不同解析规则）
- [ ] 实现 `src/pipeline/store.ts`：
  - 统一的数据写入接口
  - 去重逻辑（通过 UNIQUE 约束 + INSERT OR IGNORE）
  - 增量标记（last_crawled 时间戳）
- [ ] 实现 `src/pipeline/query.ts`：
  - 按版块查询帖子
  - 按时间范围查询
  - 全文搜索（SQLite FTS5）

### Phase 4：增量更新 + 监控

**目标**：持续追踪论坛更新。

- [ ] 实现增量爬取：对比 `reply_count` 判断是否有新回复
- [ ] 实现定时巡检：可配置的巡检间隔
- [ ] 注册 MCP 工具 `forum-check-updates`：检查哪些版块/帖子有更新

---

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装

```bash
git clone <repo>
cd thread-scope
npm install
```

### 配置

```bash
cp .env.example .env
# 编辑 .env，填入论坛账号密码
```

### 启动 MCP 服务

```bash
npm run dev
```

### 使用 MCP Inspector 调试

```bash
npm run inspect
```

---

## MCP 工具列表

| 工具名 | 参数 | 说明 |
|---|---|---|
| `hello` | `name: string` | 测试工具，返回问候语 |
| `forum-login` | （无） | 登录论坛，获取认证 Cookie |
| `forum-fetch-sections` | （无） | 获取所有分区列表 |
| `forum-fetch-boards` | `sectionId: string` | 获取指定分区下的版块 |
| `forum-fetch-articles` | `boardName: string` | 获取指定版块的文章列表 |
| `forum-fetch-thread` | `threadUrl: string` | [计划中] 获取帖子正文及回复 |
| `forum-init` | （无） | [计划中] 初始化全站结构数据 |
| `forum-check-updates` | `boardName?: string` | [计划中] 检查更新 |

---

## 技术栈

| 组件 | 选型 | 理由 |
|---|---|---|
| 运行时 | Node.js (ESM) | MCP SDK 原生支持 |
| 语言 | TypeScript (strict) | 类型安全 |
| HTTP 客户端 | axios | 成熟稳定，支持 arraybuffer |
| HTML 解析 | cheerio | jQuery-like API，服务端友好 |
| 编码处理 | iconv-lite | GBK→UTF-8 转换 |
| 参数校验 | zod v4 | MCP SDK 原生集成 |
| 数据库 | better-sqlite3 | [计划中] 零配置、同步 API、单文件 |
| 配置 | dotenv | 从 .env 加载凭证 |

---

## 设计原则

1. **尊重目标站点**：控制请求频率，不做高频并发
2. **增量优先**：能判断新旧的数据不做全量重爬
3. **模块解耦**：爬取逻辑不依赖存储实现，存储不依赖查询接口
4. **失败可恢复**：每个阶段独立，爬取失败不影响已有数据
