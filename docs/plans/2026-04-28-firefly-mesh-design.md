# firefly-mesh — 产品规格与架构设计（autodev-brainstorm 产出）

> **输入**：[ideation.md](2026-04-28-firefly-mesh-ideation.md) + [oss-scan.md](2026-04-28-firefly-mesh-oss-scan.md) + [meta.md](2026-04-28-firefly-mesh-meta.md)
> **日期**：2026-04-28
> **架构原则**：默认复用开源 + 自研业务核心 + HITL 贯穿所有跨人决策 + BYO-agent

---

## 1. 背景

firefly-mesh 是 firefly（`d:/Dev/Projects/Intelli_cave/MultiAgent`）的 **C 引流路线 spin-off**。两者 codebase 独立，但 design 思想可参考。

**为什么做**（来自 ideation §产品定位 + §市场现状）：

- 当前 multi-agent 协作平台市场有结构性空白：所有竞品（Clawith / SwarmClaw / Multica / Paperclip）都是 **agent 自治派**，无人做 **HITL 治理派**
- 当前 BYO-agent 思路只在 ClawTeam 沾边，但缺组织建模 / RBAC / KB / 审计
- "组织协议层 + 治理层 + 共享认知一站式开源"完全无人做
- 上级项目 firefly 走 SaaS / Enterprise（B + A 路径）；firefly-mesh 走 open-source GitHub 引流（C 路径）

**核心命题**：把"每个员工各自用 agent 干活"变换成"组织级 agent mesh 协同"——员工自带 OpenClaw / Hermes / Claude Code / Cursor / 任意 MCP-ready agent 都能接入同一个组织协议层。

---

## 2. 选型过程

### 评估的 3 个架构方案

| 方案 | 一句话 | 核心思路 |
|---|---|---|
| **方案 1: Next-as-Backend monorepo** | 单 Next.js 16 既前端也后端 | 业务 lib 抽到 packages/core，被 web/skill/mcp 共用 |
| 方案 2: Headless-Backend monorepo | 前后端完全分离 | packages/server (Hono) + packages/web (Next 纯前端) |
| 方案 3: Service-mesh monorepo | 微服务 | 5 个独立 service（a2a / auth / skill / audit / web） |

### 评分矩阵（来自 brainstorm Step 3）

| 方案 | 可行性 | 契合度 | 简洁性 | 调研匹配度 | 总分 |
|---|---|---|---|---|---|
| **方案 1: Next-as-Backend** | **5** | **5** | **5** | **4** | **19** |
| 方案 2: Headless-Backend | 4 | 4 | 3 | 3 | 14 |
| 方案 3: Service-mesh | 3 | 3 | 1 | 2 | 9 |

### 选择方案 1 的理由

1. **团队学习曲线 0** —— firefly 团队已熟 Next.js + Drizzle + Better Auth + AI SDK，复用最大化
2. **单镜像 docker-compose** 满足 "5 分钟接入" 硬指标（ideation §成功标准）
3. **packages/core 复用**：业务逻辑被 web 和 mcp 双方使用，避免双写
4. **符合 v1 standards**：PostHog / Cal.com / Plane 早期都是单体（meta.md lock #8）
5. **方案 3 直接被排除**：违反"v1 standards = open-source v1 best-in-class"硬 lock；10 人 core 维护 5 个 service 是 Brooks's law 反向问题

---

## 3. 架构设计

### 3.1 总览（4 层）

```
┌──────────────────────────────────────────────────────────────────┐
│  packages/web (Next.js 16 App Router) — 浏览器                    │
│  ┌─────────┬───────────┬───────────┬───────────┬─────────────┐ │
│  │ Org Graph│ HITL Inbox│ A2A 追溯  │ Settings  │ Onboarding   │ │
│  │          │           │           │           │ Wizard       │ │
│  └─────────┴───────────┴───────────┴───────────┴─────────────┘ │
│  shadcn/ui · assistant-ui · @xyflow/react · Lucide · next-intl   │
└──────────────────────────────┬───────────────────────────────────┘
                               │  HTTPS · SSE · Server Actions
┌──────────────────────────────▼───────────────────────────────────┐
│  packages/web/app/api/*  +  packages/core (server lib)            │
│  ┌────────────────┬────────────────┬───────────────────────────┐ │
│  │ Auth (BetterA) │ Org / Member   │ Skill registry            │ │
│  │ Token mgmt     │ A2A broker     │ Audit (append-only)       │ │
│  │ HITL engine    │ Task dispatch  │ Boundary (JWT scope)      │ │
│  └────────────────┴────────────────┴───────────────────────────┘ │
│  Vercel AI SDK v6: generateText / generateObject / embedMany     │
│  → 无 ToolLoopAgent（agent runtime 在客户端）                     │
└──────────────────────────────┬───────────────────────────────────┘
                ┌──────────────┴──────────────┐
                ▼                             ▼
┌──────────────────────────┐    ┌────────────────────────────────┐
│  packages/skill           │    │  packages/mcp                  │
│  agentskills.io 包        │    │  独立 Node MCP server          │
│  → npm @firefly-mesh/skill│    │  @modelcontextprotocol/sdk-ts  │
│  注入 firefly.* tools     │    │  暴露同一组 tools              │
└──────────────────────────┘    └────────────────────────────────┘
        ↑                                    ↑
    用户 OpenClaw / Hermes /              用户 Cursor /
    Claude Code 进程                      Claude Desktop 进程

┌──────────────────────────────────────────────────────────────────┐
│  数据层  ·  PostgreSQL 17 + pgvector  ·  单点真值                 │
│  org / employee / agent / task / a2a / skill / audit / token /   │
│  boundary                                                         │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 部署 topology（MVP）

```
公司 admin's machine
   │
   │ git clone github.com/<org>/firefly-mesh
   │ docker-compose up -d
   ▼
