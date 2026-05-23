# Multica × Paperclip 拆解文档

> **数据来源**
> - **Multica**：`github.com/multica-ai/multica`（main 分支，2026-05-15 推送）— 通过 `gh api` 拉取目录结构 + 关键文档
> - **Paperclip**：`paperclipai@2026.403.0`（本地 npm 全局包：`D:/App/Dev/nvm/v24.13.0/node_modules/paperclipai/`）— 直接读取 `dist/` 编译产物、UI bundle、bundled skills
>
> **拆解目标**：剖析两个项目的页面/API/技术栈，作为 firefly-mesh 设计的参考基线（治理派 vs 自治派对照）。

---

## 0. 一句话对照

| 项目 | 一句话定位 | 哲学 |
|---|---|---|
| **Multica** | Linear + AI agents as first-class teammates | **多人 + 多 agent 同框协作**，agent 是组里的同事，会被分配 issue、提交 PR、被 mention |
| **Paperclip** | "One Person Company OS" / Zero-human company orchestration | **0 人公司**，agent 自治运行，人类只设定 goal/budget/governance，按 heartbeat 周期自主推进 |

二者**架构选型截然不同**：Multica 用 Go 后端 + Next.js 前端 + sqlc，强调真实多用户场景；Paperclip 用 Node.js + Express + Drizzle + 嵌入式 Postgres，强调单机自托管 + 全自包含。

---

## 1. Multica 拆解

### 1.1 整体架构

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Next.js 16 │────>│  Go (Chi+WS) │────>│  PostgreSQL 17   │
│  App Router  │<────│   sqlc, JWT  │<────│  + pgvector      │
└──────────────┘     └──────┬───────┘     └──────────────────┘
                            │ WebSocket / HTTP poll
                     ┌──────┴───────┐
                     │ multica daemon│ ← 用户机器，自动检测 11 个 CLI
                     │ (Go binary)  │   claude/codex/copilot/openclaw/
                     └──────────────┘   opencode/hermes/gemini/pi/
                                        cursor-agent/kimi/kiro-cli
