# firefly-mesh — 编码规则（autodev pipeline 末端）

> 开发阶段必须遵守的所有规则。任何违反都是 PR 级别的 blocker。
> 继承 firefly [rules.md](../../../MultiAgent/docs/plans/2026-04-24-org-neural-mesh-rules.md) + 适配 firefly-mesh 特有约束。

---

## 1. 质量红线（不可违反）

### 1.1 禁占位
- 禁 `TODO` / `FIXME` / `HACK` / `XXX` 注释
- 禁空函数体 / `pass` / `return undefined`（除非 void）
- 禁 `throw new Error('not implemented')`
- 禁注释掉的代码留在提交里

### 1.2 禁 Mock
- 禁 mock / dummy / fake 数据替代真实调用
- 测试 mock 必须放 `__tests__/` 或 `*.test.ts`
- Seed 数据是真实数据（W2 Cyberautonomy 配置包是真实部署）

### 1.3 禁降阶
- 必须按 [`design.md`](2026-04-28-firefly-mesh-design.md) 指定方案实现
- 必须按 [`api.md`](2026-04-28-firefly-mesh-api.md) 指定端点 + zod schema 实现
- 必须按 [`ui.md`](2026-04-28-firefly-mesh-ui.md) 指定配色 + 布局实现
- 不可行 → 停下 escalate 给 tech lead，**禁止**自己写"先用简单替代"

### 1.4 禁过时版本
- 所有依赖 `pnpm add <pkg>@latest`
- 引用 API 不能用 deprecated 签名
- 不确定 → WebSearch 查最新文档

### 1.5 开源优先
- [`oss-scan.md`](2026-04-28-firefly-mesh-oss-scan.md) 推荐项必须使用
- 自研必须 design.md 有"自研理由"章节

### 1.6 UI 禁 emoji
- 严禁 JSX text 节点 / template string 写 emoji
- 唯一图标库 `lucide-react`，strokeWidth=1.75（空态 1.5）
- 白名单：i18n JSON 值 / 代码注释 / UGC 内容渲染 / Markdown 文档

---

## 2. firefly-mesh 特有红线

### 2.1 R7 BYO-agent 不可破坏
- server 端**永远不**跑 ToolLoopAgent / agent loop
- LLM 调用仅 `generateText` / `generateObject` / `embedMany` / `streamText`（packages/core/llm/helper.ts）
- 试图引入 agent runtime SDK（OpenAI Agents SDK / Mastra / LangGraph）= blocker
- CI 自动 grep `ToolLoopAgent` 命中 = fail

### 2.2 R8 三层 scope 不可绕过
- 所有 KB / Skill 写入必须经 `withScope` 中间件
- 跨 scope 检索（员工查别 dept）= 403
- 即便 admin 也不能跨 org（multi-tenant 硬边界）→ 跨 org 一律 404，不暴露资源存在

### 2.3 R9 HITL 不可在客户端
- HITL 状态机是 server 端真值
- 客户端 agent 不能"自报已完成 HITL"
- 状态切换必须 server 端 transaction + audit_log 写入
- agent skill `firefly.task.submit` 触发 server `pending_review`，不直接 `approved`

### 2.4 R10 sender 签名不可缺失
- A2A endpoints 必须 `withSenderSignature` 中间件
- ed25519 verify 失败 → 401 SIGNATURE_FAILED + audit_log
- agent activate 时必须注册 publicKey
- canonical JSON 序列化（key 字典序、no whitespace）

---

## 3. TypeScript 严格规则

- `"strict": true` 全开
- 禁 `any`（用 `unknown` + 类型守卫）
- 禁 `@ts-ignore`（必须 `@ts-expect-error` + 解释注释）
- 所有 API 端点用 `zod` 校验输入
- export type 与 export interface 选 type（除非需要声明合并）

---

## 4. 文件组织

### 4.1 命名

- React 组件：PascalCase（`InboxRow.tsx`）
- 工具函数：kebab-case（`format-date.ts`）
- API routes：kebab-case URL，文件按 Next.js 规范
- Hook：camelCase 前缀 `use`（`useEventStream.ts`）
- Drizzle schema：每域一文件 kebab-case（`a2a.ts` / `knowledge.ts`）

