# firefly-mesh — 实施计划（autodev-plan 产出）

> **输入**：[ideation](2026-04-28-firefly-mesh-ideation.md) + [oss-scan](2026-04-28-firefly-mesh-oss-scan.md) + [design](2026-04-28-firefly-mesh-design.md) + [ui](2026-04-28-firefly-mesh-ui.md) + [api](2026-04-28-firefly-mesh-api.md)
> **原则**：契约式验收 / 禁占位 / 禁 mock / 禁降阶 / 按设计文档忠实实现
> **MVP 目标**：可演示 W1 (CEO 任务扩散) + W2 (Cyberautonomy dogfooding) 端到端
> **时间窗**：10 周 wall time（10 人 core team，目标区间 9-14 周）

---

## 1. 范围与里程碑

### MVP 16 项（来自 ideation）

| 平台层 P | 场景层 W |
|---|---|
| P1 docker-compose / P2 firefly skill / P3 MCP server / P4 token / P5 org graph / P6 boundary / P7 A2A 7 type / P8 双向 HITL / P9 inbox UI / P10 audit / P11 A2A 追溯 / P12 三层 KB / P13 三层 Skill / P14 Personal 跨设备 | W1 CEO 任务扩散 / W2 Cyberautonomy dogfooding |

### 关键路径

```
M0 工程初始化 ─▶ M1 基础设施 ─▶ M2 组织+agent ─▶ M3 HITL+Inbox ─▶ M4 A2A ─▶ M5 W1 demo
                                                                              │
                                                                              ▼
                                                                       M6 Audit 追溯
                                                                              │
                                                       ┌──────────────────────┴────────────┐
                                                       ▼                                   ▼
                                                  M7 KB pipeline                    M8 Skill registry
                                                       │                                   │
                                                       └────────────┬──────────────────────┘
                                                                    ▼
                                                          M9 Skill 包 + MCP server
                                                                    │
                                                                    ▼
                                                  M10 测试 / 文档 / W2 / GitHub 首发
```

### 时间估算（10 人 core team）

| Milestone | wall time | 人力分配 | 关键里程碑 |
|---|---|---|---|
| M0 工程初始化 | 0.5 周 | 5 人并行 | repo + 工具链就绪 |
| M1 基础设施 | 1 周 | 4 人 | auth + RBAC + audit + SSE |
| M2 组织 + agent | 1 周 | 3 人 | org graph + agent activate 跑通 |
| M3 HITL + Inbox | 1 周 | 4 人 | inbox UI + HITL 状态机 |
| M4 A2A 协议层 | 1.5 周 | 3 人 | 7 type + 双向 HITL + 签名 verify |
| M5 W1 demo | 1 周 | 5 人 | CEO 任务扩散端到端 |
| M6 Audit 追溯 | 0.5 周 | 2 人 | /audit 页面 |
| M7 KB pipeline | 1.5 周 | 4 人 | chunking + embed + 三层 RAG |
| M8 Skill registry | 1 周 | 3 人 | 三层 skill + dry-run |
| M9 Skill 包 + MCP | 1 周 | 3 人 | npm 包发布 + MCP image |
| M10 测试 / 首发 | 1 周 | 全员 | E2E + 文档 + W2 + ProductHunt |
| **Total** | **10 周** | - | - |

---

## 2. 红线（继承 firefly rules + 适配 firefly-mesh）

### 2.1 质量红线（六条，PR 级别 blocker）

#### R1 禁止占位
- 禁 `TODO` / `FIXME` / `HACK` / `XXX` 注释
- 禁空函数体 / `pass` / `return undefined`（除非 void）
- 禁 `throw new Error('not implemented')`
- 禁注释掉的代码留在提交里

#### R2 禁止 Mock
- 禁 mock / dummy / fake 数据替代真实调用
- 测试 mock 必须放 `__tests__/` 或 `*.test.ts`
- Seed 数据是真实数据

#### R3 禁止降阶
- 必须按 `design.md` 指定方案实现
- 必须按 `api.md` 指定端点 + zod schema 实现
- 必须按 `ui.md` 指定配色 + 布局实现
- 不可行 → 停下 escalate 用户，**禁止**自己写"先用简单替代"

#### R4 禁止过时版本
- 所有依赖 `pnpm add <pkg>@latest`
- 引用 API 不能用 deprecated 签名
- 不确定 → WebSearch 查最新文档

#### R5 开源优先
- oss-scan 推荐项必须使用
- 自研必须 design.md 有"自研理由"

#### R6 UI 禁 emoji
- 严禁 JSX text 节点 / template string 写 emoji
- 唯一图标 lucide-react，strokeWidth=1.75（空态 1.5）
- 白名单：i18n JSON / 注释 / UGC / Markdown 文档

### 2.2 firefly-mesh 特有红线（新增）

#### R7 BYO-agent 不可破坏
- server 端**永远不**跑 ToolLoopAgent / agent loop
- LLM 调用仅 generateText / generateObject / embedMany / streamText
- 试图引入 agent runtime SDK（OpenAI Agents SDK / Mastra / LangGraph）= blocker

#### R8 三层 scope 不可绕过
- 所有 KB / Skill 写入必须经 `withScope` 中间件
- 跨 scope 检索（如 employee 查别 dept）= 403
- 即便 admin 也不能跨 org（multi-tenant 硬边界）

#### R9 HITL 不可在客户端
- HITL 状态机是 server 端真值
- 客户端 agent 不能"自报已完成 HITL"
- 状态切换必须 server 端 transaction + audit_log 写入