```

**Monorepo 结构**（pnpm workspaces + Turborepo）：

```
multica/
├── server/                  # Go 后端
│   ├── cmd/                 # 4 个二进制入口
│   │   ├── multica/         #   ← CLI（用户用）
│   │   ├── server/          #   ← API server
│   │   ├── migrate/         #   ← 迁移工具
│   │   └── backfill_*/      #   ← 数据回填脚本
│   ├── internal/            # 业务逻辑
│   ├── pkg/                 # 可复用包
│   └── migrations/          # 50+ SQL migrations
├── apps/
│   ├── web/                 # Next.js 16（主应用）
│   ├── desktop/             # Electron（共享 90% 代码）
│   └── docs/                # 文档站
├── packages/
│   ├── core/                # 业务逻辑（zero react-dom / zero localStorage）
│   ├── views/               # 共享业务组件（zero next/*）
│   ├── ui/                  # 原子组件（shadcn/Base UI 变体）
│   ├── tsconfig/            # 共享 TS 配置
│   └── eslint-config/
└── e2e/                     # Playwright
```

**严格的包边界规则**（这是 Multica 工程哲学的精髓）：
- `packages/core/` —— 0 个 react-dom，0 个 localStorage（用 StorageAdapter），0 个 process.env
- `packages/ui/` —— 0 个 `@multica/core` import（纯 UI，零业务）
- `packages/views/` —— 0 个 `next/*` import，0 个 `react-router-dom`，0 个 Zustand store（store 全部住 core）
- `apps/web/platform/` —— 唯一允许 Next.js API 的地方
- `apps/desktop/src/renderer/src/platform/` —— 唯一允许 react-router-dom 的地方

→ 同一份 `packages/views/` 业务页面，**web 和 desktop 两端共用**，靠各自的 `NavigationAdapter` 注入路由原语。

### 1.2 状态管理（关键架构决策）

| 数据类型 | 归属 | 原则 |
|---|---|---|
| **服务端数据**（issues/users/workspaces/inbox） | TanStack Query Cache | WS event invalidate，从不轮询 |
| **客户端状态**（UI 选择、过滤器、草稿、模态框） | Zustand（住在 `packages/core/`） | 跨平台共享 |
| **跨切面**（WorkspaceIdProvider, NavigationProvider） | React Context | 不滥用 |

**硬规则**：
1. **永远不要把服务端数据复制进 Zustand** — 一份数据两个真相一定会漂移
2. **workspace-scoped query 必须以 `wsId` 为 key** — workspace 切换时 cache key 变，数据自动刷新
3. **Mutation 默认乐观更新** — 本地先改，请求发出去，失败回滚
4. **WS event 只触发 invalidate，不直接写 store** — 保 cache 为唯一真相，避免竞态

### 1.3 页面清单与功能（来自 `apps/web/app/`）

#### 1.3.1 Pre-workspace（认证 + 落地）

| 路径 | 文件 | 功能 |
|---|---|---|
| `/` | `(landing)/page.tsx` | 落地页主页 |
| `/about` | `(landing)/about/` | 公司介绍 |
| `/changelog` | `(landing)/changelog/` | 更新日志 |
| `/download` | `(landing)/download/` | 桌面端下载（macOS/Linux/Windows） |
| `/homepage` | `(landing)/homepage/` | 落地页变体 |
| `/login` | `(auth)/login/` | OAuth 登录入口 |
| `/auth/...` | `auth/` | OAuth 回调 |
| `/onboarding` | `(auth)/onboarding/` | 首次登录 → 创建/选择 workspace |
| `/invitations` | `(auth)/invitations/` | 列出我的待接受邀请 |
| `/invite/:token` | `(auth)/invite/` | 接受邀请页（slug 化 token） |
| `/workspaces` | `(auth)/workspaces/` | workspace 列表 |
| `/workspaces/new` | `(auth)/workspaces/new/` | 创建新 workspace（**注意**：root 全局路由用 `/{noun}/{verb}` 形式，避免与用户 workspace slug 冲突） |

> **路由设计精髓**：新的全局路由必须是单词（`/login`、`/inbox`）或 `/{noun}/{verb}` 对（`/workspaces/new`）。**绝对禁止**带连字符的根路由（`/new-workspace`、`/create-team`），它们会和常见用户 workspace 名冲突。reserved slug 唯一定义在 `server/internal/handler/reserved_slugs.json`，Go 嵌入 JSON，TS 由 `pnpm generate:reserved-slugs` 生成，CI 校验不一致即失败。

#### 1.3.2 Workspace-scoped Dashboard（`/[workspaceSlug]/(dashboard)/`）

| 路径 | 功能 | 关键技术点 |
|---|---|---|
| `/{ws}/inbox` | **通知收件箱** | 跨 workspace 通知聚合；mark-as-read 是乐观更新 |
| `/{ws}/my-issues` | "分给我的 issues" | filter 状态走 Zustand；列表数据走 React Query；按 `assignee=me` 服务端过滤 |
| `/{ws}/issues` | **看板/列表/按 status 分组** | Linear-like 视图；workspace-scoped query key `[wsId, 'issues', ...]` |
| `/{ws}/issues/[id]` | Issue 详情页 | 评论区、活动 timeline、状态机；agent 评论与人类评论同列 |
| `/{ws}/projects` | **项目列表** | Project 是 issue 集合的元结构 |
| `/{ws}/projects/[id]` | 项目详情 | 看板/issue 列表/概览 |
| `/{ws}/agents` | **Agent 注册中心** | 列出本 workspace 所有 agent，按 runtime 分组 |
| `/{ws}/agents/[id]` | Agent 详情：配置、prompt、能力清单 | provider 11 选 1（Claude/Codex/Copilot/...） |
| `/{ws}/squads` | **Squads（团队）** | 一组 agent + 一个 leader agent，分配工作给 squad，leader 决定派给谁 |
| `/{ws}/squads/[id]` | Squad 详情 + 简报（briefing） | `squad_briefing.go` 服务端生成上下文摘要 |
| `/{ws}/skills` | **技能库** | 团队复用的技能（部署、迁移、code review 模板等） |
| `/{ws}/skills/[id]` | 技能详情 / 版本管理 | 技能可被 agent 学习并复用 |
| `/{ws}/runtimes` | **Runtime 监控** | 列出所有 daemon（本地 + 云端），实时状态 |
| `/{ws}/runtimes/[id]` | Runtime 详情：进程、磁盘、版本 | 来自 daemon heartbeat |
| `/{ws}/autopilots` | **Autopilot 触发器** | 定时/事件触发的 agent 任务（"每天早上跑代码扫描"） |
| `/{ws}/autopilots/[id]` | Autopilot 详情 + 历史运行 | cron 表达式 + workspace-scoped |
| `/{ws}/members` | **成员管理** | 人类成员 RBAC |
| `/{ws}/members/[id]` | 成员资料 + 权限 | role-based |
| `/{ws}/settings` | Workspace 设置 | branding / runtime / billing |
| `/{ws}/usage` | **使用量 / 计费** | token、任务数、agent 调用统计 |

#### 1.3.3 关键页面深挖

**(a) `/[ws]/issues/[id]` — Issue 详情**

这是整个产品的核心页面。Agent 在这里"上线"：
- 作为 assignee 出现在 assignee 选择器中
- 有自己的 avatar、profile
- 评论会自动 `@mention` 触发其他 agent 唤醒
- status 变更（claimed → started → blocked → done）由 daemon 调用 `task_lifecycle.go` 推进
- 实时进度通过 WebSocket 推送（`server/internal/realtime/`），前端用 React Query invalidate

**(b) `/[ws]/runtimes` — Runtime 看板**

每台用户机器跑一个 `multica daemon`，注册自己为 runtime。daemon 干三件事：
1. 启动时探测 PATH 上的 11 个 CLI（claude/codex/copilot/openclaw/opencode/hermes/gemini/pi/cursor-agent/kimi/kiro-cli），每个注册为一个 runtime
2. 默认每 3s 轮询服务端的 `claimed task`（可配 `MULTICA_DAEMON_POLL_INTERVAL`）
3. 拿到任务后创建隔离工作目录（`~/multica_workspaces/...`），spawn agent CLI，stream 输出回服务端
4. 每 15s heartbeat（`MULTICA_DAEMON_HEARTBEAT_INTERVAL`），servers 据此判断 daemon 是否存活

**Runtime 垃圾回收**（精妙之处）：
- **Full cleanup**：issue 状态 `done`/`cancelled` 且空闲超 `MULTICA_GC_TTL`（默认 24h）→ 删整个工作目录
- **Orphan cleanup**：没有 `.gc_meta.json` 的目录（daemon crash 残留）→ 超 `MULTICA_GC_ORPHAN_TTL`（默认 72h）删
- **Artifact cleanup**：issue 仍 open 但任务完成 12h+ → 只删 `node_modules`/`.next`/`.turbo`，保留源码 / `.git` / `output/` / `logs/`，让 agent 下次能继续在同一 workdir 上跑

**(c) `/[ws]/squads/[id]` — Squad**

Squad 是 Multica 区别于 Paperclip 的核心抽象。从 README：

> 给一组 agent（外加可选的人类）配一个 leader agent，把工作分给 *squad* 而不是某个具体 agent。leader 决定具体谁来接，路由层稳定地随团队增长。用 `@FrontendTeam` 而不是 `@alice-or-bob-or-carol`。

Squad 触发链：
- `squad_assign_trigger_test.go` —— issue 被分配给 squad 时触发 leader 决策
- `squad_comment_trigger_test.go` —— squad 被 @ 时触发 leader 介入
- `squad_briefing.go` —— 服务端构造 leader 决策需要的上下文摘要
- `squad_no_action.go` —— leader 决定不介入时的处理（避免 noisy 评论）

### 1.4 后端 API（Go / Chi router）

`server/internal/handler/` 中 30+ handler 文件，按领域切：

| 文件 | 职责 |
|---|---|
| `auth.go`, `auth_signup_test.go` | OAuth、登录、注册 |
| `agent.go`, `agent_access.go`, `agent_template.go` | Agent CRUD / 访问控制 / 模板 |
| `daemon.go`, `daemon_ws.go` | Daemon 注册 + WS 长连 |
| `runtime.go`, `runtime_*.go`（~12 个文件） | Runtime 注册、可见性、liveness、版本管理、本地 skill 上报、模型清单上报、热更新 |
| `issue.go`, `issue_batch_test.go`, `issue_reaction.go` | Issue CRUD / 批量操作 / 反应表情 |
| `task_lifecycle.go` | Issue 状态机：enqueue → claim → start → complete/fail |
| `comment.go` | 评论 |
| `mention.go`（在 `server/internal/mention/`） | @mention 解析 + 唤醒目标 agent |
| `chat.go` | 实时聊天通道 |
| `dashboard.go` | Dashboard 聚合数据 |
| `inbox.go` | 通知 inbox |
| `invitation.go`, `onboarding.go` | 邀请 + 新手引导 |
| `project.go`, `project_resource.go` | 项目 + 项目资源 |
| `squad.go`, `squad_briefing.go` | Squad 协调 |
| `skill.go`, `skill_create.go`, `runtime_local_skills.go` | 技能管理（云端 + 本地） |
| `personal_access_token.go` | 个人 access token（用于 CLI 鉴权，90 天有效） |
| `feedback.go` | 用户反馈 |
| `file.go` | 文件上传/下载（runtime artifacts） |
| `github.go` | GitHub 集成（issue 同步、webhook） |
| `heartbeat_scheduler.go` | 调度心跳（autopilot 触发） |
| `subscriber.go` | WS subscriber 管理 |
| `usage_test.go` | 使用量统计 |
| `workspace.go`, `workspace_reserved_slugs.go`, `workspace_revoke.go` | Workspace CRUD / reserved slug 校验 |

**鉴权防御性约束**（`CLAUDE.md` 中明确写）：

- 资源 path param（既接受 UUID 又接受人类可读 ID，如 `MUL-123`）→ **必须**走 loader（`loadIssueForUser`/`loadSkillForUser`/...），用 loader 返回对象的 `entity.ID` 做后续 DB 操作
- 纯 UUID 输入（请求体、query、header）→ 用 `parseUUIDOrBadRequest`，无效就 400
- 这条规则是为了避免 #1661：`util.ParseUUID` 曾静默返回 zero UUID → `DELETE` 返回 204 success 但 SQL `DELETE` 匹配 0 行

**API 响应兼容性约束**：

桌面 app 装在用户机器上比任何后端都老（用户在 0.2.26 会接到 0.3.x / 0.4.x 服务端），所以：
- **Parse, don't cast**：所有 API response 用 `parseWithFallback` + zod schema 解析，验证失败返回 fallback，不抛错
- **禁止裸 `as` cast** 后端数据
- **每个字段当 optional 处理**，downstream 必须 optional chain + default
- **不要把 UI 仅绑死单字段**，组合多信号（cursor 存在性、page length）保留兜底
- **enum drift 必须降级，不能崩**，switch 必须有 default

这是 Linear/Notion 这类装机应用学到的教训。

### 1.5 数据库（PostgreSQL 17 + pgvector）

50+ migrations 涵盖：
- Agents、agent_runtime（轮询、心跳、版本）
- Daemon pairing（CLI 通过 challenge-response 配对）
- Task context（issue 跑起来时的上下文快照）
- Structured skills（结构化的技能定义）
- Verification code + attempts（邮箱验证码，限流）
- Workspace context（workspace 级隔离）

`server/sqlc.yaml` 表明用 **sqlc** 做类型安全的 SQL —— SQL 文件 → Go 类型 → 编译期保证类型正确。

### 1.6 Agent 适配器（`server/pkg/agent/`）

每个 CLI agent 一个 `.go` 文件 + `_test.go`：

```
claude.go    codex.go     copilot.go   cursor.go    gemini.go
hermes.go    kimi.go      kiro.go      openclaw.go  opencode.go    pi.go
```

附加：
- `cursor_invocation.go` + `cursor_invocation_windows.go` / `cursor_invocation_other.go` —— 跨平台调用 cursor-agent
- `proc_windows.go` + `proc_other.go` —— 进程管理跨平台
- `version.go` —— 解析每个 CLI 的版本号
- `models.go` —— 模型清单
- `stderr_tail.go` —— stderr 滚动缓冲（agent crash 时上报最后几行）

**执行环境**（`server/internal/daemon/execenv/`）—— 这是 daemon 启动 agent 进程前的环境准备：
- `codex_home.go` + `codex_home_link.go` —— Codex 多 agent 时通过 `CODEX_HOME` 隔离配置
- `codex_multi_agent.go` —— 同机多 codex agent 不互相污染
- `codex_sandbox.go` —— sandbox 模式
- `codex_skill_strip.go` —— Codex 不支持 skill 时剥离
- `codex_user_skills.go` —— 用户技能注入
- `openclaw_config.go` —— OpenClaw 配置
- `reply_instructions.go` —— 回复指令模板（如何让 agent 回复结构化结果）
- `git.go` —— git clone / checkout 子流程
- `repocache/` —— repo 缓存（避免每次重新 clone）

### 1.7 实时层（`server/internal/realtime/`）

```
broadcaster.go              # 广播器
hub.go                      # WS hub
metrics.go                  # 指标
redis_relay.go              # Redis 中继（多实例部署时）
relay_lifecycle.go          # 中继生命周期
sharded_stream_relay.go     # 分片流中继（高并发优化）
```

→ 单实例：Hub 直连；多实例：通过 Redis pub/sub 中继；高负载：sharded relay 分片。

### 1.8 CLI（`multica` 命令）

| 命令 | 作用 |
|---|---|
| `multica setup` | 一键：配置 + 登录 + 启动 daemon（连 Multica Cloud） |
| `multica setup self-host` | 同上但连本地 selfhost |
| `multica login [--token mul_...]` | 浏览器 OAuth 或 token 登录 |
| `multica daemon start [--foreground]` | 启动 daemon |
| `multica daemon stop` / `status` / `logs [-f]` | 管理 daemon |
| `multica issue list` / `create` | issue 操作 |
| `multica config set <key> <value>` | 配置 server_url / app_url |
| `multica update` | 自动检测安装方式（brew/script）并升级 |

**Agent-specific 环境变量**（每个 agent 都有 `_PATH`、`_MODEL`、`_ARGS`），如 `MULTICA_CLAUDE_PATH` / `MULTICA_CLAUDE_MODEL` / `MULTICA_CLAUDE_ARGS`。`*_ARGS` 用 POSIX shellword 解析（`--model "gpt-5.1 codex" --sandbox read-only` 会被正确拆分）。

---

## 2. Paperclip 拆解

### 2.1 整体架构

```
┌──────────────────────────────────────────────────────────┐
│  paperclipai (Node.js CLI)                               │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ React SPA  │  │ Express API  │  │ Embedded         │ │
│  │ (ui-dist)  │──│  + WS        │──│ PostgreSQL       │ │
│  │            │  │              │  │ (embedded-postgres)│ │
│  └────────────┘  └──────┬───────┘  └──────────────────┘ │
│                         │                                │
│                  ┌──────┴───────┐                        │
│                  │   Adapters   │  Process / HTTP        │
│                  └──────┬───────┘                        │
└─────────────────────────┼────────────────────────────────┘
                          │
                  ┌───────┴────────┐
                  │ Agent processes│  Claude Code / Codex /
                  │ (spawn locally)│  Cursor / OpenClaw / Pi
                  └────────────────┘
```

**Monorepo（npm workspaces）**：
```
paperclipai/                          # CLI 入口
└── node_modules/@paperclipai/
    ├── server/                       # 主服务端 + UI dist
    │   ├── dist/                     # 编译后的 TS
    │   ├── ui-dist/                  # 编译后的 React SPA
    │   └── skills/                   # 内置 skills（注入给 agent）
    │       ├── paperclip/SKILL.md           ← 平台 API skill
    │       ├── paperclip-create-agent/
    │       ├── paperclip-create-plugin/
    │       └── para-memory-files/SKILL.md   ← PARA 知识管理
    ├── db/                           # Drizzle ORM + 嵌入式 Postgres 工具
    │   └── dist/
    │       ├── schema/               # 60+ 表定义
    │       └── migrations/           # 49 个 SQL migration（drizzle-kit）
    ├── shared/                       # 共享类型
    ├── plugin-sdk/                   # 插件 SDK
    └── adapter-*/                    # 6 个 agent 适配器
        ├── adapter-claude-local/
        ├── adapter-codex-local/
        ├── adapter-cursor-local/
        ├── adapter-gemini-local/
        ├── adapter-opencode-local/
        ├── adapter-openclaw-gateway/  ← 唯一非 local 的（gateway 模式）
        ├── adapter-pi-local/
        └── adapter-utils/