### 4.2 目录约定（按 design §4 packages 拆分）

```
packages/core/         server-side 业务逻辑 lib（无 HTTP server）
  ├── db/schema/       Drizzle schema 9 文件
  ├── auth/            Better Auth + JWT verify
  ├── a2a/             protocol / broker / signing
  ├── hitl/            状态机
  ├── task/            dispatcher / lifecycle
  ├── skill/           registry / loader / manifest
  ├── knowledge/       upload / embed / search / pipeline
  ├── audit/           append-only log
  ├── boundary/        scope enforce
  ├── llm/             helper（仅 toolless）
  ├── events/          SSE pub/sub
  └── middleware/      withAuth / withOrgGuard / withRBAC / withScope / withSenderSignature

packages/web/          Next.js 16 App Router
packages/skill/        agentskills.io npm 包
packages/mcp/          MCP server (Node)
packages/sdk/          typed HTTP client + zod schema
deploy/                docker-compose / helm / seed
```

- 组件按功能域分组（`components/inbox/`，不按类型 `components/buttons/`）
- 业务逻辑放 `packages/core/`，不放 `packages/web/components/`
- Server-only 代码显式 `import 'server-only'` 防泄漏

### 4.3 Barrel exports
- 不用 `index.ts` barrel（Next.js 16 推荐直接 import）
- 例外：packages/core / packages/sdk 顶层 `index.ts` 提供公开 API

---

## 5. 数据库与 ORM

### 5.1 Drizzle schema
- 每张表独立文件，按 design §6 域分组
- 所有主键 `uuid().defaultRandom()`
- 所有 `created_at` / `updated_at` 用 `timestamp().defaultNow().notNull()`
- 禁 schema 写 `TODO`

### 5.2 查询
- 禁 raw SQL（除非 drizzle 不支持 — pgvector cosine ops / RAG SQL 模板例外，但必须包成函数 + 单元测试）
- **多租户铁律**：所有查询强制 `WHERE org_id = session.orgId`（中间件 `withOrgGuard` 自动注入；DAO 函数签名必含 `orgId` 参数）
- 分页：cursor-based（`id > cursor LIMIT n`），不用 OFFSET
- KB / Skill 查询必须 scope filter（personal / dept / company 三层 OR）

### 5.3 Migration
- 每次 schema 变更：`pnpm drizzle-kit generate`
- Migration 文件纳入版本控制，不改历史 migration
- migration 顺序按 [api.md §6.1](2026-04-28-firefly-mesh-api.md) FK 依赖图
- DB-level RULE / CHECK 在 `19_constraints_and_rules.sql`（audit_log no-update no-delete + scope CHECK）

---

## 6. API 设计

### 6.1 Route Handler 模板（packages/web/app/api/.../route.ts）

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, withOrgGuard, withRBAC, withScope } from '@firefly-mesh/core/middleware';
import { db } from '@firefly-mesh/core/db';
import { logAction } from '@firefly-mesh/core/audit';

const Body = z.object({ /* ... */ });