#### R10 sender 签名不可缺失
- A2A endpoints 必须 `withSenderSignature` 中间件
- ed25519 verify 失败 → 401 SIGNATURE_FAILED + audit
- agent 接入时必须注册 publicKey

### 2.3 降阶信号词扫描（红线 R3 自动化）

每个 PR 自动 grep 以下词，命中 = blocker：

```
for now | later | 暂时 | 先用 | 简单起见 | as a workaround
placeholder | mock | stub | dummy | fake (in non-test files)
先...后面再 | to be replaced | will integrate later
简化版 | 简易版 | lightweight version
TODO | FIXME | HACK | XXX
```

发现命中 → 引用 design / api / ui 原文重写。

---

## 3. GAN 自审触发条件（每 task 完成）

### 3.1 Code GAN（每 task）

```bash
pnpm lint                      # ESLint flat config，无 warning
pnpm typecheck                 # tsc --noEmit，无 error
pnpm test {affected}           # vitest 相关单元 + 集成测试通过
pnpm build                     # Next.js + skill + mcp 三个 package 都 build 通过
```

### 3.2 UI GAN（仅 UI task）

- 双语 i18n 完整（zh.json + en.json，无硬编码字符串）
- a11y：keyboard nav 可达 / aria-label 齐 / 颜色对比度 ≥ 4.5:1（WCAG AA）
- 响应式：1280 / 1024 / 768 三断点截图对比设计稿（Playwright）
- 设计真值：仅用 var(--color-*)，禁硬编码 hex
- 状态三元组：Loading / Empty / Error 全部覆盖

### 3.3 PR template

```markdown
## What
{改动内容简述，引用 ideation P/W 编号}

## Acceptance criteria checked
- [ ] {引用 plan task 的 acceptance_criteria 逐条勾}

## Red-line scan
- [ ] grep TODO/FIXME/mock/placeholder 0 命中
- [ ] grep 降阶信号词 0 命中
- [ ] 引用了 design / api / ui 文档

## Testing
- [ ] Unit test
- [ ] Integration test
- [ ] E2E (if UI)

Reviewer: @{tech-lead-or-domain-owner}
```

PR 必须 ≥ 1 个 reviewer approve；UI / API 改动必须 tech lead approve。

---

## 4. 里程碑详细任务

### M0：工程初始化（0.5 周，5 人并行）

#### Task M0-1：Monorepo + Next.js 16 项目
**Owner**：Tech lead Leo
**描述**：创建 Turborepo / pnpm workspace 结构，packages/{core,web,skill,mcp,sdk} + deploy/

```bash
pnpm dlx create-turbo@latest firefly-mesh
# 调整为 packages/{core,web,skill,mcp,sdk} + deploy/{docker-compose,helm,seed}
```

acceptance_criteria:
- 根目录有 `pnpm-workspace.yaml` 列出 5 packages
- `pnpm install` 成功
- 5 packages 各有 `package.json`
- `packages/web` 是 Next.js 16 App Router 项目（`pnpm dev` 启动 :3000）
- `pnpm build` 在所有 packages 成功
status: pending

#### Task M0-2：基础依赖安装
**Owner**：Backend lead

```bash
# packages/core
pnpm --filter core add drizzle-orm@latest pg@latest better-auth@latest \
  ai@latest @ai-sdk/anthropic@latest @ai-sdk/google@latest @ai-sdk/openai@latest \
  zod@latest a2a-protocol-sdk@latest
pnpm --filter core add -D @types/pg@latest vitest@latest tsx@latest

# packages/web
pnpm --filter web add @assistant-ui/react@latest @xyflow/react@latest dagre@latest \
  lucide-react@latest next-intl@latest
pnpm --filter web add @tanstack/react-query@latest zustand@latest \
  react-hook-form@latest @hookform/resolvers@latest
pnpm --filter web add tailwindcss@latest tailwindcss-animate@latest

# packages/skill
pnpm --filter skill add -D tsup@latest

# packages/mcp
pnpm --filter mcp add @modelcontextprotocol/sdk-typescript@latest

# 全局 dev
pnpm add -wD drizzle-kit@latest @types/dagre@latest @playwright/test@latest
```

acceptance_criteria:
- 所有命令带 `@latest`（红线 R4）
- `pnpm list -r` 没有 ⚠️ deprecated 包
- `package.json` 在每个 package 列出对应依赖
- 全 monorepo `pnpm typecheck` 通过
status: pending

#### Task M0-3：Tailwind v4 + globals.css fork firefly tokens
**Owner**：Frontend lead
**描述**：从 firefly `web/app/globals.css` fork 完整 tokens（Claude 配色 + 字体 + 圆角 + 阴影 + keyframes）到 packages/web/app/globals.css。

acceptance_criteria:
- `packages/web/app/globals.css` 存在
- 包含完整 `@theme` 块（继承 firefly globals.css 全部 CSS 变量）
- 包含 4 个 keyframe（mesh-in / save-flash / message-flash / pulse-orange）
- `prefers-reduced-motion` 媒体查询存在
- 验证：在测试页面渲染 `bg-primary` / `text-foreground` 颜色正确
status: pending

#### Task M0-4：shadcn/ui 12 基础组件 fork
**Owner**：Frontend lead