┌─────────────────────────────────┐
│  Docker 容器                     │
│  ┌──────────┐  ┌─────────────┐ │
│  │ Postgres │  │ firefly-mesh│ │
│  │  17 +    │←─│  (Next.js   │ │
│  │ pgvector │  │  standalone │ │
│  └──────────┘  │  + skill    │ │
│                │  bundle)    │ │
│                └──────┬──────┘ │
└───────────────────────┼────────┘
                        │ :3000 (web UI + REST + SSE)
                        │ :3001 (MCP server)
       ┌────────────────┼─────────────────┐
       ▼                ▼                 ▼
   员工 OpenClaw    员工 Cursor       员工 Claude Code
   + skill install   + MCP config     + skill install
   firefly           firefly-mesh     firefly
```

---

## 4. 组件设计（packages 拆分）

### 4.1 packages/core （server-side 业务逻辑 lib）

**职责**：纯 TypeScript module exports，无 HTTP server。包含所有业务函数 + Drizzle schema 定义。

**目录结构**：

```
packages/core/
├── db/
│   ├── schema/         # Drizzle schema（每域一文件）
│   │   ├── org.ts
│   │   ├── employee.ts
│   │   ├── agent.ts
│   │   ├── token.ts
│   │   ├── boundary.ts
│   │   ├── skill.ts
│   │   ├── task.ts
│   │   ├── a2a.ts
│   │   └── audit.ts
│   └── index.ts        # drizzle client + 迁移
├── auth/
│   ├── better-auth.ts  # Better Auth config (organizations + RBAC)
│   └── verify.ts       # JWT scope verify
├── a2a/
│   ├── protocol.ts     # Google A2A v1.2 message schema (zod)
│   ├── broker.ts       # 消息路由 + thread 聚合
│   ├── signing.ts      # sender 签名 + verify
│   └── adapters.ts     # 外部 a2a-protocol-sdk 适配（解耦协议变更）
├── hitl/
│   ├── engine.ts       # 状态机：pending_sender / pending_receiver / approved / rejected
│   ├── inbox.ts        # 员工 inbox 查询 + 标记
│   └── audit-hook.ts   # 每次状态变更写 audit
├── task/
│   ├── dispatcher.ts   # 拆解 + 路由（用 Vercel AI SDK generateObject）
│   └── lifecycle.ts    # 提交 / 审核 / 退回 / 升级
├── skill/
│   ├── registry.ts     # 3 层 scope CRUD (company / department / personal)
│   ├── loader.ts       # 该员工有效 skill 计算（Company + 所属 Dept + Personal，Personal > Dept > Company 优先级）
│   └── manifest.ts     # agentskills.io 解析 + semver 校验
├── knowledge/
│   ├── upload.ts       # PDF/DOCX/MD parse + Markdown-aware semantic chunking
│   ├── embed.ts        # batch embedMany via Vercel AI SDK
│   ├── search.ts       # RAG 检索：cosine sim + scope filter（company + 所属 dept + personal）
│   └── pipeline.ts     # 上传 → chunk → embed → ready 异步 task
├── audit/
│   └── log.ts          # append-only 写入 + 查询
├── boundary/
│   └── enforce.ts      # JWT scope server-side enforce middleware
├── llm/
│   └── helper.ts       # generateText / generateObject / embedMany 包装
└── index.ts            # 导出 public API
```

**暴露 API**（关键 functions）：

```ts
// a2a
sendMessage(sender, receiver, type, content, threadId?) → A2AMessage
listInbox(employeeId, filter) → A2AMessage[]
approveSend(messageId, approverEmployeeId) → A2AMessage
acceptReceive(messageId, accepterEmployeeId) → A2AMessage

// hitl
createPending(action, requester, approver) → PendingApproval
approve / reject(approvalId, employeeId)
listPending(employeeId)

// task
dispatchTask(creatorEmployeeId, description) → { decomposition: SubTask[], pendingApprovalId }
approveDispatch(approvalId, employeeId) → Task[]
submitTask(taskId, output, employeeId) → Task
reviewTask(taskId, decision: 'approved' | 'rejected', reviewerEmployeeId, comment?)

// skill
registerSkill(scope, manifest) → Skill
listSkills(scope, query) → Skill[]
matchSkillsForRole(role) → Skill[]

// audit
log(actorType, actorId, action, resource, payload?) → AuditEntry
queryAudit(filter) → AuditEntry[]