```

**技术栈**：

| 层 | 选型 |
|---|---|
| 前端 | React SPA（Vite build），React Router，TanStack Query（推测） |
| 后端 | Node.js ≥20，Express 4，TypeScript |
| 数据库 | PostgreSQL（**嵌入式**：`embedded-postgres` npm 包，进程内启动） |
| ORM | Drizzle ORM 0.38.4，drizzle-kit migrations |
| 实时 | WebSocket（`ws` 包，`realtime/live-events-ws.ts`） |
| 鉴权 | better-auth（`auth/better-auth.js`），JWT for agent runs（`agent-auth-jwt.js`） |
| CLI prompt | `@clack/prompts` |
| 配置 | dotenv + 自定义 config-file |
| 版本管理 | `version.ts` + auto migrate prompt |

### 2.2 启动流程（`dist/index.js`）

1. `loadConfig()` —— 从环境 + 配置文件加载
2. `initTelemetry()` —— OpenTelemetry 初始化
3. 设置 secrets provider env（`PAPERCLIP_SECRETS_PROVIDER`、`_STRICT_MODE`、`_MASTER_KEY_FILE`）
4. `ensurePostgresDatabase()` —— 启动嵌入式 Postgres
5. `inspectMigrations()` —— 检查待执行迁移；若有 → 提示用户 `Apply pending migrations (...) now? (y/N)`（除非 `PAPERCLIP_MIGRATION_AUTO_APPLY=true`）
6. `applyPendingMigrations()`
7. `createApp(db, ...)` —— Express app 装配
8. `createServer(app)` —— Node http server
9. `setupLiveEventsWebSocketServer()` —— WS 升级
10. `printStartupBanner()` —— 打印启动 banner
11. `initializeBoardClaimChallenge()` —— 启动时生成 board claim challenge（首次启动后用户在浏览器输 claim token 绑定 owner 身份）
12. `maybePersistWorktreeRuntimePorts()` —— 给 worktree（多检出）持久化端口

启动后默认在 `http://127.0.0.1:3100`。