```bash
cd packages/web
pnpm dlx shadcn@latest init  # base color = neutral
pnpm dlx shadcn@latest add avatar badge button card dialog dropdown-menu input scroll-area separator sheet skeleton tabs
```

acceptance_criteria:
- `packages/web/components/ui/` 含 12 个组件文件（来自 ui.md §5 矩阵）
- 配色 token 用 `var(--color-*)` 不硬编码
- 在 demo 页面渲染每个组件验证
status: pending

#### Task M0-5：docker-compose self-host MVP
**Owner**：DevOps + Tech lead
**描述**：deploy/docker-compose/docker-compose.yml + Dockerfile，实现 P1（5 分钟接入硬指标）

```yaml
# 核心服务
services:
  postgres:
    image: pgvector/pgvector:pg17
    volumes: [pgdata:/var/lib/postgresql/data]
  firefly-mesh:
    image: firefly-mesh:latest
    depends_on: [postgres]
    ports: ['3000:3000']
  firefly-mesh-mcp:
    image: firefly-mesh-mcp:latest
    depends_on: [firefly-mesh]
    ports: ['3001:3001']
```

acceptance_criteria:
- `cd deploy/docker-compose && docker compose up -d` 5 分钟内全部 healthy
- `curl localhost:3000/api/health` 返回 200
- pgvector 扩展自动启用（migration 0 检查）
- README 给出 5 分钟接入指南
status: pending

#### M0 验收（关联 P1）
- [ ] `pnpm install && pnpm build && pnpm dev` 全 monorepo 通过
- [ ] `docker compose up -d` 起 server + DB
- [ ] tokens / shadcn 基础全可用
- [ ] CI（GitHub Actions）模板就绪：lint + typecheck + build + test 4 步骤

---

### M1：基础设施（1 周，4 人并行）

#### Task M1-1：Drizzle schema 14 张表
**Owner**：Backend lead
**描述**：按 design §6 创建 14 张表 schema 到 `packages/core/db/schema/*.ts`，每域一文件

文件列表：org.ts / agent.ts / token.ts / boundary.ts / skill.ts / task.ts / a2a.ts / knowledge.ts / audit.ts

acceptance_criteria:
- `packages/core/db/schema/` 含 9 个 schema 文件（按 design §6 字段精确）
- `pnpm drizzle-kit generate` 产出 migration SQL（按 api §6.1 顺序）
- `pnpm drizzle-kit migrate` 在 docker-compose Postgres 上成功
- 全部表 SELECT count(*) FROM 不报错
- 所有表带 `org_id` 列（multi-tenant）
status: pending

#### Task M1-2：Better Auth 配置 + organizations
**Owner**：Auth dev
**描述**：`packages/core/auth/better-auth.ts` 配置 Better Auth + organizations plugin + RBAC

acceptance_criteria:
- 提供 `auth.api.signIn / signUp / getSession / signOut` 函数
- organizations plugin 启用，与自定义 employees 表 join
- `/api/auth/[...all]/route.ts` mount Better Auth handler
- 测试：注册新 user → 加入 org → getSession 返回正确 employee + role
status: pending

#### Task M1-3：中间件链
**Owner**：Backend dev
**描述**：实现 5 个中间件（按 api §2.3）

```typescript
// packages/core/middleware/
withAuth.ts          // 验 cookie/Bearer，注入 session
withOrgGuard.ts      // 强制 SQL WHERE org_id 注入
withRBAC.ts          // 检查 role
withScope.ts         // 检查 agent boundary scopes
withSenderSignature.ts  // ed25519 verify
```

acceptance_criteria:
- 5 个中间件文件存在并通过 vitest
- 单元测试覆盖：未登录 401 / 跨 org 404 / RBAC 拒 403 / scope 拒 403 / 签名 fail 401
- middleware 通过 zod 解析 session 注入
- audit_log 在每次拒绝时写入
status: pending

#### Task M1-4：audit_log + DB-level RULE
**Owner**：DBA / Backend
**描述**：实现 append-only 审计 + DB RULE 强制

acceptance_criteria:
- `packages/core/audit/log.ts` 提供 `logAction({ actorType, actorId, action, resourceType, resourceId, payload })`
- migration 19_constraints_and_rules.sql 含 audit_log no-update / no-delete RULE
- 测试：UPDATE audit_log → 0 rows affected；DELETE audit_log → 0 rows affected
- 所有 5 个中间件都调 logAction
status: pending

#### Task M1-5：SSE 事件总线 + stream endpoint
**Owner**：Realtime dev
**描述**：`packages/core/events/bus.ts` + `packages/web/app/api/stream/route.ts`

acceptance_criteria:
- 内存 pub/sub 实现（MVP；Redis 留 V2）
- SSE handler 支持 `?topic=...` 订阅
- 30s keep-alive `:keepalive\n\n`
- 客户端断线自动 EventSource 重连
- 单元测试：发布消息 → 订阅者收到
status: pending

#### Task M1-6：scope catalog + boundary 表初始化
**Owner**：Auth dev
**描述**：实现 api §2.4 boundary scope catalog

acceptance_criteria:
- `packages/core/boundary/catalog.ts` 导出 SCOPE_CATALOG 常量（10 个 scope + dangerous flag）
- 默认 scope（员工接入）= 6 个安全 scope
- danger scope（send_external_email / sign_contract）默认 disabled
- `withScope([...])` 中间件 unit 测试覆盖
status: pending