// boundary
enforceScope(agentId, requiredScope) → boolean
```

**依赖**：`drizzle-orm`、`pg`、`zod`、`ai` (Vercel SDK v6)、`a2a-protocol-sdk`、`better-auth`、`@modelcontextprotocol/sdk-typescript` (peer for mcp 包)。

### 4.2 packages/web （Next.js 16 应用）

**职责**：前端 UI（5 个 MVP 页面）+ API Routes + SSE。Import packages/core。

**目录结构**：

```
packages/web/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── organization/page.tsx       # P5 Org graph
│   │   ├── inbox/page.tsx              # P9 HITL Inbox
│   │   ├── audit/page.tsx              # P11 A2A 追溯
│   │   └── settings/page.tsx
│   ├── onboarding/
│   │   ├── page.tsx                     # P0 部署后 wizard 入口
│   │   ├── create-org/page.tsx
│   │   ├── import-employees/page.tsx
│   │   └── generate-tokens/page.tsx     # P4 token 生成
│   ├── api/
│   │   ├── auth/[...all]/route.ts       # Better Auth handler
│   │   ├── org/route.ts
│   │   ├── employee/route.ts
│   │   ├── token/route.ts
│   │   ├── task/
│   │   │   ├── dispatch/route.ts
│   │   │   ├── approve-dispatch/route.ts
│   │   │   ├── list/route.ts
│   │   │   ├── submit/route.ts
│   │   │   └── review/route.ts
│   │   ├── a2a/
│   │   │   ├── send/route.ts
│   │   │   ├── inbox/route.ts
│   │   │   ├── approve/route.ts
│   │   │   └── accept/route.ts
│   │   ├── skill/route.ts
│   │   ├── audit/route.ts
│   │   ├── stream/route.ts              # SSE 推送
│   │   └── well-known/
│   │       └── agent-card.json/route.ts # A2A v1.2 agent card
│   ├── layout.tsx
│   ├── globals.css                      # Tailwind v4 @theme
│   └── i18n/
│       ├── zh.json
│       └── en.json
├── components/
│   ├── ui/                              # shadcn 组件
│   ├── org-chart/                       # xyflow 节点 + Drawer
│   ├── a2a-trace/                       # 时间线 + filter
│   ├── inbox/                           # 双 tab + quick action
│   └── shared/
├── lib/
│   ├── api-client.ts                    # fetch wrapper（type-safe，从 sdk 包导入 schema）
│   └── stream-client.ts                 # SSE EventSource hook
└── public/
```

**接口对外**：HTTPS + SSE。HTTP API schema 由 zod 定义（在 packages/sdk 中），客户端 / mcp / skill 都引用同一份 schema。

**依赖**：`packages/core`、`packages/sdk` (peer)、`next` 16、`react` 19、`@assistant-ui/react`、`@xyflow/react`、`shadcn/ui`、`lucide-react`、`tailwindcss` v4、`zod`、`react-hook-form`、`zustand`、`@tanstack/react-query`、`next-intl`。

### 4.3 packages/skill （agentskills.io 包）

**职责**：发布到 npm 的 `@firefly-mesh/skill` 包，让 OpenClaw / Hermes / Claude Code 用户 `<agent> skill install firefly` 一行接入。

**目录结构**：

```
packages/skill/
├── SKILL.md                # agentskills.io 元数据
├── tools/
│   ├── task.ts             # firefly.task.list / submit / output
│   ├── a2a.ts              # firefly.a2a.send / inbox / approve / accept
│   ├── skill.ts            # firefly.skill.load / list
│   └── kb.ts               # firefly.kb.search (V2 stub，MVP 返回空)
├── client/
│   ├── http.ts             # 调用 packages/web 的 HTTP API
│   ├── sse.ts              # 订阅 stream
│   └── auth.ts             # token 持久化（per agent runtime 适配）
├── package.json            # name: "@firefly-mesh/skill"
└── README.md
```

**关键约束**：
- **Spec 100% 兼容 agentskills.io** —— CI 跑 [anthropics/skills](https://github.com/anthropics/skills) 官方 lint
- **不依赖 packages/core**（core 是 server-only）；只依赖 `packages/sdk` 的 typed client
- **运行环境**：在用户的 agent 进程内（OpenClaw / Hermes / Claude Code）

### 4.4 packages/mcp （独立 MCP server）

**职责**：用 `@modelcontextprotocol/sdk-typescript` 包装同一组 tools，给 Cursor / Claude Desktop / 任意 MCP-ready agent 用。

**目录结构**：

```
packages/mcp/
├── server.ts               # MCP server entry（stdio + HTTP/SSE transport）
├── tools/
│   ├── task.ts             # 与 skill 同名同 signature
│   ├── a2a.ts
│   ├── skill.ts
│   └── kb.ts
├── auth/
│   └── token.ts            # 接受 OAuth-style token
├── package.json
└── Dockerfile              # 独立镜像 firefly-mesh-mcp
```

**关键约束**：
- 与 skill 包**同 backend、同工具签名**（避免接入碎片）
- MCP server 默认在 `:3001` 端口跑，与 web `:3000` 同 docker-compose
- **不嵌进 web**：因为 MCP 协议有 stdio transport（一些 client 用 stdin/stdout）

### 4.5 packages/sdk （typed HTTP client）

**职责**：暴露 typed REST client + zod schema，给 packages/skill / packages/mcp / packages/web client / 第三方开发者共用。

```
packages/sdk/
├── schema/
│   ├── task.ts             # zod schema for /api/task/*
│   ├── a2a.ts
│   ├── skill.ts
│   └── audit.ts
├── client/
│   ├── http.ts             # fetch-based client
│   └── sse.ts
└── index.ts                # 导出 typed client
```

### 4.6 deploy/

```
deploy/
├── docker-compose/
│   ├── docker-compose.yml          # MVP：postgres + firefly-mesh + mcp
│   ├── .env.example
│   └── README.md                    # 5 分钟接入指南
├── helm/                            # V2（A 路径触发时）
└── seed/
    └── cyberautonomy/               # W2 dogfooding 模板包
        ├── employees.csv
        ├── skills/                  # 内置 skill 模板
        └── seed.ts