### 2.3 Express app 装配（`dist/app.js`）

```js
app.use(express.json(...))          // body parsing
app.use(httpLogger)                 // 请求日志
app.use(privateHostnameGuard(...))  // 拦截非 localhost 访问（默认）
app.use(actorMiddleware(db, ...))   // 鉴权 + 注入 actor
app.use(llmRoutes(db))              // /llms/* 静态 LLM 资源（无需 /api 前缀）

const api = Router()
api.use(boardMutationGuard())       // board-claim 前禁止 mutation
api.use("/health", healthRoutes)
api.use("/companies", companyRoutes(db, storage))
api.use(companySkillRoutes(db))
api.use(agentRoutes(db))
api.use(assetRoutes(db, storage))
api.use(projectRoutes(db))
api.use(issueRoutes(db, storage, {...}))
api.use(routineRoutes(db))
api.use(executionWorkspaceRoutes(db))
api.use(goalRoutes(db))
api.use(approvalRoutes(db))
api.use(secretRoutes(db))
api.use(costRoutes(db))
api.use(activityRoutes(db))
api.use(dashboardRoutes(db))
api.use(sidebarBadgeRoutes(db))
api.use(instanceSettingsRoutes(db))
api.use(pluginRoutes(db, loader, scheduler, jobStore, workerManager, toolDispatcher))
api.use(accessRoutes(db, {...}))

app.use("/api", api)
app.use(pluginUiStaticRoutes(db, ...))   // 插件自带 UI 静态文件
app.use(express.static(uiDist))           // 主 React SPA
app.use(vite.middlewares)                 // 开发时 Vite 中间件
app.use(errorHandler)
```

### 2.4 页面清单（来自 UI bundle 反查 React Router path props）

UI 是 React SPA + React Router。SPA 入口在 `ui-dist/index.html`，主 bundle `index-Br2N7xYL.js`（2.9 MB）。从 bundle 提取的路由：

#### 2.4.1 全局路由

| 路径 | 功能 |
|---|---|
| `/onboarding` | 首次启动 onboarding（创建 owner 账号 + 第一家公司） |
| `/auth` | 登录/注册 |
| `/board-claim/:token` | 启动时 banner 中给出的 claim URL，浏览器输入 → 绑定 owner |
| `/cli-auth/:id` | CLI 通过浏览器审批：CLI 创建 challenge → 浏览器中用户审批 |
| `/invite/:token` | 接受邀请（加入现有公司） |
| `/companies` | 公司列表（一个 instance 可以有多个 company） |
| `/company/settings` | 公司设置 |
| `/company/export/*` | 公司导出（→ 给 Clipmart 用，完整组织包） |
| `/company/import` | 公司导入（从 Clipmart 模板一键拉起一家公司） |
| `/design-guide` | 内置设计指南页（开发者参考） |
| `/tests/ux/runs` | UX 测试运行视图（内部） |

#### 2.4.2 Company-scoped（`:companyPrefix/`）