#### Task M1-7：LLM helper（仅 toolless）
**Owner**：Backend dev
**描述**：`packages/core/llm/helper.ts`，仅暴露 generateText / generateObject / embedMany / streamText 四个函数；**红线 R7：禁引入 ToolLoopAgent**

acceptance_criteria:
- 4 个函数通过 Vercel AI Gateway，支持 model 字符串路由
- 单元测试：调用 anthropic/claude-sonnet-4-6 返回正常
- failover 测试：模拟 provider 1 fail → AI Gateway 切 provider 2
- code review 确认 NO `import { ToolLoopAgent }` from 'ai'
status: pending

#### M1 验收（关联 P1 部分 / P6 / P10）
- [ ] 14 表 migration 跑过，schema 无 drift
- [ ] 5 个中间件 unit test 100% 通过
- [ ] audit_log 跨 RULE 强制
- [ ] SSE 端到端可订阅
- [ ] LLM helper 调通 Anthropic / Google / OpenAI 三 provider
- [ ] 红线扫描：grep TODO/mock/placeholder = 0 命中

---

### M2：组织 + agent 元数据（1 周，3 人）

#### Task M2-1：employees / departments / projects API
**Owner**：Backend dev
**描述**：实现 api §4.2 的 9 个端点（GET /api/org / org/graph / employee CRUD / department CRUD / project CRUD）

acceptance_criteria:
- 9 个端点全部实现 + zod parse + RBAC enforce
- `GET /api/org/graph` 一次返回完整结构（小公司 < 200 人）
- POST employee 创建后 SSE `org.graph.{orgId}` 推 `employee.added`
- 集成测试：admin 创建 employee + dept + assign → 验证完整状态
status: pending

#### Task M2-2：agent_tokens 管理 + 一次性凭据
**Owner**：Auth dev
**描述**：实现 api §4.3 的 token 端点（GET / POST / batch / revoke / regenerate）

acceptance_criteria:
- `POST /api/token` 返回 tokenId + plainToken（仅返回一次）
- DB 存 tokenHash（SHA-256），不存 plain
- consume 后写 consumed_at + 关联 agent_id
- revoke 后该 token 调 API 401
- 单元测试覆盖 lifecycle pending → consumed → revoked / expired
status: pending

#### Task M2-3：agent activate 端点 + ed25519 keypair
**Owner**：Auth dev + Backend
**描述**：实现 api §4.9 的 `POST /api/agent/activate`

acceptance_criteria:
- 接受 oneTimeToken + runtimeKind + publicKey → 返回 agentId + JWT
- agent_tokens.consumed_at 写入
- agents 表创建 row（runtimeKind / publicKey）
- JWT 含 sub / emp / org / scopes / iat
- agent heartbeat 端点更新 lastSeenAt + 推 SSE `org.graph` event
- audit_log `agent.activated` 写入
status: pending

#### Task M2-4：boundary 端点 + JWT scope 同步
**Owner**：Auth dev
**描述**：实现 api §4.3 boundary 端点

acceptance_criteria:
- `GET /api/boundary?agentId=...` 返回当前 scopes
- `PUT /api/boundary/{agentId}` 改 scopes 后撤销该 agent 现有 JWT（强制 reactivate）
- scope 必须 ⊆ SCOPE_CATALOG
- audit_log `boundary.changed` 写入
status: pending

#### Task M2-5：Org graph UI（fork firefly）
**Owner**：Frontend lead
**描述**：实现 ui §4.2 /organization 页面，fork firefly `web/components/organization/{org-chart,agent-detail-drawer,node-edit-dialog,org-toolbar,confirm-dialog,image-dropzone}.tsx`

acceptance_criteria:
- /organization 页面渲染 xyflow + Dagre 树状图
- 节点 click → Sheet drawer 滑入（3 tab Profile / Agent / Boundary）
- Agent tab 显示 runtimeKind / lastSeen / token 8 位（带 Regenerate 按钮）
- Boundary tab 显示 scope catalog checkbox（admin 可改）
- mesh-in 入场动画 + save-flash 保存动画 工作
- 双语 i18n 完整
status: pending

#### Task M2-6：CSV 批量导入员工
**Owner**：Frontend + Backend
**描述**：实现 api `POST /api/employee/import` + UI fork firefly `import-preview.tsx`

acceptance_criteria:
- multipart CSV 上传，解析 + 预览表格
- 表格可 inline 编辑（修名 / 删行 / 改 role）
- "Confirm Import" 一次创建所有 employees
- 错误行高亮 + 不允许 Confirm
- 测试 CSV：50 行无错；50 行带 5 错误行
status: pending

#### M2 验收（关联 P4 / P5 / P6）
- [ ] /organization 页面可视化 50 人组织（性能 < 1s 渲染）
- [ ] CSV 导入 50 人 < 5 秒
- [ ] agent activate 流程跑通：admin 生成 token → 模拟 agent → 拿到 JWT
- [ ] boundary 改 scope 后 agent 越权动作 403

---

### M3：HITL 引擎 + Inbox UI（1 周，4 人）

#### Task M3-1：HITL 状态机 core 实现
**Owner**：Backend lead
**描述**：`packages/core/hitl/engine.ts` 状态机（pending_sender / pending_receiver / approved / rejected）

acceptance_criteria:
- 实现 createPending / approve / reject / accept / reject-receive 5 个 transition 函数
- 每个 transition 写 audit_log + emit SSE event
- 状态机不变性测试（已 approved 不可再 reject）
- 单元测试覆盖 7 种 A2A type × HITL 矩阵（api §4.3）
status: pending