```

---

## 5. 数据流：W1 CEO 任务扩散端到端

```
[1] CEO Alice 在 OpenClaw 里说："Q3 华东市场拓展，3 周内出方案"
      │
      ▼
[2] OpenClaw 加载的 firefly skill 注入 firefly.task.create_and_dispatch tool
    → CEO agent 调用之
      │
      ▼  HTTPS POST /api/task/dispatch
[3] packages/web/app/api/task/dispatch/route.ts
    a) verify Alice 的 sender 签名（agent token + employee_id + scope）
       → 失败：401 + audit "signature_failed"
    b) 调用 core/task/dispatcher.ts 的 decomposeWithLLM(description)
       → Vercel AI SDK generateObject + zod schema
       → 返回 SubTask[] {target_dept_or_role, summary, deadline}
    c) 写 task 表（status='pending_dispatch_approval'）+ 创建 PendingApproval
    d) SSE 推送给 Alice 的 web UI："拆解方案待你批准"
    e) 写 audit_log
       │
       ▼
[4] Alice 在 web UI 看到拆解方案 → 点"批准下达"（HITL 点 1）
      │
      ▼  HTTPS POST /api/task/approve-dispatch
[5] task/approve-dispatch/route.ts
    a) 调用 core/hitl/engine.ts 的 approve(approvalId, Alice.id)
    b) 调用 core/task/dispatcher.ts 的 routeSubTasks()
       → 按 skill match + role 路由到具体 employees
    c) 为每个 sub-task 创建 task（status='assigned'）
    d) 创建 a2a_message（type='handoff'，sender=Alice agent，receiver=各员工 agent）
    e) SSE 推送给所有 receiver 员工的 web UI："收到新任务"
    f) audit_log
      │
      ▼
[6] 销售 manager Bob 在自己的 Hermes Agent 里调 firefly.task.list()
    → packages/skill 的 tools/task.ts 调 GET /api/task/list?employee_id=Bob
    → 返回任务队列
      │
      ▼
[7] Bob 与 Hermes 协作完成方案 → Hermes 调 firefly.task.submit(task_id, output)
    → HTTPS POST /api/task/submit
    → status='pending_review'，创建 PendingApproval（reviewer=Bob 上级 Carol）
    → SSE 推送给 Carol
      │
      ▼
[8] Carol 在 web UI 点"通过"或"退回 + 批注"（HITL 点 3）
    → 通过：task='approved'，向上汇总
    → 退回：task='rejected'，回到 Bob inbox
      │
      ▼
[9] 全部 sub-task 通过 → CEO 收到 a2a_message（type='inform'）+ 完整审计链
```

**关键不变量**：
- 每一步写 audit_log（append-only）
- 每个 HITL 点都是 server 拦截，不允许 agent 自报完成
- sender 签名 verify 在 step 3a，确保身份归属
- JWT scope 在每个 API route 入口都 enforce

---

## 6. 数据模型（Drizzle schema 关键表）

> **设计原则**：从 firefly schema "fork-and-trim"——保留 MVP 必需字段，删 V2 字段。所有表带 `orgId` 多租户列。

### 6.1 organizations / employees / departments / projects

```typescript
// packages/core/db/schema/org.ts
import { pgTable, text, uuid, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { user } from './better-auth';

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').unique().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const employees = pgTable('employees', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  orgId: uuid('org_id').references(() => organizations.id).notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  title: text('title'),
  status: text('status', { enum: ['active', 'archived'] }).default('active').notNull(),
  role: text('role', {
    enum: ['owner', 'admin', 'manager', 'employee', 'auditor'],
  }).default('employee').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const departments = pgTable('departments', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').references(() => organizations.id).notNull(),
  parentId: uuid('parent_id'),
  name: text('name').notNull(),
});

export const departmentMembers = pgTable('department_members', {
  departmentId: uuid('department_id').references(() => departments.id).notNull(),
  employeeId: uuid('employee_id').references(() => employees.id).notNull(),
  role: text('role', { enum: ['head', 'member'] }).default('member'),
}, (t) => ({ pk: primaryKey({ columns: [t.departmentId, t.employeeId] }) }));