| 路径 | 功能 |
|---|---|
| `/dashboard` | **公司全景仪表板** |
| `/inbox` | **收件箱**：聚合所有需要人类介入的事件 |
| `/inbox/mine` | 分给我的 |
| `/inbox/all` / `/recent` / `/new` / `/unread` | 不同筛选 |
| `/issues` | **任务/工单列表** |
| `/issues/:issueId` | Issue 详情 |
| `/issues/active` / `/all` / `/backlog` / `/done` / `/recent` | 状态过滤 |
| `/projects` | **项目列表** |
| `/projects/:projectId` | 项目详情 |
| `/projects/:projectId/overview` / `/issues` / `/issues/:filter` / `/workspaces` / `/workspaces/:workspaceId` / `/configuration` / `/budget` | 项目子页（**项目级别 budget！**） |
| `/execution-workspaces/:workspaceId` | **Execution workspace**（一次 agent 执行的隔离工作目录视图） |
| `/agents` | **Agent 列表**（CEO、CTO、Engineer、Designer、Marketer……组织结构） |
| `/agents/:agentId` | Agent 详情 |
| `/agents/:agentId/:tab` | Agent 子 tab（configuration / runs / state） |
| `/agents/:agentId/runs/:runId` | 单次 heartbeat run 详情 |
| `/agents/all` / `/active` / `/paused` / `/error` / `/new` | Agent 状态筛选 + 新建 |
| `/goals` | **公司目标层级** |
| `/goals/:goalId` | Goal 详情（goal ancestry：goal → subgoal → issue） |
| `/approvals` | **审批中心** |
| `/approvals/pending` / `/all` | 筛选 |
| `/approvals/:approvalId` | 审批详情：approve / reject / request-revision / resubmit + comments |
| `/routines` | **定时/事件触发的 routine** |
| `/routines/:routineId` | Routine 详情 + 触发器配置 + 历史 runs |
| `/costs` | **成本中心** |
| `/activity` | 活动 timeline |
| `/org` | **组织架构图**（agent 层级，CEO → CTO → eng leads → engineers） |
| `/plugins` | **插件市场 / 安装管理** |
| `/plugins/:pluginId` | 插件详情 |
| `/settings/*` | 公司设置子页 |
| `/skills/*` | 公司技能库 |

#### 2.4.3 Instance（实例级）

| 路径 | 功能 |
|---|---|
| `/instance` | 实例首页 |
| `/instance/settings/general` | 通用设置 |
| `/instance/settings/experimental` | 实验功能开关 |
| `/instance/settings/heartbeats` | 心跳调度全局开关 |
| `/instance/settings/plugins` | 插件全局设置 |

### 2.5 API 端点全清单（从 `dist/routes/*.js` 提取）

#### Companies
```
GET    /api/companies
GET    /api/companies/stats
GET    /api/companies/issues
GET    /api/companies/:companyId
GET    /api/companies/:companyId/feedback-traces
POST   /api/companies/:companyId/export                    ← 导出整家公司
POST   /api/companies/import/preview
POST   /api/companies/import                                ← 导入整家公司
POST   /api/companies/:companyId/exports/preview
POST   /api/companies/:companyId/exports
POST   /api/companies/:companyId/imports/preview
POST   /api/companies/:companyId/imports/apply
POST   /api/companies
PATCH  /api/companies/:companyId
PATCH  /api/companies/:companyId/branding
POST   /api/companies/:companyId/archive
DELETE /api/companies/:companyId
```

#### Agents
```
GET    /api/companies/:companyId/adapters/:type/models      ← 列模型
GET    /api/companies/:companyId/adapters/:type/detect-model
POST   /api/companies/:companyId/adapters/:type/test-environment
GET    /api/agents/:id/skills
POST   /api/agents/:id/skills/sync                          ← 同步本地 skill
GET    /api/companies/:companyId/agents
GET    /api/instance/scheduler-heartbeats
GET    /api/companies/:companyId/org                        ← 组织结构 JSON
GET    /api/companies/:companyId/org.svg                    ← 组织图 SVG
GET    /api/companies/:companyId/org.png                    ← 组织图 PNG
GET    /api/companies/:companyId/agent-configurations
GET    /api/agents/me                                       ← agent 自查身份
GET    /api/agents/me/inbox-lite                            ← agent heartbeat 用
GET    /api/agents/me/inbox/mine
GET    /api/agents/:id
GET    /api/agents/:id/configuration
GET    /api/agents/:id/config-revisions                     ← 配置版本史
POST   /api/agents/:id/config-revisions/:revisionId/rollback ← 回滚
GET    /api/agents/:id/runtime-state                        ← agent 运行状态
GET    /api/agents/:id/task-sessions
POST   /api/agents/:id/runtime-state/reset-session          ← 重置上下文
POST   /api/companies/:companyId/agent-hires                ← "招聘" agent
POST   /api/companies/:companyId/agents                     ← 直接建 agent
PATCH  /api/agents/:id/permissions
```

#### Issues
```
GET    /api/issues
GET    /api/companies/:companyId/issues
GET    /api/companies/:companyId/labels
POST   /api/companies/:companyId/labels
DELETE /api/labels/:labelId
GET    /api/issues/:id
GET    /api/issues/:id/heartbeat-context                    ← issue 在 heartbeat 触发时的上下文
GET    /api/issues/:id/work-products                        ← 产出物
GET    /api/issues/:id/documents
GET/PUT/DELETE /api/issues/:id/documents/:key
GET    /api/issues/:id/documents/:key/revisions             ← 文档版本
POST   /api/issues/:id/documents/:key/revisions/:revisionId/restore
POST   /api/issues/:id/work-products
PATCH/DELETE /api/work-products/:id
POST/DELETE /api/issues/:id/read                            ← 已读/未读
POST/DELETE /api/issues/:id/inbox-archive
GET    /api/issues/:id/approvals
POST   /api/issues/:id/approvals
DELETE /api/issues/:id/approvals/:approvalId
POST   /api/companies/:companyId/issues
```

#### Goals
```
GET    /api/companies/:companyId/goals
GET    /api/goals/:id
POST   /api/companies/:companyId/goals
PATCH  /api/goals/:id
DELETE /api/goals/:id
```

#### Approvals
```
GET    /api/companies/:companyId/approvals
GET    /api/approvals/:id
POST   /api/companies/:companyId/approvals
GET    /api/approvals/:id/issues
POST   /api/approvals/:id/approve
POST   /api/approvals/:id/reject
POST   /api/approvals/:id/request-revision
POST   /api/approvals/:id/resubmit
GET    /api/approvals/:id/comments
POST   /api/approvals/:id/comments
```

#### Secrets
```
GET    /api/companies/:companyId/secret-providers
GET    /api/companies/:companyId/secrets
POST   /api/companies/:companyId/secrets
POST   /api/secrets/:id/rotate                              ← 密钥轮换
PATCH/DELETE /api/secrets/:id
```

#### Routines
```
GET    /api/companies/:companyId/routines
POST   /api/companies/:companyId/routines
GET    /api/routines/:id
PATCH  /api/routines/:id
GET    /api/routines/:id/runs
POST   /api/routines/:id/triggers
PATCH/DELETE /api/routine-triggers/:id
POST   /api/routine-triggers/:id/rotate-secret
POST   /api/routines/:id/run                                ← 手动触发
POST   /api/routine-triggers/public/:publicId/fire          ← 外部 webhook 公开触发
```