#### Task M3-2：a2a/{id}/approve|reject|accept|reject-receive 4 端点
**Owner**：Backend dev
**描述**：实现 api §4.5 的 4 个 HITL 端点

acceptance_criteria:
- 4 端点完整 zod schema + RBAC（自己 OR 部门内）
- approve sender 后自动算 receiver HITL（commit/request/handoff → pending；inform/sync → auto deliver）
- 测试：完整 sender→approve→receiver→accept 链路
- audit_log 跨步骤可重建状态
status: pending

#### Task M3-3：Inbox UI 双 tab + drawer
**Owner**：Frontend lead
**描述**：实现 ui §4.1 /inbox 页面 + InboxRow + Sheet drawer

acceptance_criteria:
- /inbox 双 tab（待我批准发送 / 待我处理）
- list 行渲染：type badge（4 种 accent 色） / sender → receiver / timestamp / quick action
- 点击行 → Sheet drawer 显示完整内容（按 ui §4.1 线框）
- drawer 底部 sticky [Approve] [Reject] 按钮（带 A/R 快捷键）
- approve 后行从 list 消失（fade-out + height collapse）
- 双语 i18n + a11y keyboard nav
status: pending

#### Task M3-4：Inbox SSE 推送 + 实时计数
**Owner**：Realtime dev
**描述**：订阅 `inbox.{employeeId}` channel + Sidebar 计数

acceptance_criteria:
- 新消息进来 list 顶 "+ N new" 按钮（不打断 drawer）
- Sidebar Pending count 实时更新（pulse-orange 动画）
- 离线 / 重连后 list 自动补齐
- 测试：模拟 SSE 推 → UI 反应
status: pending

#### Task M3-5：task review 端点 + 集成 inbox tab=action
**Owner**：Backend dev
**描述**：实现 api `POST /api/task/{id}/submit` + `/review`

acceptance_criteria:
- submit 后 task='pending_review'，PendingApproval 创建（reviewer = task.reviewerEmployeeId）
- review approved → status='approved'，inform creator
- review rejected → reviewRound++，task 退回 assignee
- inbox tab=action 同时显示 a2a pending + task pending review
status: pending

#### M3 验收（关联 P8 / P9）
- [ ] HITL 状态机 unit test 100% 通过（含 14 边界用例）
- [ ] /inbox UI 端到端：3 个 pending → approve 后从 list 消失
- [ ] SSE 实时性 < 2s 延迟
- [ ] HITL 不可绕过：客户端尝试 PUT a2a_messages.senderApprovalStatus 直连 → 403

---

### M4：A2A 协议层（1.5 周，3 人）

#### Task M4-1：A2A wire schema + 签名 verify
**Owner**：Protocol dev
**描述**：`packages/core/a2a/{protocol,signing}.ts`

acceptance_criteria:
- A2AMessageWire zod schema（按 api §5.1）
- canonical JSON 序列化函数（key 字典序、no whitespace）
- ed25519 sign + verify 函数
- 单元测试：合法签名 verify 通过；篡改任一字段 verify 失败
status: pending

#### Task M4-2：A2A broker（消息路由 + thread）
**Owner**：Protocol dev
**描述**：`packages/core/a2a/broker.ts` + `POST /api/a2a/send` 端点

acceptance_criteria:
- 7 type × HITL 矩阵正确（api §4.3 表）
- 跨 org 拒绝（403）
- thread 自动创建 / 复用（按 threadId）
- replyToMessageId 正确引用
- 集成测试：发 commit → 等 sender 批准 → receiver 收到
status: pending

#### Task M4-3：a2a/inbox + a2a/{id} 端点
**Owner**：Backend dev
**描述**：实现 api §4.5 的 GET 端点（inbox + 单条详情）

acceptance_criteria:
- inbox cursor 分页 + filter（type / agent / 时间）
- 详情返回完整 message + 关联 task / thread
- RBAC：employee 限自己；manager 限部门
- audit_log `a2a.viewed` 写入（敏感数据访问追溯）
status: pending

#### Task M4-4：A2A skill tool 实现
**Owner**：Skill dev
**描述**：`packages/skill/tools/a2a.ts` 实现 firefly.a2a.send / inbox / respond

acceptance_criteria:
- 3 个 tool 通过 agentskills.io 标准定义
- send 工具自动用 client 私钥签名 message
- 错误处理（401 / 403 / 422）正确返回给 agent
- 与 OpenClaw / Hermes 实测兼容（smoke test，可推迟到 M9）
status: pending

#### Task M4-5：well-known agent-card.json
**Owner**：Protocol dev
**描述**：`packages/web/app/api/well-known/agent-card.json/route.ts`

acceptance_criteria:
- 返回 api §4.10 完整 JSON
- signaturePublicKey 是 server 启动时生成 + 持久化的 ed25519 public key
- 公开访问，无 auth
- 通过 Google A2A v1.2 spec validator
status: pending

#### M4 验收（关联 P7）
- [ ] 7 type A2A 全部跑通
- [ ] sender 签名 verify 100% 准确
- [ ] 跨 org / 越权 全部 401/403
- [ ] /.well-known 通过 A2A v1.2 spec 验证

---

### M5：Task lifecycle + W1 demo（1 周，5 人）

#### Task M5-1：task dispatch + LLM 拆解
**Owner**：AI / Backend
**描述**：实现 api §4.2 `POST /api/task/dispatch`（LLM generateObject 拆解）