export const POST = withAuth(withOrgGuard(withRBAC(['admin'])(async (req: NextRequest, ctx) => {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
      { status: 400 }
    );
  }

  const result = await db.transaction(async (tx) => { /* ... */ });

  await logAction({
    actorType: 'human',
    actorId: ctx.session.userId,
    action: 'employee.created',
    resourceType: 'employee',
    resourceId: result.id,
    payload: { /* ... */ },
  });

  return NextResponse.json({ data: result });
})));
```

### 6.2 错误处理
- 永远统一格式 `{ error: { code, message, details? } }`
- code 必须来自 [api.md §1.4](2026-04-28-firefly-mesh-api.md) 错误码目录
- 跨 org 资源 → 404（不暴露存在）

### 6.3 SSE
- Next.js `Response` + ReadableStream
- Keep-alive 每 30s `:keepalive\n\n`
- 客户端断线时 server 自动清理订阅
- 事件命名 `<domain>.<action>`（[api.md §3.4](2026-04-28-firefly-mesh-api.md)）

---

## 7. AI / Agent 代码

### 7.1 LLM 调用
- 仅通过 `packages/core/llm/helper.ts`
- 函数：`generateTextHelper` / `generateObjectHelper` / `embedManyHelper` / `streamTextHelper`
- 模型字符串路由（如 `'anthropic/claude-sonnet-4-6'`）通过 Vercel AI Gateway
- **禁直调 provider SDK**

### 7.2 generateObject 必带 schema
- LLM 结构化输出必须 zod schema 校验
- safeParse 失败 → 422 LLM_OUTPUT_INVALID + audit
- 3 次 retry 失败 → fail（红线 R3 禁 silent fallback）

### 7.3 不写 ToolLoopAgent
- BYO-agent 哲学（红线 R7）
- agent runtime 在客户端（OpenClaw / Hermes / Cursor 等）
- server 端只做 stateless LLM 调用

### 7.4 System Prompt
- 通过 `buildSystemPrompt({ task, employee, scope })` 函数组装
- 禁硬编码员工名（防泄漏）
- 必须含：任务 + scope + 当前 context

---

## 8. UI / React

### 8.1 组件规则
- Server Component by default（Next 16 App Router）
- 需交互显式 `'use client'`
- Props 必须 TypeScript interface

### 8.2 样式
- 只用 Tailwind utilities + shadcn `cn()`
- 禁 inline `style={{}}`（除非动态值如 React Flow 节点位置）
- 用 Claude 配色 token：`text-primary` / `bg-secondary` / `border-border`
- 禁硬编码 hex（CI 自动 grep `#[0-9a-fA-F]{6}` 命中 = fail）

### 8.3 图标
- 全部从 `lucide-react` import
- 大小 Tailwind `size-3.5` / `size-4` / `size-5`
- 描边 `strokeWidth={1.75}` 默认；空态 1.5

### 8.4 表单
- `react-hook-form` + zod resolver
- shadcn Form 组件包装

### 8.5 状态管理
- 服务端状态：`@tanstack/react-query`
- 客户端状态：`zustand`（仅当 React 本地不够）
- URL 状态：Next.js searchParams / nuqs

### 8.6 i18n
- 全部文案在 `i18n/messages/{zh,en}.json`
- 禁 JSX text 硬编码
- 用 `next-intl` 渲染

---

## 9. 实时与事件

### 9.1 SSE 客户端
- 统一 `useEventStream` hook
- 断线自动重连（EventSource 原生）
- 订阅 channels 在 hook 参数声明

### 9.2 事件命名
- 格式 `{domain}.{action}`（如 `task.dispatched`、`a2a.message.received`）
- 新事件必须在 [api.md §3.4](2026-04-28-firefly-mesh-api.md) 目录补充
- emit 时间用 ISO 8601 UTC

---

## 10. 审计与安全

### 10.1 审计日志
- 所有写操作后调 `logAction(...)`
- action 命名 `{domain}.{verb}`（如 `task.submit`、`agent.activated`）
- DB-level RULE 强制 no-update / no-delete

### 10.2 权限
- 每个 API 路由必须中间件链：withAuth → withOrgGuard → withRBAC([roles]) [→ withScope([scopes])]
- agent A2A endpoints 加 `withSenderSignature`
- 资源查询强制带 orgId

### 10.3 敏感信息
- 密钥 / token 只走 env vars
- 禁 log / response 回显 API key
- agent_tokens 表只存 hash（SHA-256），plain token 仅生成时返回一次

### 10.4 ed25519 签名
- agent activate 时注册 publicKey
- A2A message canonical JSON + ed25519 sign
- server verify 失败 → 401 + audit
- 私钥客户端持有，server 不存

---

## 11. 测试