#### Costs / Finance / Budgets
```
POST   /api/companies/:companyId/cost-events                ← agent 主动上报成本
POST   /api/companies/:companyId/finance-events             ← 财务事件
GET    /api/companies/:companyId/costs/summary
GET    /api/companies/:companyId/costs/by-agent
GET    /api/companies/:companyId/costs/by-agent-model
GET    /api/companies/:companyId/costs/by-provider
GET    /api/companies/:companyId/costs/by-biller
GET    /api/companies/:companyId/costs/by-project
GET    /api/companies/:companyId/costs/finance-summary
GET    /api/companies/:companyId/costs/finance-by-biller
GET    /api/companies/:companyId/costs/finance-by-kind
GET    /api/companies/:companyId/costs/finance-events
GET    /api/companies/:companyId/costs/window-spend         ← 窗口期消费
GET    /api/companies/:companyId/costs/quota-windows        ← 配额窗口
GET    /api/companies/:companyId/budgets/overview
POST   /api/companies/:companyId/budgets/policies
POST   /api/companies/:companyId/budget-incidents/:incidentId/resolve
PATCH  /api/companies/:companyId/budgets
PATCH  /api/agents/:agentId/budgets                         ← agent 级 budget
```

#### Execution Workspaces / Projects
```
GET    /api/companies/:companyId/execution-workspaces
GET    /api/execution-workspaces/:id
GET    /api/execution-workspaces/:id/close-readiness        ← 关闭就绪检查
GET    /api/execution-workspaces/:id/workspace-operations
POST   /api/execution-workspaces/:id/runtime-services/:action
PATCH  /api/execution-workspaces/:id

GET    /api/companies/:companyId/projects
GET/POST/PATCH/DELETE /api/projects/:id
GET/POST/PATCH/DELETE /api/projects/:id/workspaces[/:workspaceId]
POST   /api/projects/:id/workspaces/:workspaceId/runtime-services/:action
```

#### Plugins（整套插件系统）
```
GET    /api/plugins                              ← 已装插件
GET    /api/plugins/examples                     ← 示例
GET    /api/plugins/ui-contributions             ← UI 贡献点
GET    /api/plugins/tools                        ← 插件提供的工具
POST   /api/plugins/tools/execute                ← 执行工具
POST   /api/plugins/install                      ← 安装插件
POST   /api/plugins/:pluginId/bridge/data        ← 数据桥接
POST   /api/plugins/:pluginId/bridge/action
POST   /api/plugins/:pluginId/data/:key
POST   /api/plugins/:pluginId/actions/:key
GET    /api/plugins/:pluginId/bridge/stream/:channel  ← SSE 流
GET/DELETE /api/plugins/:pluginId
POST   /api/plugins/:pluginId/enable / disable
GET    /api/plugins/:pluginId/health
GET    /api/plugins/:pluginId/logs
POST   /api/plugins/:pluginId/upgrade
GET/POST /api/plugins/:pluginId/config
POST   /api/plugins/:pluginId/config/test
GET    /api/plugins/:pluginId/jobs
GET    /api/plugins/:pluginId/jobs/:jobId/runs
POST   /api/plugins/:pluginId/jobs/:jobId/trigger
POST   /api/plugins/:pluginId/webhooks/:endpointKey
GET    /api/plugins/:pluginId/dashboard
```

#### Access / Auth
```
GET    /api/board-claim/:token / POST .../claim                ← 首次启动 claim ownership
POST   /api/cli-auth/challenges
GET    /api/cli-auth/challenges/:id
POST   /api/cli-auth/challenges/:id/approve / cancel
GET    /api/cli-auth/me
POST   /api/cli-auth/revoke-current
GET    /api/skills/available
GET    /api/skills/index
GET    /api/skills/:skillName
POST   /api/companies/:companyId/invites
POST   /api/companies/:companyId/openclaw/invite-prompt        ← 生成给 openclaw 用的 invite prompt
GET    /api/invites/:token
GET    /api/invites/:token/onboarding[.txt]
GET    /api/invites/:token/test-resolution
POST   /api/invites/:token/accept
POST   /api/invites/:inviteId/revoke
GET    /api/companies/:companyId/join-requests
POST   /api/companies/:companyId/join-requests/:requestId/approve / reject
POST   /api/join-requests/:requestId/claim-api-key
GET    /api/companies/:companyId/members
PATCH  /api/companies/:companyId/members/:memberId/permissions
```

#### LLM 资源（无 `/api` 前缀，直接挂根）
```
GET /llms/agent-configuration.txt           ← LLM 友好的 agent 配置文档
GET /llms/agent-icons.txt                   ← agent icon 清单
GET /llms/agent-configuration/:adapterType.txt  ← 各适配器的配置文档
```

### 2.6 数据库 schema（60+ 表，Drizzle ORM）

按领域分组：

| 领域 | 表 |
|---|---|
| **认证 & 多租户** | `auth`、`auth_users`（推测）、`companies`、`company_memberships`、`instance_settings`、`instance_user_roles` |
| **Agent 核心** | `agents`、`agent_api_keys`、`agent_config_revisions`、`agent_runtime_state`、`agent_task_sessions`、`agent_wakeup_requests` |
| **Issue & 工作流** | `issues`、`issue_approvals`、`issue_attachments`、`issue_comments`、`issue_documents`、`issue_inbox_archives`、`issue_labels`、`issue_read_states`、`issue_work_products`、`labels` |
| **审批** | `approvals`、`approval_comments` |
| **Goal & Project** | `goals`、`project_goals`、`projects`、`project_workspaces` |
| **执行工作区** | `execution_workspaces`、`workspace_operations`、`workspace_runtime_services` |
| **文档** | `documents`、`document_revisions` |
| **资产** | `assets`、`company_logos` |
| **技能** | `company_skills` |
| **密钥** | `company_secrets`、`company_secret_versions` |
| **路由器/触发** | `routines`、`heartbeat_runs`、`heartbeat_run_events` |
| **费用 & 预算** | `cost_events`、`finance_events`、`budget_policies`、`budget_incidents` |
| **访问** | `invites`、`join_requests`、`cli_auth_challenges`、`board_api_keys`、`principal_permission_grants` |
| **活动** | `activity_log` |
| **插件** | `plugins`、`plugin_config`、`plugin_state`、`plugin_company_settings`、`plugin_entities`、`plugin_jobs`、`plugin_logs`、`plugin_webhooks` |
| **反馈** | `feedback_exports`、`feedback_votes` |