acceptance_criteria:
- 调 Vercel AI SDK generateObject + zod SubTask schema
- 3 次 retry 后失败 → 422 LLM_DECOMPOSITION_FAILED（不 silent fallback）
- 输出 SubTask[] 含 target_dept_or_role / summary / deadline
- audit_log + 创建 PendingApproval（pending_dispatch_approval）
- 集成测试：CEO 一句话 → 至少 3 个 sub-task 路由到不同部门
status: pending

#### Task M5-2：approve-dispatch + 路由
**Owner**：Backend dev
**描述**：sender 批准后路由 sub-tasks 到员工

acceptance_criteria:
- sub-task 创建 task row（parent_id 关联）
- 创建 a2a_message type=handoff sender=CEO agent / receiver=各员工 agent
- SSE 推 receiver inbox event `task.assigned`
- audit_log `task.dispatched`
status: pending

#### Task M5-3：task list / get / submit / review 端点
**Owner**：Backend dev
**描述**：实现 api §4.4 剩余端点

acceptance_criteria:
- 5 个端点 zod 完整
- review approved 向上汇总（递归到 root，全部 approved 才标 root 完成）
- review rejected → reviewRound++ + 退回 + audit
- agent 通过 firefly.task.list / submit 调用成功
status: pending

#### Task M5-4：task skill tool
**Owner**：Skill dev
**描述**：`packages/skill/tools/task.ts` 实现 firefly.task.* 4 个 tool

acceptance_criteria:
- list / get / create_and_dispatch / submit 4 个 tool
- 每个 tool input/output zod schema 与 api 对齐
- 错误向 agent 友好返回
status: pending

#### Task M5-5：W1 demo 端到端测试
**Owner**：QA + 全员
**描述**：模拟 CEO Alice 在 OpenClaw 调 firefly.task.create_and_dispatch → CEO web UI 批准 → 销售 manager 收到 → 提交 → 审核

acceptance_criteria:
- E2E playwright 测试覆盖完整 13 步链路（按 ui §F-W1）
- 单次跑全程 < 5 分钟（不含人手等待）
- audit_log 跨 9 步全完整
- /audit 页面显示完整 thread
status: pending

#### M5 验收（关联 W1）
- [ ] CEO 任务扩散 demo video 60 秒可录
- [ ] 全链路 audit_log < 100 entries
- [ ] LLM 拆解准确率 ≥ 80%（人工评估 10 个 sample）

---

### M6：Audit 追溯（0.5 周，2 人）

#### Task M6-1：audit/threads 端点 + cursor 分页
**Owner**：Backend dev

acceptance_criteria:
- api §4.6 端点全实现
- 复杂 filter（actor / type / 时间 / taskId）SQL 模板优化
- cursor 分页 stable（同条件多次拉相同顺序）
- 大数据量（10 万 message）响应 < 1 秒
status: pending

#### Task M6-2：audit UI + drawer
**Owner**：Frontend dev

acceptance_criteria:
- ui §4.3 /audit 页面渲染时间线
- filter 栏 4 项 dropdown
- drawer 3 tab（Messages / Linked Task / Audit Log）
- export.csv 工作
- SSE `audit.org.{orgId}` 推送实时新行（animate-message-flash）
status: pending

#### M6 验收（关联 P11）
- [ ] /audit 跨部门权限正确（auditor 全部 / employee 限自己）
- [ ] export CSV 含完整 thread + 签名 verify 状态

---

### M7：KB pipeline（1.5 周，4 人）

#### Task M7-1：KB schema + migration
**Owner**：DBA
**描述**：实现 design §6.7b（已 done in M1-1，此处补 pgvector HNSW 索引）

acceptance_criteria:
- knowledge_chunks 表 vector(2048) 列
- HNSW 索引 `vector_cosine_ops` 建立
- 测试：100 万 chunk 检索 < 100ms
status: pending

#### Task M7-2：Markdown-aware semantic chunking
**Owner**：AI dev
**描述**：`packages/core/knowledge/upload.ts` 实现 chunking pipeline

acceptance_criteria:
- 解析 PDF / DOCX / MD / TXT / HTML
- 按 heading（# / ## / ###）边界保留
- 段落 / 列表完整不切
- chunk 大小默认 512 tokens（max 1024）
- 元数据：startOffset / endOffset / headingPath
status: pending

#### Task M7-3：embed pipeline + AI Gateway 路由
**Owner**：AI dev
**描述**：`packages/core/knowledge/embed.ts` 调 voyage-3-large

acceptance_criteria:
- batch embed（32 chunks/batch）
- AI Gateway failover：voyage 失败 → OpenAI text-embedding-3-large（dim 3072 切到 2048 截断）
- 写入 knowledge_chunks.embedding 列
- audit_log `knowledge.indexed` 写入
status: pending

#### Task M7-4：knowledge upload + reindex 端点
**Owner**：Backend dev
**描述**：实现 api §4.7 `POST /api/knowledge/upload` + `/reindex`

acceptance_criteria:
- multipart 上传 file + 元数据
- 异步触发 chunk + embed pipeline
- SSE `knowledge.indexing.{docId}` 推送进度（chunk N of M ready）
- reindex 时清旧 chunk + 重跑
status: pending

#### Task M7-5：search 端点 + 三层 scope SQL
**Owner**：Backend dev
**描述**：实现 api §4.7 `GET /api/knowledge/search` + api §6.2 SQL 模板