### 11.1 测试策略（按 design §8）
- 单元测试（vitest）：core/* 业务函数（HITL / A2A / signature / boundary / RAG SQL / skill loader）
- 集成测试（vitest + testcontainers Postgres）：API routes happy path + 5 失败模式
- E2E（Playwright）：5 demo story + W1 端到端 + W2 dogfooding
- Skill compat（matrix）：OpenClaw / Hermes Agent / Claude Code 三 runtime smoke
- MCP compat：Cursor / Claude Desktop smoke

### 11.2 命令
```bash
pnpm test           # vitest 全部
pnpm test:e2e       # Playwright E2E
pnpm test:compat    # skill + MCP smoke matrix
```

### 11.3 覆盖率目标
- core/* unit ≥ 90%
- API routes happy path 100%
- E2E 5/5 + W1
- Skill smoke 3/3
- MCP smoke 2/2

---

## 12. Git 与 Commit

### 12.1 Commit message
```
<type>(<scope>): <subject>

<body>

<footer>
```
type: feat / fix / refactor / docs / chore / test / perf / build / ci

### 12.2 Branch
- 主线：`main`（保护分支）
- 功能分支：`feat/{milestone}-{task}` (例：`feat/m3-inbox-drawer`)
- 修复分支：`fix/...`
- 每个 PR 必须 ≥ 1 reviewer approve；UI/API 改动必须 tech lead approve

### 12.3 PR template
按 plan §3.3 模板（What / Acceptance / Red-line / Testing / Reviewer）

---

## 13. CI（GitHub Actions）

### 13.1 必需 jobs
```yaml
jobs:
  lint:        # ESLint flat config
  typecheck:   # tsc --noEmit
  test:        # vitest
  build:       # 全 monorepo
  red-line:    # plan §7 red-line.yml grep
  e2e:         # Playwright（matrix chromium/firefox/webkit）
  skill-compat:  # OpenClaw / Hermes / Claude Code matrix
  mcp-compat:    # Cursor / Claude Desktop smoke
```

### 13.2 Vercel Preview
- 每 PR 自动部署到 preview URL（packages/web）
- 评论 PR 给出 preview link

### 13.3 Release 自动化
- semantic-release（commit message 驱动版本）
- multi-arch Docker build（amd64 + arm64）
- Docker Hub + GitHub Container Registry 双发
- @firefly-mesh/skill / @firefly-mesh/sdk npm publish

---

## 14. 性能

- 避免 N+1：所有 list 端点 eager load 关联数据
- 列表端点必有 cursor-based 分页
- React Flow 节点数 > 200 启用 `onlyRenderVisibleElements`
- pgvector HNSW 索引（chunks 表）
- KB embed pipeline 异步（不阻塞 UI 上传响应）

---

## 15. 国际化

- MVP 中英双语（zh.json + en.json）
- 用 `next-intl`
- 禁 JSX text 硬编码
- 默认中文（dogfooding 用 Cyberautonomy 内部）

---

## 16. 代码审查 GAN 触发条件

开发阶段每 task 完成后自动跑 GAN（按 plan §3）：

- **Code GAN**（每 task）：lint / typecheck / build / test / red-line scan
- **UI GAN**（仅 UI task）：i18n / a11y / 响应式 / 设计真值 / 状态三元组
- **Compat GAN**（仅 skill / MCP task）：三 runtime smoke matrix

GAN 不通过 → 回滚 + 修复 + 重跑。

---

## 17. firefly-mesh 特定约束（来自 8 lock）

| Lock # | 实施层面规则 |
|---|---|
| 1 BYO-agent | 不写 server-side agent runtime（红线 R7） |
| 2 self-hosted | 默认 docker-compose；SaaS 是 V2 opt-in |
| 3 BYO-agent | UI 不出现 "我的 agent 工作台"页（与 firefly 区别） |
| 4 Skill+MCP 双轨 | packages/skill + packages/mcp 必须同 backend |
| 5 monorepo open-core | packages/core/web/skill/mcp/sdk Apache 2.0；packages/enterprise BSL 远期 |
| 6 Postgres + pgvector 单点真值 | 不上 P2P / 多 master / 分片 |
| 7 Day 1 dogfooding | M10 必须 Cyberautonomy 内部上线 |
| 8 v1 standards | PostHog/Cal.com/Plane benchmark；不上微服务 / 不上 hybrid search / 不上 GraphRAG |

---

**Rules 完成。开发阶段以此为准；任何修改必须 tech lead 批准 + meta.md 同步。**
