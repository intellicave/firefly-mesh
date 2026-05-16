# Migration 03 — Hub 补足缺失端点

> Dashboard 需要 hub 提供 37 个 P0 + 23 个 P1 新端点 (详见 [`../reference/api-needed.md`](../reference/api-needed.md))。本文档按"实施顺序"组织,而不是按 feature。

预计耗时:**5-8 工作日** (P0 全部 + P1 部分)。

---

## 1. 前置条件

- [x] migration 01 + 02 完成
- [ ] 熟悉 `services/hub/src/routes/` 现有代码风格
- [ ] 熟悉 `services/hub/src/middleware/auth.ts` 的 `requireSession` / `requireRole` / `requireTenantMembership`

---

## 2. 实施顺序

**先做让 dashboard 不再 404 的**(让 dashboard 在浏览器里能跑出主流程,即使数据空):

| 阶段 | 端点 | 说明 |
|---|---|---|
| **A. dashboard 启动必需** (Day 1) | `GET /api/me` + `GET/POST /api/onboarding/state` + D1 migration 0005 | dashboard 一启动就调这两个,缺它们就 401/404 |
| **B. 组织 CRUD** (Day 2-3) | employees + departments + projects(+ migration 0006) | feature 03 的主体 |
| **C. 知识 CRUD** (Day 4-5) | folders + documents + boundaries(+ migration 0007) | feature 04 |
| **D. 技能 CRUD** (Day 6) | skills + tools + router-rules + tenant_secrets(+ migration 0008) | feature 05 (V1 仅管理面板) |
| **E. 审计 + Messages 补强** (Day 7) | `GET /api/tenants/:id/audit` + direction=sent + `GET /api/messages/:id` | feature 06 + 01 完善 |
| **F. 其余 P1** (Day 8) | tasks / project_members / member role / revoke invitation / tool test / router reorder | 收尾 |

---

## 3. 阶段 A — `/api/me` + `/api/onboarding/state`

### 3.1 Migration 0005

`services/hub/migrations/0005_onboarding_state.sql`:

```sql
CREATE TABLE IF NOT EXISTS onboarding_state (
  user_id           TEXT NOT NULL,
  tenant_id         TEXT NOT NULL,
  created_org       INTEGER NOT NULL DEFAULT 0,
  imported          INTEGER NOT NULL DEFAULT 0,
  skipped_import    INTEGER NOT NULL DEFAULT 0,
  paired_agent      INTEGER NOT NULL DEFAULT 0,
  skipped_pair      INTEGER NOT NULL DEFAULT 0,
  completed         INTEGER NOT NULL DEFAULT 0,
  updated_at        TEXT NOT NULL,
  PRIMARY KEY (user_id, tenant_id)
);
```

应用:
```bash
cd services/hub
pnpm wrangler d1 migrations apply firefly-mesh --remote
```

### 3.2 新增 `services/hub/src/routes/me.ts`

```ts
import { Hono } from 'hono'
import { requireSession } from '../middleware/auth'

export const me = new Hono<Env>()

me.get('/', requireSession, async (c) => {
  const { user } = c.var.session
  const tenants = await c.var.db.query.members.findMany({
    where: eq(members.userId, user.id),
    with: { tenant: true },
  })
  const tenantList = tenants.map(m => ({
    id: m.tenant.id, slug: m.tenant.slug, name: m.tenant.name, role: m.role
  }))
  const defaultTenant = tenantList[0]?.id ?? null

  let onboardingCompleted = true
  if (defaultTenant) {
    const state = await c.var.db.query.onboardingState.findFirst({
      where: and(eq(onboardingState.userId, user.id), eq(onboardingState.tenantId, defaultTenant)),
    })
    onboardingCompleted = !!state?.completed
  } else {
    onboardingCompleted = false  // 没 tenant 就是没完成
  }

  return c.json({
    data: {
      user: { id: user.id, name: user.name, email: user.email, image: user.image },
      tenants: tenantList,
      default_tenant_id: defaultTenant,
      onboarding: { completed: onboardingCompleted },
    },
  })
})

me.patch('/', requireSession, async (c) => {
  const body = await c.req.json<{ name?: string }>()
  if (!body.name || body.name.length > 100) {
    return c.json({ error: { code: 'validation_error', message: 'Invalid name' } }, 422)
  }
  await c.var.db.update(user).set({ name: body.name }).where(eq(user.id, c.var.session.user.id))
  return c.json({ data: { ok: true } })
})
```

挂载到 `services/hub/src/index.ts`:`app.route('/api/me', me)`。

### 3.3 新增 `services/hub/src/routes/onboarding.ts`

GET / POST / (自动派生 completed):