acceptance_criteria:
- SQL 按 personal > department > company 三层 OR filter
- 跨 dept 拒绝（auditor 例外）
- topK 默认 5 max 20
- 集成测试：3 层各上传 1 文档 → search 返回正确 scope
status: pending

#### Task M7-6：knowledge UI + drawer
**Owner**：Frontend dev

acceptance_criteria:
- ui §4.5 /knowledge 完整：3 tab + list + 上传 + drawer
- 上传进度条（订阅 SSE）
- chunks 预览（前 5）
- re-index / delete 工作
status: pending

#### Task M7-7：kb skill tool
**Owner**：Skill dev

acceptance_criteria:
- firefly.kb.search / upload / list 3 个 tool
- agent 调用：openclaw 跑通"搜公司客户档案 ABC" → 返回相关 chunks
status: pending

#### M7 验收（关联 P12）
- [ ] /knowledge 上传 8 页 PDF → 24 chunks 入库 < 30 秒
- [ ] RAG 检索 top5 与人工标注 ≥ 70% match
- [ ] 跨 scope 隔离测试 100% 通过

---

### M8：Skill registry（1 周，3 人）

#### Task M8-1：Skill registry + scope schema 已就位
**Owner**：（已在 M1-1 schema 阶段完成）

#### Task M8-2：Skill CRUD 端点 + dry-run
**Owner**：Backend dev
**描述**：实现 api §4.8 全部 7 个端点

acceptance_criteria:
- 7 端点 zod 完整 + RBAC（按 scope 写权限）
- dry-run 在 sandbox 跑 LLM（仅 generateText，无真任务）
- conflict preview SQL 实现（哪些下层 scope 覆盖）
- audit_log `skill.created/updated/dry_run` 写入
status: pending

#### Task M8-3：Skill loaded 合并 SQL
**Owner**：Backend dev
**描述**：实现 api §6.2 优先级合并 SQL

acceptance_criteria:
- ROW_NUMBER() PARTITION BY manifest_id ORDER BY priority DESC
- 单 query 一次返回员工有效 skill 集
- 集成测试：3 层 skill 同 manifest_id → 返回 personal 版
status: pending

#### Task M8-4：Skill UI + manifest editor
**Owner**：Frontend dev

acceptance_criteria:
- ui §4.6 /skills 完整
- markdown editor（@uiw/react-md-editor）+ shiki preview
- 顶部 3 namespace tab 切换
- conflict preview 在 drawer 实时刷新
status: pending

#### Task M8-5：skill skill tool（meta）
**Owner**：Skill dev

acceptance_criteria:
- firefly.skill.list / create / invoke 3 个 tool
- list 调 /api/skill/loaded（合并版）
- create 调 /api/skill 创建 personal scope
status: pending

#### M8 验收（关联 P13 / P14）
- [ ] 3 层 skill 创建 + 合并查询正确
- [ ] dry-run 不影响真实数据
- [ ] Personal scope 跨设备同步：员工换电脑 reactivate → loaded skill 自动同步（P14）

---

### M9：Skill 包 + MCP server（1 周，3 人）

#### Task M9-1：@firefly-mesh/skill npm 包打包
**Owner**：Skill dev
**描述**：tsup build packages/skill 为 npm 包

acceptance_criteria:
- `pnpm --filter skill build` 产出 dist/
- package.json 含正确 main / types / files
- SKILL.md 100% 符合 agentskills.io spec（@anthropics/skills 官方 lint 通过）
- README 完整 install + init 指南
- 发布到 npm registry（dry-run 用 verdaccio）
status: pending

#### Task M9-2：firefly skill 兼容三 runtime smoke test
**Owner**：QA + Skill dev
**描述**：CI matrix 跑 OpenClaw / Hermes Agent / Claude Code 三个真实 runtime

acceptance_criteria:
- GitHub Actions workflow `skill-compat.yml` matrix
- 每个 runtime 装 firefly skill → 调 firefly.task.list smoke
- 全 3 个 runtime 通过
- failure 详细 log（runtime version / 错误信息）
status: pending

#### Task M9-3：MCP server 实现
**Owner**：MCP dev
**描述**：`packages/mcp/server.ts` 用 @modelcontextprotocol/sdk-typescript

acceptance_criteria:
- 暴露同 13 个 tool（task / a2a / kb / skill）
- stdio + SSE transport 都支持
- token-based auth（Authorization header）
- Dockerfile 产 image firefly-mesh-mcp
- 集成测试：连 firefly-mesh server 跑 tool call
status: pending

#### Task M9-4：MCP 兼容 Cursor + Claude Desktop
**Owner**：QA
**描述**：smoke test in Cursor + Claude Desktop

acceptance_criteria:
- Cursor 配 MCP server URL → 看到 tools
- Claude Desktop 配 → 看到 tools
- 各跑 firefly.task.list / firefly.kb.search smoke
status: pending

#### M9 验收（关联 P2 / P3）
- [ ] @firefly-mesh/skill v0.1.0 发到 npm
- [ ] 三 runtime + 两 MCP client smoke 全绿
- [ ] docker-compose 启动后 MCP :3001 可用

---

### M10：测试 / 文档 / W2 dogfooding / 首发（1 周，全员）

#### Task M10-1：W2 Cyberautonomy seed 配置包
**Owner**：Tech lead + Product
**描述**：`deploy/seed/cyberautonomy/` 完整配置（员工 / 部门 / KB / skills）