### 2.7 核心运行机制：Heartbeat 模型

Paperclip 与 Multica 最大的哲学差异：**agent 不是被动等任务的工人，而是按 heartbeat 周期主动巡查的自治体**。这从内置的 `paperclip` skill 看得很清楚（节选自 `skills/paperclip/SKILL.md`）：

```
You run in heartbeats — short execution windows triggered by Paperclip.
Each heartbeat, you wake up, check your work, do something useful, and exit.
You do not run continuously.
```

**Heartbeat 注入的环境变量**：
- `PAPERCLIP_AGENT_ID` / `PAPERCLIP_COMPANY_ID` / `PAPERCLIP_API_URL` / `PAPERCLIP_RUN_ID`（每次都有）
- `PAPERCLIP_TASK_ID` / `PAPERCLIP_WAKE_REASON` / `PAPERCLIP_WAKE_COMMENT_ID`（事件触发时）
- `PAPERCLIP_APPROVAL_ID` / `PAPERCLIP_APPROVAL_STATUS`（审批触发时）
- `PAPERCLIP_LINKED_ISSUE_IDS`（comma-separated）
- `PAPERCLIP_API_KEY`（本地适配器：短期 run JWT；远程适配器：操作员配置）

**6 步 heartbeat 协议**（来自 `paperclip` skill）：

1. **Identity**：若上下文无身份，先 `GET /api/agents/me`
2. **Approval follow-up**：若 `PAPERCLIP_APPROVAL_ID` 已设置，先处理审批；解决了就 `PATCH` issue 为 `done`，没解决就评论说明并加链接
3. **Get assignments**：优先 `GET /api/agents/me/inbox-lite`（紧凑列表）；需要全 issue 时 fallback 到 `GET /api/companies/{cid}/issues?assigneeAgentId=...&status=...`
4. **Pick work**：`in_progress` → `todo` → 跳过 `blocked`（除非能解锁）；带 **blocked-task dedup**（防止反复评论同样的 blocked 状态）
5. **Checkout**：必须先 checkout 才能动手，且 `X-Paperclip-Run-Id` header 必带
6. **Do work & report**：完成后 `PATCH` 状态，留评论

**Run audit trail**：所有 mutate 请求**强制**带 `X-Paperclip-Run-Id` header，链上链下打通 heartbeat run。

**Authn**：所有请求 `Authorization: Bearer $PAPERCLIP_API_KEY`，全 JSON over `/api/*`。

### 2.8 Plugin 系统

Paperclip 有完整的 plugin runtime（这是它区别于 Multica 的另一大点 —— Multica 暂无插件市场）：

- **生命周期**：`plugin-lifecycle.ts` —— install / enable / disable / upgrade / uninstall
- **沙箱**：`plugin-runtime-sandbox.ts` —— 插件代码在隔离环境跑
- **能力验证**：`plugin-capability-validator.ts` —— 声明的 capabilities 必须匹配实际行为
- **manifest 校验**：`plugin-manifest-validator.ts`
- **工具系统**：`plugin-tool-registry.ts` + `plugin-tool-dispatcher.ts` —— 插件注册工具，agent 通过 dispatcher 调用
- **作业调度**：`plugin-job-scheduler.ts` + `plugin-job-coordinator.ts` + `plugin-job-store.ts` —— 插件定时作业
- **事件总线**：`plugin-event-bus.ts` + `plugin-stream-bus.ts` —— 插件间通信
- **状态存储**：`plugin-state-store.ts` —— 插件自己的持久化
- **HostServices**：`plugin-host-services.ts` —— 平台暴露给插件的服务
- **dev watcher**：`plugin-dev-watcher.ts` —— 开发时插件热加载
- **secrets handler**：`plugin-secrets-handler.ts`
- **log retention**：`plugin-log-retention.ts`

UI 路由 `/plugins/:pluginId/dashboard` + API `GET /api/plugins/:pluginId/dashboard` 让每个插件可以注册自己的仪表板页面。

### 2.9 Adapter 体系

`adapter-*-local/` 一共 6 个本地适配器（claude / codex / cursor / gemini / opencode / pi）+ 1 个 gateway 适配器（`adapter-openclaw-gateway`）。`adapter-utils/` 是共享工具。

适配器的工作：把 agent 提示词包装成 CLI 调用，捕获 stdout/stderr，解析、上报。

### 2.10 内置 Skills

Paperclip 给 agent 内置了 3 大 skill：

1. **`paperclip`** —— 平台 API skill。文档 ~110 KB，覆盖：
   - heartbeat 协议
   - issue lifecycle（checkout / update / comment）
   - 创建 subtask 与 delegation
   - routine 管理
   - approval 流程
   - cost 上报

2. **`paperclip-create-agent`** —— 让 agent 帮你创建新的 agent（CEO 招聘 CTO）

3. **`paperclip-create-plugin`** —— 让 agent 创建新的插件

4. **`para-memory-files`** —— PARA（Projects/Areas/Resources/Archives）方法的文件系统级记忆：
   - `$AGENT_HOME/life/projects/<name>/{summary.md, items.yaml}` —— 活跃项目
   - `$AGENT_HOME/life/areas/people/<name>/` —— 人物关系
   - `$AGENT_HOME/life/areas/companies/<name>/` —— 组织关系
   - `$AGENT_HOME/life/resources/<topic>/` —— 参考资料
   - `$AGENT_HOME/life/archives/` —— 归档
   - 加上 daily notes / 默会知识 / 周综合的工作流

这是 Paperclip 哲学的一个具体体现：agent 是有"自己生活"的实体，有 memory，有 PARA，有 daily review。

### 2.11 Company Portability (Clipmart)

README 提到 **"COMING SOON: Clipmart"** —— 公司即代码：

> Download and run entire companies with one click. Browse pre-built company templates — full org structures, agent configs, and skills — and import them into your Paperclip instance in seconds.

实现机制已经在 API 里：

```
POST /api/companies/:companyId/export         ← 完整公司打包
POST /api/companies/import/preview            ← 导入前预览
POST /api/companies/import                    ← 导入
POST /api/companies/:companyId/exports        ← 异步导出版
POST /api/companies/:companyId/imports/preview / apply
```

服务端有 `company-portability.ts`、`company-export-readme.ts` 处理打包逻辑。

### 2.12 实时层

`realtime/live-events-ws.ts` —— WebSocket 单文件，挂在 HTTP server 的 upgrade 事件上。客户端通过 SSE-like 协议订阅 company-scoped 事件流（issue 变更、agent 状态、approval 流转）。

---

## 3. 两个项目对照表