export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').references(() => organizations.id).notNull(),
  name: text('name').notNull(),
  status: text('status', { enum: ['planning', 'active', 'done', 'archived'] }).default('planning'),
});

export const projectMembers = pgTable('project_members', {
  projectId: uuid('project_id').references(() => projects.id).notNull(),
  employeeId: uuid('employee_id').references(() => employees.id).notNull(),
  role: text('role'),
}, (t) => ({ pk: primaryKey({ columns: [t.projectId, t.employeeId] }) }));
```

### 6.2 agents（元数据，无 runtime）

```typescript
// packages/core/db/schema/agent.ts
import { pgTable, text, uuid, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { employees, organizations } from './org';

export const agents = pgTable('agents', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').references(() => organizations.id).notNull(),
  ownerEmployeeId: uuid('owner_employee_id').references(() => employees.id, { onDelete: 'cascade' }).notNull(),

  // BYO-agent: 不存 runtime 配置，只记录用户的 agent 类型 + 接入信息
  runtimeKind: text('runtime_kind', {
    enum: ['openclaw', 'hermes', 'claude-code', 'cursor', 'claude-desktop', 'other-mcp', 'unknown']
  }).default('unknown').notNull(),
  runtimeMeta: jsonb('runtime_meta').$type<{
    version?: string;
    protocolVersion?: string;
    skillManifestVersion?: string;
  }>().default({}),

  status: text('status', { enum: ['inactive', 'active', 'archived'] }).default('inactive').notNull(),
  lastSeenAt: timestamp('last_seen_at'),
  activatedAt: timestamp('activated_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

### 6.3 agent_tokens（接入凭据）

```typescript
// packages/core/db/schema/token.ts
export const agentTokens = pgTable('agent_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').references(() => organizations.id).notNull(),
  employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'cascade' }).notNull(),

  // 一次性 token：发给员工接入；接入后绑定到一个 agent_id
  tokenHash: text('token_hash').notNull(),  // SHA-256 hash，原 token 只在生成时返回
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),

  status: text('status', { enum: ['pending', 'consumed', 'revoked', 'expired'] }).default('pending'),
  expiresAt: timestamp('expires_at').notNull(),
  consumedAt: timestamp('consumed_at'),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdBy: uuid('created_by').references(() => employees.id),  // admin
});
```

### 6.4 representation_boundaries（JWT scope）

```typescript
// packages/core/db/schema/boundary.ts
export const boundaries = pgTable('representation_boundaries', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'cascade' }).notNull(),
  scopes: jsonb('scopes').$type<string[]>().default([]).notNull(),
  // 例：["read_customer_data", "propose_deal", "send_external_email"]
  // server-side enforce: 每个 API route 调用 boundary.enforceScope(agentId, requiredScope)
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

### 6.5 skills（agentskills.io 兼容）

```typescript
// packages/core/db/schema/skill.ts
export const skills = pgTable('skills', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').references(() => organizations.id).notNull(),

  // agentskills.io 元数据
  manifestId: text('manifest_id').notNull(),  // 如 "firefly-mesh/email-draft"
  version: text('version').notNull(),
  manifest: jsonb('manifest').$type<SkillManifest>().notNull(),

  // 2026-04-28 范围扩展（方案 Y）：3 层 namespace
  scope: text('scope', { enum: ['company', 'department', 'personal'] }).default('company').notNull(),
  // V2 加 'project' (依赖项目动态组织 V0.2)
  // 优先级：personal > department > company（员工可在自己 scope 覆盖上层）

  // scope 关联（按 scope 二选一，company scope 时两者均 null）
  departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'cascade' }),
  ownerEmployeeId: uuid('owner_employee_id').references(() => employees.id, { onDelete: 'cascade' }),
  // CHECK 约束：scope='department' → departmentId 非空；scope='personal' → ownerEmployeeId 非空

  status: text('status', { enum: ['active', 'deprecated', 'archived'] }).default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const agentSkills = pgTable('agent_skills', {
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'cascade' }).notNull(),
  skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'cascade' }).notNull(),
  enabled: text('enabled').default('true'),
}, (t) => ({ pk: primaryKey({ columns: [t.agentId, t.skillId] }) }));
```

### 6.6 tasks

```typescript
// packages/core/db/schema/task.ts
export const tasks = pgTable('tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').references(() => organizations.id).notNull(),

  parentId: uuid('parent_id'),  // self-ref，goal ancestry
  rootId: uuid('root_id'),       // 同一 ancestry 的根

  creatorEmployeeId: uuid('creator_employee_id').references(() => employees.id).notNull(),
  assigneeEmployeeId: uuid('assignee_employee_id').references(() => employees.id),
  reviewerEmployeeId: uuid('reviewer_employee_id').references(() => employees.id),

  title: text('title').notNull(),
  description: text('description'),
  output: jsonb('output'),

  status: text('status', {
    enum: [
      'pending_dispatch_approval',  // CEO 拆解后等待 CEO 批准下达
      'assigned',                    // 已分派
      'in_progress',
      'pending_review',              // 员工提交后等待审核
      'rejected',                    // 退回
      'approved',                    // 通过
      'cancelled',
    ]
  }).default('assigned').notNull(),

  dispatchApprovalId: uuid('dispatch_approval_id'),  // 关联 PendingApproval
  reviewApprovalId: uuid('review_approval_id'),

  reviewRound: text('review_round').default('0'),
  reviewComment: text('review_comment'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

### 6.7 a2a_messages + a2a_threads（Google A2A v1.2 schema）

```typescript
// packages/core/db/schema/a2a.ts
export const a2aThreads = pgTable('a2a_threads', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').references(() => organizations.id).notNull(),
  topic: text('topic'),
  relatedTaskId: uuid('related_task_id').references(() => tasks.id),
  messageCount: text('message_count').default('0'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const a2aMessages = pgTable('a2a_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').references(() => organizations.id).notNull(),
  threadId: uuid('thread_id').references(() => a2aThreads.id).notNull(),
  replyToMessageId: uuid('reply_to_message_id'),

  // sender / receiver identity（与 firefly schema 同源）
  senderAgentId: uuid('sender_agent_id').references(() => agents.id).notNull(),
  senderEmployeeId: uuid('sender_employee_id').references(() => employees.id).notNull(),
  senderSignature: text('sender_signature').notNull(),  // 签名 verify 用

  receiverAgentId: uuid('receiver_agent_id').references(() => agents.id).notNull(),
  receiverEmployeeId: uuid('receiver_employee_id').references(() => employees.id).notNull(),

  // A2A 7 种类型
  type: text('type', {
    enum: ['inform', 'sync', 'request', 'commit', 'handoff', 'escalate', 'block']
  }).notNull(),

  content: jsonb('content').$type<{
    summary: string;
    body?: string;
    structured?: Record<string, unknown>;
  }>().notNull(),

  // HITL 双向状态机
  senderApprovalRequired: text('sender_approval_required').default('false'),
  senderApprovalStatus: text('sender_approval_status', {
    enum: ['pending', 'approved', 'rejected', 'auto']
  }).default('auto'),
  senderApprovalBy: uuid('sender_approval_by').references(() => employees.id),
  senderApprovalAt: timestamp('sender_approval_at'),

  receiverActionRequired: text('receiver_action_required').default('false'),
  receiverActionStatus: text('receiver_action_status', {
    enum: ['pending', 'accepted', 'rejected', 'auto']
  }).default('auto'),
  receiverActionBy: uuid('receiver_action_by').references(() => employees.id),
  receiverActionAt: timestamp('receiver_action_at'),

  relatedTaskId: uuid('related_task_id').references(() => tasks.id),

  confidenceScore: text('confidence_score'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

### 6.7b knowledge_documents + knowledge_chunks（P12 新增 — 三层 KB）

```typescript
// packages/core/db/schema/knowledge.ts
export const knowledgeDocuments = pgTable('knowledge_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').references(() => organizations.id).notNull(),

  // 3 层 namespace（Project 留 V0.2）
  scope: text('scope', { enum: ['company', 'department', 'personal'] }).notNull(),
  departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'cascade' }),
  ownerEmployeeId: uuid('owner_employee_id').references(() => employees.id, { onDelete: 'cascade' }),
  // 同 skill：CHECK scope='department' → departmentId 非空；scope='personal' → ownerEmployeeId 非空

  title: text('title').notNull(),
  description: text('description'),
  tags: jsonb('tags').$type<string[]>().default([]),

  // 原文件
  fileType: text('file_type', { enum: ['pdf', 'docx', 'md', 'txt', 'html'] }).notNull(),
  fileUrl: text('file_url'),  // 对象存储路径
  fileSize: text('file_size'),

  // 索引状态
  indexStatus: text('index_status', {
    enum: ['pending', 'indexing', 'ready', 'failed']
  }).default('pending').notNull(),
  chunkCount: text('chunk_count').default('0'),
  embedModel: text('embed_model'),  // e.g. 'voyage-3-large'
  lastIndexedAt: timestamp('last_indexed_at'),

  createdBy: uuid('created_by').references(() => employees.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const knowledgeChunks = pgTable('knowledge_chunks', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id').references(() => knowledgeDocuments.id, { onDelete: 'cascade' }).notNull(),
  orgId: uuid('org_id').references(() => organizations.id).notNull(),  // 冗余，filter 用

  // 继承 document 的 scope（query 时 join 也行，但冗余加速 RAG 查询）
  scope: text('scope').notNull(),
  departmentId: uuid('department_id'),
  ownerEmployeeId: uuid('owner_employee_id'),

  chunkIndex: text('chunk_index').notNull(),
  content: text('content').notNull(),

  // pgvector 嵌入向量（按 voyage-3-large 维度 2048 / 也可用 OpenAI text-embedding-3-large 3072）
  embedding: vector('embedding', { dimensions: 2048 }),

  // chunking 元数据（Markdown-aware semantic chunking）
  startOffset: text('start_offset'),
  endOffset: text('end_offset'),
  headingPath: jsonb('heading_path').$type<string[]>(),  // ['## 章', '### 节']

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  // pgvector HNSW 索引
  embeddingIdx: index('embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
}));
```

**关键设计**：
- **Markdown-aware semantic chunking**（来自 oss-scan §audit #4 调研）：保持 heading 边界 / 段落 / 列表完整；不切函数 / 段落中间
- 向量 dim = 2048（voyage-3-large），可 swap 为 3072（OpenAI v3-large）；schema 用 `vector(2048)` 时切换需 migration
- HNSW 索引（pgvector ≥ 0.5 默认）
- chunk 表带冗余 scope 字段 → RAG 查询不必 join，按 scope filter 即查
- **不上**：hybrid search（V2）/ GraphRAG / RAPTOR / 跨 scope 重排

---

### 6.8 audit_log（append-only）

```typescript
// packages/core/db/schema/audit.ts
export const auditLog = pgTable('audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').references(() => organizations.id).notNull(),

  actorType: text('actor_type', { enum: ['human', 'agent', 'system'] }).notNull(),
  actorId: text('actor_id'),  // employee_id / agent_id / 'system'

  action: text('action').notNull(),  // e.g. "task.dispatch", "a2a.send", "agent.activate"
  resourceType: text('resource_type'),  // e.g. "task", "a2a_message", "agent"
  resourceId: text('resource_id'),

  payload: jsonb('payload'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  // append-only constraint：禁止 update / delete（DB 层）
  // 通过 PostgreSQL trigger / row policy 强制
}));
```

DB 层 append-only：用 PostgreSQL `CREATE OR REPLACE RULE audit_log_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING;` + 同样 for DELETE。

### 6.9 表数量小结

**MVP 共 14 张表**（2026-04-28 范围扩展，加 knowledge_documents + knowledge_chunks）：
org / employee / department / department_member / project / project_member / agent / agent_token / boundary / skill / agent_skill / task / a2a_thread / a2a_message / audit_log / **knowledge_documents** / **knowledge_chunks**。

V2 新增（不在本 design 内）：memory（mem0 风格） / budget / sop_node / external_action / project KB+skill 第 4 层 等。

---

## 7. 错误处理 + 降级策略

| 故障 | 处理 | 降级 |
|---|---|---|
| Postgres 不可达 | server 5xx；UI banner；agent skill retry with backoff | 全功能不可用（self-host 单点是设计权衡） |
| LLM 拆解失败（task dispatch） | AI Gateway 自动 failover（Anthropic / Google / OpenAI 之间）；3 次失败 → task `dispatch_failed`，admin 手动 retry | 不 silent fallback（违反 CLAUDE.md 全局规则）|
| Agent token expired / revoked | 401 + `WWW-Authenticate: Bearer error="invalid_token"`；agent skill 提示员工重新接入 | - |
| Sender 签名 verify 失败 | 401 + audit `signature_verification_failed`；不暴露具体原因 | - |
| HITL 状态机超时（员工 24h 不点） | MVP：定期 cron 标记 `stale`；UI 显示 banner | V2 自动 escalate 上级 |
| A2A thread 软上限（10 条往返） | MVP：UI 警告；admin 可手动暂停 | V2 死循环检测 |
| LLM 输出 schema 不合法 | zod safeParse 拒绝；audit `llm_output_invalid`；任务挂起 | - |
| MCP runtime 不兼容（Cursor 异常） | MVP：UI 显示 known-issue + 引导切到 skill 模式 | best-effort，不强保证 |

---

## 8. 测试策略

| 层 | 工具 | 覆盖范围 |
|---|---|---|
| 单元 | vitest | core/* 业务函数：HITL 状态机、A2A 路由、签名 verify、JWT scope、task lifecycle、skill registry |
| 集成 | vitest + testcontainers Postgres | API routes：W1 全链路 happy path + 5 个失败模式（FM 1-5） |
| E2E | Playwright | 5 demo story：①admin 部署 + 创组织 ②员工接入 ③CEO 任务下达 + 审批 ④A2A inbox 处理 ⑤audit 追溯 |
| Skill 兼容性 | 自动化 smoke test（GitHub Actions matrix） | OpenClaw / Hermes / Claude Code 各装一个真实 agent，跑 skill install + tool invocation |
| MCP 兼容性 | smoke test | Cursor / Claude Desktop（用 MCP CLI / SDK 模拟） |
| Agent runtime 健康 | 单独 CI job | 每个 PR 跑跨 runtime smoke |

**覆盖率目标**：
- core/* unit ≥ 90%
- API routes happy path 100%
- E2E 5/5 demo story 通过
- Skill smoke 3/3 通过（OpenClaw / Hermes / Claude Code）
- MCP smoke 2/2 通过（Cursor / Claude Desktop）

---

## 9. 风险与缓解

| 风险 | 来源 | 缓解 |
|---|---|---|
| **A2A v1.2 spec 演进**（半年内） | LF 主导持续迭代 | core/a2a/ 隔离协议层；升级时只改 adapter |
| **agentskills.io spec 不严格遵守** | 我们写的 skill 在 OpenClaw 跑、Hermes 不跑 | CI 跑 [anthropics/skills](https://github.com/anthropics/skills) 官方 lint + 三 runtime smoke |
| **MCP runtime 行为差异**（Cursor vs Claude Desktop） | MCP spec 留实现空间 | MVP 只 claim Cursor + Claude Desktop 兼容；其它 best-effort |
| **接入门槛 > 5 分钟** | wizard / docs 不够顺 | 内部 dogfooding 测；新员工跑全流程 < 5 分钟才发布 |
| **HITL 摩擦** | strictness 不可调（V2） | MVP 默认严格度（commit/request/handoff 必批 + inform/sync 自动）；V2 加配置 |
| **server-side LLM 失败导致 W1 卡住** | LLM 拆解失败 | AI Gateway failover + 任务挂起 manual retry，不 silent fallback |
| **Brooks's law（10 人 core 协作慢）** | 模块边界不清 | 5 packages × ~2 人 owner；CI 强制 PR review；packages/core 是 single source of truth |
| **数据驻留焦虑** | 公司不愿对话上传外部 | self-host 默认；SaaS 是 V2 opt-in，不是默认 |
| **监管不能审计 agent 行为** | append-only 审计强度不够 | DB 层 RULE 强制 no-update/no-delete + 每日快照（V2 加 WORM 存储） |

---

## 10. 与 firefly 上级项目的代码复用边界

**原则**：在文件层"fork-and-trim"，在依赖层"独立 codebase"。

| 能力 | firefly 路径 | firefly-mesh 处理 |
|---|---|---|
| Drizzle schema | `MultiAgent/web/lib/db/schema/` 17 文件 | **fork-and-trim 6 个**到 packages/core/db/schema/：org / employee / agent / a2a / audit / agent-signing。删 V2 表（budget / knowledge / memory / external-action / gdpr / theater / dlq / rate-limit）。**不直接 import** |
| Better Auth 配置 | `web/lib/auth.ts` | 复制并简化（去掉 firefly 业务字段） |
| A2A 协议 | `web/lib/ai/` 内部实现 | **重写**——firefly-mesh 走 a2a-protocol-sdk（LF 官方），对外开放，不复用 firefly 内部 |
| HITL engine | `web/lib/ai/boundary.ts` 等 | **借鉴算法 + 表设计**，重写而不直接 import（因为 firefly 走 ToolLoopAgent，firefly-mesh 不走） |
| Task dispatcher | `web/lib/ai/auto-dispatch.ts` 等 | 借鉴 LLM 拆解 prompt，重写 |
| skill registry | `web/lib/ai/skill-matcher.ts` | 借鉴语义匹配思路，重写（V2 才用 LLM 语义；MVP 用 tag 匹配） |
| UI 组件（shadcn 基础） | `web/components/ui/` | **直接 fork**（shadcn 是 copy-paste 哲学，本来就该 fork） |
| UI 业务组件（org-chart / a2a-trace） | `web/components/organization/` 等 | **借鉴布局 + 重写**（精简 V2 字段渲染） |
| 设计系统 tokens | `MultiAgent/DESIGN.md` | **直接复用**（同样的 Claude 配色 / Tailwind v4 @theme） |
| autodev 文档命名 | `docs/plans/YYYY-MM-DD-*-*.md` | **直接复用** |

**远期**：firefly upgrade-backlog B1 / B2 落地后，可以反过来从 firefly-mesh import 标准化部分（agentskills.io spec layer / lib/ai 的 toolless 部分）。

---

## 11. 已知限制

MVP 范围 lock decision 之外的限制（V2/Future 解决）：

1. **Skill registry 三级冲突**（personal > company > public）— MVP 只 company / personal 二层；public 留 V2
2. **HITL strictness 可调** — MVP 用默认严格度
3. **A2A 死循环检测** — MVP 用预算硬限保底
4. **三层 KB + RAG** — MVP 不开 KB（KB 在 W2 dogfooding 配置包里通过 hardcode skill 间接提供）
5. **Self-improving skill 收纳** — MVP 不接收 agent 自创 skill
6. **SOP DAG 编辑器** — MVP 用 hardcoded SOP（在 W2 的 seed 里）
7. **Dashboard 任务流可视化** — MVP 用简单任务列表
8. **Per-user 记忆（mem0）** — MVP 不上；Server 不存 agent 记忆，记忆在客户端 agent 自己 manage
9. **三层预算** — MVP 单一 daily budget per org
10. **Agent 接入状态实时监控** — MVP 仅 lastSeenAt 字段；V2 加协议版本检测 + 健康度

---

## 12. 阶段交接

下一步：**Step 4 (autodev-ui)**——基于本设计的 5 个 MVP 页面（Org Graph / HITL Inbox / A2A 追溯 / Settings / Onboarding wizard），产出 `2026-04-28-firefly-mesh-ui.md`：
- 配色 tokens（继承 firefly DESIGN.md）
- 5 页面线框图
- HITL 视觉规范（强提示 / 双向审批 UI）
- 组件规格

**注**：用户已指示 "go 123 到 4 停下"——本 brainstorm Step 3 完成后停在 Step 4 之前，等待用户确认。

---

**Design 完成。**