acceptance_criteria:
- employees.csv 含 Cyberautonomy 实际员工
- 5 个部门
- KB 上传 ≥ 10 文档（产品文档 / 内部 wiki / 决策案例）
- 注册 ≥ 5 个内置 skill（日报生成 / PR review / 客户邮件起草 等）
- seed.ts 一行跑通（admin 接入即用）
status: pending

#### Task M10-2：E2E 5 demo story Playwright
**Owner**：QA
**描述**：覆盖 ui §3 user flows F1-F5 + W1

acceptance_criteria:
- 6 个 spec 文件全绿
- CI 跑 Playwright matrix（chromium + firefox + webkit）
- 每个 spec < 2 分钟
status: pending

#### Task M10-3：单元 + 集成测试覆盖率
**Owner**：QA + 全员
**描述**：vitest + testcontainers Postgres

acceptance_criteria:
- packages/core/* 单元覆盖 ≥ 90%
- packages/web/api/* 集成测试覆盖 happy path 100% + 5 失败模式
- CI 通过 + 失败模式 100% 报错正确
status: pending

#### Task M10-4：双语 i18n + 全文档
**Owner**：Product + Frontend
**描述**：zh.json + en.json 完整 + README + 60s demo video

acceptance_criteria:
- 所有 UI 文案在 i18n JSON
- README 双语 + 5 分钟 quickstart
- API reference doc（Mintlify / Fumadocs）站点
- 60 秒 demo video（W1 + W2）
status: pending

#### Task M10-5：Cyberautonomy 内部上线 dogfooding
**Owner**：全员
**描述**：实际部署到 Cyberautonomy 内网，全员接入

acceptance_criteria:
- 50 员工接入 ≥ 80%（40+ 人）
- 连续 7 天活跃 ≥ 50% 员工
- 收集 ≥ 20 条 bug / 改进反馈
- 至少完成 W1 demo 1 次（CEO 真实下任务）
status: pending

#### Task M10-6：GitHub 首发 + ProductHunt + HN
**Owner**：Marketing + Tech lead
**描述**：`github.com/<org>/firefly-mesh` 公开 + 营销

acceptance_criteria:
- public repo 创建（Apache 2.0 license）
- README / CONTRIBUTING / LICENSE / CODE_OF_CONDUCT 齐
- v0.1.0 release tag + Docker image push（multi-arch amd64/arm64）
- ProductHunt 上架
- HN 发帖
- 首日 ≥ 50 stars
status: pending

#### M10 验收（关联 W2 + 全 16 项 MVP）
- [ ] firefly-mesh GitHub 公开 1k+ stars
- [ ] Cyberautonomy 内部 7 天 dogfooding 健康度 ≥ 80%
- [ ] 50 员工反馈优于"hack via Slack"
- [ ] 1+ paying team 表达兴趣（B 路径前导）

---

## 5. Task 依赖图（关键路径）

```
M0 ─▶ M1 ─▶ M2 ─▶ M3 ─▶ M4 ─▶ M5 ─▶ M6 ─┐
                                          ├─▶ M9 ─▶ M10
M7 ─────────────────────────┐             │
                             ├─────────▶ ─┘
M8 ─────────────────────────┘

并行机会：
- M2 与 M7 可并行（M7 不依赖 M3-M5）
- M7 与 M8 可并行
- M9 (skill 包) 待 M4 (A2A skill tool) 完成后开始
```

人力分配（10 人 core）：
- 1 Tech lead（Leo）+ 1 Backend lead + 1 Frontend lead + 1 Auth dev + 2 Backend dev + 2 Frontend dev + 1 AI/Protocol dev + 1 QA/DevOps

---

## 6. 测试策略

| 层 | 工具 | 范围 | M-阶段 |
|---|---|---|---|
| Unit | vitest | core/* HITL / A2A / signature / boundary / RAG SQL / skill loader | M1-M8 |
| Integration | vitest + testcontainers | API routes happy path + 5 失败模式 | M1-M8 |
| E2E | Playwright matrix | 5 demo story + W1 端到端 | M5 / M10 |
| Skill compat | GitHub Actions matrix | OpenClaw / Hermes Agent / Claude Code | M9 |
| MCP compat | smoke | Cursor / Claude Desktop | M9 |
| Load | k6 / autocannon | 100 并发 inbox + 100 并发 a2a/send | M10 |

---

## 7. 红线扫描自动化

`.github/workflows/red-line.yml`:

```yaml
- name: Forbidden tokens
  run: |
    ! grep -rn -E '(TODO|FIXME|HACK|XXX|\bmock\b|\bdummy\b|placeholder|stub)' packages/ --include='*.ts' --include='*.tsx'
- name: Downgrade signals
  run: |
    ! grep -rn -E '(for now|later|暂时|先用|简单起见|先...后面再|to be replaced|will integrate later|简化版|简易版)' packages/
- name: Ban ToolLoopAgent
  run: |
    ! grep -rn 'ToolLoopAgent' packages/core/
- name: Ban hardcoded hex colors
  run: |
    ! grep -rn -E '#[0-9a-fA-F]{6}' packages/web/components/ --include='*.tsx'
```

---

## 8. 阶段交接

下一步：**Step 7（autodev pipeline 末端）**——产出 `2026-04-28-firefly-mesh-rules.md`（编码规则）+ `2026-04-28-firefly-mesh-index.md`（文档索引）。完成后开始 M0 实施。

---

**Plan 完成。**