### 3.1 顶层对照

| 维度 | Multica | Paperclip |
|---|---|---|
| **哲学** | 人 + agent 同框协作 | 0 人公司，agent 自治 |
| **目标用户** | 2–10 人 AI-native 团队 | 个人创业者、autonomous business 实验者 |
| **核心 metaphor** | Linear-like 任务管理 | 公司 / 组织（CEO/CTO/employees） |
| **后端** | Go（Chi + sqlc + gorilla/websocket） | Node.js（Express + Drizzle + ws） |
| **前端** | Next.js 16 App Router | React SPA + React Router |
| **桌面端** | Electron（与 web 共享 90% 代码） | 没有原生桌面端（CLI + 浏览器） |
| **数据库** | PostgreSQL 17 + pgvector（外部容器） | PostgreSQL（**嵌入式**，进程内） |
| **部署** | Docker Compose / Cloud SaaS / self-host | 单 npm 包，`paperclipai run` 一键启动 |
| **多租户** | workspace = 顶层租户单位 | company = 顶层租户单位，instance 可有多 company |
| **支持的 agent** | 11 个 CLI（claude / codex / copilot / openclaw / opencode / hermes / gemini / pi / cursor-agent / kimi / kiro-cli） | 6 个 local adapter + openclaw gateway |
| **runtime 模型** | 用户机器跑 daemon（Go binary） | 同进程 spawn agent 子进程 |
| **agent 触发** | 被分配 issue → daemon poll/WS | heartbeat 周期 / 事件唤醒 / approval 触发 |
| **组织建模** | Squads（agent group + leader） | 完整 org chart（CEO → CTO → eng leads → engineers） |
| **目标管理** | issue-based | **Goals 层级**（ancestry：goal → subgoal → issue） |
| **预算 / 成本** | usage page（统计） | **完整 budget policy + agent-level budget + finance events + budget incidents** |
| **审批** | 无原生 approval workflow（PR 走 GitHub） | **第一公民**：approvals 资源 + comments + revision request |
| **routine（定时任务）** | Autopilots | Routines（cron + public webhook trigger） |
| **插件** | 无 | **完整插件系统**（sandbox / tools / jobs / webhooks / dashboard） |
| **公司迁移** | workspace export（基础） | **Company Portability**（导出整家公司，Clipmart 计划） |
| **memory 模型** | 数据库 schema（无显式 file memory） | **PARA file memory**（agent 在 `$AGENT_HOME/life/` 持续累积知识） |
| **License** | Other（NOASSERTION） | MIT |
| **Stars（2026-05）** | 28,758 | （未抓） |

### 3.2 共有抽象

两者都有：
- **Workspace / Company 多租户隔离**
- **Issue / Comment / Reaction**
- **Agent profile + assignee picker + agent-as-teammate**
- **实时事件流（WS）**
- **Activity log**
- **Inbox（聚合需要人介入的事件）**
- **Skill 复用**（Multica 是 workspace-scoped；Paperclip 是 company-scoped + 内置）
- **CLI 鉴权**：浏览器 challenge-response（CLI 起 challenge，浏览器审批，返回 token）

### 3.3 互补点

| Multica 有但 Paperclip 没有 | Paperclip 有但 Multica 没有 |
|---|---|
| Squads（团队 + leader 路由） | Org chart（完整组织结构图） |
| Desktop app（Electron） | 嵌入式 Postgres（零依赖部署） |
| 11 个 agent CLI 适配 | 完整 plugin 系统 + UI contribution |
| Daemon 进程 + repocache + workspace GC（多重 TTL 策略） | Routines + 公开 webhook 触发器 |
| 跨平台共享 packages 架构（views/core/ui） | Company Portability / Clipmart（一键拉起整家公司） |
| API response 防御性 zod parse（应对版本漂移） | Heartbeat 协议 + PARA memory（agent 长期记忆） |
| sqlc 类型安全 SQL | Drizzle ORM + drizzle-kit 迁移 |
| Reserved slug JSON → Go + TS 双向生成 | Budget policies + budget incidents（治理级财务） |

### 3.4 firefly-mesh 的设计启示

对照后，firefly-mesh 的"治理派"定位反推得到的差异：

1. **HITL governance**：两者都把 agent 当一等公民，但 Paperclip 偏自治、Multica 偏协作 —— firefly-mesh 应该在 *人类决策路径上* 显式建模（审批/回退/接管），这块 Multica 弱（无原生 approval），Paperclip 有 approval 但服务于 agent 自治
2. **跨 agent 通信协议**：两者都靠 platform-mediated comments + @mention，没有真正的 **A2A（agent-to-agent）协议**层 —— firefly-mesh 的 organization protocol 是真正的空白
3. **组织建模**：Paperclip 的 org chart 是好范例，但是 *单 instance 单 company* 假设强；Multica 的 squad 比 paperclip 的 manager-employee 更灵活，但缺组织级建模
4. **shared cognition（共享认知）**：Paperclip 的 PARA memory 是 *单 agent 私有* 的，Multica 的 skills 是 *workspace 共享* 的 —— **跨 agent 跨 issue 的 shared knowledge base 是双方都没做透的**

---

## 4. 给 firefly-mesh 的 actionable takeaways

1. **路由设计学 Multica**：reserved slug 集中定义 + 跨语言生成（避免 `/new-workspace` 这类坑）
2. **状态管理学 Multica**：server state → React Query；client state → Zustand；WS 只触发 invalidate 不直写 store
3. **API 兼容学 Multica**：`parseWithFallback` + zod，response enum drift 降级而非崩
4. **Agent 抽象学 Paperclip**：agent 有 identity / runtime-state / config-revisions / api-key / wakeup-requests / task-sessions —— 这套实体设计很完整
5. **审批学 Paperclip**：approvals 资源 + comments + revision request + linked issues 是治理派必备
6. **预算学 Paperclip**：cost_events + finance_events + budget_policies + budget_incidents + agent-level budget + window-spend + quota-windows —— 直接借鉴
7. **可移植性学 Paperclip**：组织即代码（export / import / preview），firefly-mesh 应该支持 "组织模板"
8. **Daemon 学 Multica**：repocache + 三级 GC（full / orphan / artifact-only） + workspace-scoped 隔离工作目录
9. **Plugin 学 Paperclip**：UI contributions + tools registry + sandbox + dashboard hooks（如果 firefly-mesh 走开放生态）
10. **Memory 模型**：两边都不够好 —— Paperclip 的 PARA 偏单 agent；Multica 的 skills 偏代码片段；firefly-mesh 的"共享认知层"应该是 *跨 agent / 跨 issue / 可被检索* 的知识图，结合两者优点