```ts
onboarding.get('/state', requireSession, async (c) => {
  const tenantId = c.req.query('tenantId')
  if (!tenantId) return c.json({ error: { code: 'validation_error', message: 'tenantId required' } }, 422)
  // 校验 user 是 tenant member
  const member = await c.var.db.query.members.findFirst({
    where: and(eq(members.userId, c.var.session.user.id), eq(members.tenantId, tenantId)),
  })
  if (!member) return c.json({ error: { code: 'forbidden' } }, 403)

  const state = await c.var.db.query.onboardingState.findFirst({
    where: and(eq(onboardingState.userId, c.var.session.user.id),
               eq(onboardingState.tenantId, tenantId)),
  })
  return c.json({ data: state ?? defaultEmpty(c.var.session.user.id, tenantId) })
})

onboarding.post('/state', requireSession, async (c) => {
  const body = await c.req.json<{ tenantId: string, step: string, value: boolean }>()
  const ALLOWED_STEPS = ['created_org','imported','skipped_import','paired_agent','skipped_pair']
  if (!ALLOWED_STEPS.includes(body.step)) {
    return c.json({ error: { code: 'validation_error' } }, 422)
  }
  // upsert + 重算 completed
  // ... (using db.batch for atomic)
  return c.json({ data: nextState })
})
```

挂载:`app.route('/api/onboarding', onboarding)`。

### 3.4 在 `POST /api/tenants` 中内联写 onboarding_state

创建 tenant 时一并写 `onboarding_state` 行 `created_org=1`,放在同一个 `db.batch` 里。这样新用户创建 tenant 后,下次调 `/api/onboarding/state` 就能拿到正确状态。

类似地,接受邀请的 endpoint 中,若 user 进入第一个 tenant,直接写 `completed=1`(跳过 4-step)。

### 3.5 Tests

`services/hub/src/routes/me.test.ts` 和 `onboarding.test.ts`,覆盖:
- session 缺失 → 401
- tenantId 非 member → 403
- onboarding completed 自动推导
- 跨 user 攻击(传别人 tenantId)→ 403

部署:`pnpm wrangler deploy`。

---

## 4. 阶段 B — Organization CRUD

### 4.1 Migration 0006

`services/hub/migrations/0006_org_entities.sql`(完整 schema 见 [`../reference/data-models.md`](../reference/data-models.md) §org)。

### 4.2 Routes

新建 4 个 routes 文件:`employees.ts`, `departments.ts`, `projects.ts`, `tasks.ts` (后者 P1)。

模板(以 employees 为例):
```ts
import { Hono } from 'hono'
import { requireSession, requireTenantMembership, requireRole } from '../middleware/auth'
import { z } from 'zod'

export const employees = new Hono<Env>()

const employeeCreate = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().optional(),
  role_in_tenant: z.string().max(50).optional(),
  department_id: z.string().optional(),
})

employees.get('/:tenantId/employees',
  requireSession, requireTenantMembership,
  async (c) => {
    const cursor = c.req.query('cursor')
    const q = c.req.query('q') ?? ''
    const rows = await c.var.db.query.employees.findMany({
      where: and(
        eq(employeeT.tenantId, c.req.param('tenantId')),
        cursor ? lt(employeeT.id, cursor) : undefined,
        q ? or(like(employeeT.name, `%${q}%`), like(employeeT.email, `%${q}%`)) : undefined,
      ),
      orderBy: desc(employeeT.id),
      limit: 50,
    })
    return c.json({ data: rows, next_cursor: rows.length === 50 ? rows[49].id : null })
  })

employees.post('/:tenantId/employees',
  requireSession, requireTenantMembership, requireRole(['owner','admin']),
  async (c) => {
    const body = employeeCreate.parse(await c.req.json())
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    await c.var.db.insert(employeeT).values({
      id, tenantId: c.req.param('tenantId'),
      name: body.name, email: body.email, role_in_tenant: body.role_in_tenant,
      department_id: body.department_id, status: 'active', joined_at: now,
    })
    // 写 audit
    await writeAudit(c, { kind: 'employee.created', subject_kind: 'employee', subject_id: id, details: body })
    return c.json({ data: { id } }, 201)
  })

// PATCH / DELETE 类似...
```

挂载:`app.route('/api/tenants', employees)`(注意 `/:tenantId/employees` 是相对 `/api/tenants`)。

### 4.3 Tests

每个 endpoint 覆盖:200 / 401 / 403 (member 写) / 403 (跨 tenant) / 422 (body 错)。

部署。

---

## 5. 阶段 C — Knowledge CRUD

### 5.1 Migration 0007 (folders + documents + boundaries)

### 5.2 Routes

- `services/hub/src/routes/folders.ts` — folder CRUD
- `services/hub/src/routes/documents.ts` — document CRUD,POST/PATCH 校验 size_bytes ≤ 256 * 1024,超过返回 413
- `services/hub/src/routes/boundaries.ts` — boundary CRUD

**Boundary 裁剪逻辑** — 在 `GET /api/folders/:fid/documents` 中,如果 user 是 member:
```ts
const visibleFolderIds = await computeVisibleFolders(c, user, tenantId)
// = union(boundaries where applied_groups contains user's department).allowed_folders
if (!visibleFolderIds.includes(fid)) {
  return c.json({ error: { code: 'forbidden' } }, 403)
}
```

V1 简化:user 是 owner/admin 时返回所有 folder/document,不裁剪;只对 member 做裁剪。

### 5.3 Tests + 部署

---

## 6. 阶段 D — Skills CRUD

### 6.1 Migration 0008

包含 `skills`, `tools`, `router_rules`, `skill_runs` (V1 空), `tenant_secrets` (加密存储 tool token)。

### 6.2 Tenant secret 加密

`services/hub/src/lib/secrets.ts`:
```ts
import { webcrypto } from 'node:crypto'

const KEY = base64ToBytes(env.SECRETS_KEY)  // 32 bytes base64,从 wrangler secret 注入

export async function encrypt(plain: string) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12))
  const cipher = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await webcrypto.subtle.importKey('raw', KEY, 'AES-GCM', false, ['encrypt']),
    new TextEncoder().encode(plain),
  )
  return { ciphertext: new Uint8Array(cipher), iv }
}
```

`wrangler secret put SECRETS_KEY` 注入 32 字节随机 base64。

### 6.3 Routes

- `skills.ts` / `tools.ts` / `router-rules.ts`
- `tool.test`:`HEAD <endpoint>` 5s 超时,success/error 返回到 dashboard

### 6.4 Tests + 部署

---

## 7. 阶段 E — Audit + Messages 补强

### 7.1 Audit

`services/hub/src/routes/audit.ts`:
```ts
audit.get('/:tenantId/audit',
  requireSession, requireTenantMembership, requireRole(['owner','admin']),
  async (c) => {
    const { kind, actor, from, to, cursor, limit = '50' } = c.req.query()
    const lim = Math.min(parseInt(limit), 500)
    const where = and(
      eq(auditLog.tenantId, c.req.param('tenantId')),
      kind ? eq(auditLog.kind, kind) : undefined,
      actor ? eq(auditLog.actorId, parseActor(actor)) : undefined,
      from ? gte(auditLog.createdAt, from) : undefined,
      to ? lte(auditLog.createdAt, to) : undefined,
      cursor ? lt(auditLog.id, cursor) : undefined,
    )
    const rows = await c.var.db.query.auditLog.findMany({
      where, orderBy: desc(auditLog.createdAt), limit: lim,
    })
    return c.json({ data: rows, next_cursor: rows.length === lim ? rows[lim - 1].id : null })
  })
```

CSV 导出 endpoint 类似,Content-Type `text/csv`,上限 10k。

### 7.2 Messages direction filter

`services/hub/src/routes/messages.ts` 已有 `GET /:tenantId/messages`,加 `direction` query:
```ts
const dir = c.req.query('direction') ?? 'received'
const where = dir === 'sent'
  ? eq(messages.fromAgentTenantId, tenantId)
  : eq(messages.tenantId, tenantId)
```

注意:发件需要新 column `from_agent_tenant_id` 或 join `agents` 表。**最简方案**:加冗余 column `from_agent_tenant_id` 在 messages 表,POST `/api/messages` 时一并写入,加 index。

### 7.3 `GET /api/messages/:id`

返回完整 body + agent_card metadata。

---

## 8. 阶段 F — 其余 P1

- `DELETE /api/invitations/:token` — 撤销邀请
- `PATCH /api/tenants/:id/members/:userId` body `{ role }`
- `DELETE /api/tenants/:id/members/:userId`
- `GET / POST / PATCH / DELETE /api/projects/:id/tasks`
- `GET / POST / DELETE /api/projects/:id/members`
- `POST /api/tools/:id/test`
- `POST /api/tenants/:id/router-rules/reorder`

每个补完 = audit 写一条 + tests + 部署。

---

## 9. 完成标志

- [ ] 所有 P0 端点 (37 个) 已实现 + 部署
- [ ] D1 migration 0005-0008 已 apply
- [ ] Dashboard 在浏览器中能完整走通 8 个 feature(允许个别 P1 数据为空 / 灰态)
- [ ] hub 测试套件全绿 `pnpm test`
- [ ] CORS / cookie 验证通过(在 dashboard console 调 `/api/me` 返回正常)
- [ ] **跨 tenant 攻击**测试:用 user A 的 cookie 调 `/api/tenants/<B 的 tenant id>/employees` → 403
- [ ] 走向下一步:[`04-deploy.md`](04-deploy.md)

---

## 10. 风险与缓解

| 风险 | 缓解 |
|---|---|
| D1 trigger 在 migration 0008 里失败(包含 BEGIN/END) | 参照 `scripts/install-audit-triggers.mjs`,不通过 `wrangler d1 migrations apply` 而通过 `--file` API |
| Drizzle schema 类型生成滞后于 migration | `pnpm drizzle-kit pull` 重新拉,或者手写 schema export |
| audit_log 写入失败影响主操作 | 把 audit 写入放在 `db.batch` 中,失败则主操作回滚 (V1) / 异步写入 (V2) |
| 单 Worker CPU 超时(burst inbox 大查询) | 加 D1 index + 分页 limit 上限 500;考虑升级 Workers Paid plan |
| Skills 阶段的 secret 管理出错(明文上传) | `tenant_secrets` 表 + AES-256-GCM 加密,Wrangler secret 注入 SECRETS_KEY,绝不在 audit details 中记 plaintext |
