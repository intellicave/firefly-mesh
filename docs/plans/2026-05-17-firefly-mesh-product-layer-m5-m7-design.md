# product-layer M5-M7 — Design

> 前置：[ideation.md](2026-05-17-firefly-mesh-product-layer-m5-m7-ideation.md) + [2026-05-16 design.md](2026-05-16-firefly-mesh-product-layer-design.md) §10 schema 草案。

---

## 1. 架构影响

### 1.1 不变的

- D1 / DO / Workers / Hono / Drizzle / Better Auth / E2E 加密 → 全部不动
- hub 现有 15 表 + 上 sprint 加的 5 表 → 不动（agents 表只 ADD COLUMN）
- 上 sprint 的中间件 + lib + 4 个新路由 → 不动

### 1.2 新增的

| 层 | 新增 |
|---|---|
| schema | ALTER agents (+4 列) / +2 新表（representation_boundaries / agent_tokens） |
| migrations | 0006 (ALTER agents) + 0007 (CREATE 2 表) |
| lib | scopes.ts（catalog + helpers）|
| lib | jwt.ts（增 scopes 入参 + claim） |
| routes | boundaries.ts / agent-tokens.ts |
| routes | agents.ts 内部 wiring（不改契约） |

### 1.3 替换的（无）

无破坏性替换。M5 ALTER agents 是 ADD COLUMN（向后兼容）。

---

## 2. 数据模型

### 2.1 agents 表 ALTER

```sql
ALTER TABLE agents ADD COLUMN owner_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE agents ADD COLUMN runtime_kind TEXT NOT NULL DEFAULT 'unknown'
  CHECK (runtime_kind IN ('openclaw','hermes','claude-code','cursor','claude-desktop','other-mcp','unknown'));
ALTER TABLE agents ADD COLUMN runtime_meta TEXT;
ALTER TABLE agents ADD COLUMN activated_at TEXT;
```

- `owner_employee_id` 可空 + ON DELETE SET NULL（员工被删除时 agent 不消失，只是悬空；用户可重新关联）
- `runtime_kind` 默认 'unknown'（向后兼容现有行）
- `runtime_meta` TEXT 存 JSON（与 hub 现有约定一致；JSON.stringify in app）
- `activated_at` 文本 ISO8601，注册时填

### 2.2 representation_boundaries（新表）

```sql
CREATE TABLE representation_boundaries (
  id          TEXT PRIMARY KEY,
  agent_id    TEXT NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
  scopes      TEXT NOT NULL DEFAULT '[]',
  updated_at  TEXT NOT NULL
);
```

- 1:1 关系（agent_id UNIQUE）—— 每个 agent 一条 boundary 行
- scopes 是 JSON string of `string[]`（不是 JSONB，D1 没有）
- ON DELETE CASCADE：agent 被删 → boundary 跟着删

### 2.3 agent_tokens（新表）

```sql
CREATE TABLE agent_tokens (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id  TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  agent_id     TEXT REFERENCES agents(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','consumed','revoked','expired')),
  expires_at   TEXT NOT NULL,
  consumed_at  TEXT,
  revoked_at   TEXT,
  created_at   TEXT NOT NULL,
  created_by   TEXT REFERENCES employees(id)
);
CREATE INDEX idx_agent_tokens_org ON agent_tokens(org_id);
CREATE INDEX idx_agent_tokens_employee ON agent_tokens(employee_id);
CREATE INDEX idx_agent_tokens_token_hash ON agent_tokens(token_hash);
```

- token_hash UNIQUE → 防 hash 冲突（极小概率）
- agent_id nullable（pending 时 agent 还没生成）
- status 状态机（同 lib/projects.ts 模式）
- created_by 引用 employees（追溯 admin）

### 2.4 状态机

**agent_tokens.status**：
```
pending → consumed         (skill 在 V1.1 activate-by-token 时)
pending → revoked          (admin 主动 DELETE)
pending → expired          (cron 定时检查 expires_at < now → status='expired')
consumed/revoked/expired → 终态
```

本 sprint **不实现 cron 自动 expired 转换**（依然返回 expired 在响应层判断，db 状态可能滞后）。如果硬要 cron，到 audit_log cron lease 那批一起加。

---

## 3. lib/scopes.ts（新）

直接迁移 v0 boundary/catalog.ts 的 10 个 scope 定义。Workers / Node 通用 TS 模块，无 dep。

```typescript
export interface ScopeDef {
  id: string
  description: string
  category: "read" | "write" | "a2a" | "action"
  defaultEnabled: boolean
  dangerous?: boolean
}

export const SCOPE_CATALOG: readonly ScopeDef[] = [
  { id: "read_kb", ... },
  ...
] as const

export type ScopeId = (typeof SCOPE_CATALOG)[number]["id"]

export const SCOPE_IDS: readonly string[] = SCOPE_CATALOG.map(s => s.id)

export function isValidScope(id: string): boolean { ... }
export function defaultScopes(): string[] { ... }
export function isDangerousScope(id: string): boolean { ... }
export function getScopeDef(id: string): ScopeDef | undefined { ... }
export function enforceScope(agentScopes: readonly string[], required: ScopeId): void { ... }
```

`enforceScope` throws an error with `code: 'BOUNDARY_VIOLATION'` 同 v0 行为；调用方 catch 后映射为 403。

---

## 4. lib/jwt.ts 扩展

### 4.1 类型变更

```typescript
export type AgentJwtPayload = {
  sub: string
  tenantId: string
  userId: string
  scope: string[]   // ← 新增
}
```

### 4.2 signAgentJwt 签名变更

```typescript
export async function signAgentJwt(
  agentId: string,
  tenantId: string,
  userId: string,
  scopes: string[],    // ← 新增
  secret: string,
): Promise<string> {
  ...
  return new SignJWT({ tenantId, userId, scope: scopes, type: "agent" })
    ...
}
```

### 4.3 verifyAgentJwt 向后兼容

```typescript
export async function verifyAgentJwt(...) {
  ...
  return {
    sub: payload.sub,
    tenantId: ...,
    userId: ...,
    scope: Array.isArray(payload["scope"])
      ? payload["scope"].filter((s): s is string => typeof s === "string")
      : defaultScopes(),   // ← 旧 JWT 没 scope 时降级到默认
  }
}
```

**向后兼容关键**：M6 上线前签发的 JWT 没有 scope claim，verifyAgentJwt 会自动用 defaultScopes() 补足。旧 agent 不会失效。

### 4.4 调用方更新

只有 `routes/agents.ts::register` 调 signAgentJwt 一处。需要：
1. 注册 agent 后插入 representation_boundaries(defaultScopes)
2. 拿这些 scope 传给 signAgentJwt

```typescript
// 在 /register handler 末尾改成：
const scopes = defaultScopes()
await db.insert(schema.representationBoundaries).values({
  id: nanoid(21),
  agentId,
  scopes: JSON.stringify(scopes),
  updatedAt: now.toISOString(),
})
const token = await signAgentJwt(agentId, pairing.tenantId, pairing.userId, scopes, c.env.JWT_SECRET)
```

---

## 5. routes/boundaries.ts（新）

### 5.1 端点

```
GET  /api/boundaries/:agentId     — any tenant member can read
PUT  /api/boundaries/:agentId     — owner/admin only
```

### 5.2 业务规则

**GET**：
- orgGuard 注入 tenantId
- 反查 agents WHERE id=:agentId AND tenant_id=:tenantId（跨租户）
- 反查 representation_boundaries WHERE agent_id=:agentId
- 若不存在 → 返回 `defaultScopes()`（向后兼容旧 agent）
- 响应：`{ data: { agentId, scopes: string[], updatedAt } }` + scope catalog 完整列表（前端渲染需要）

**PUT**：
- orgGuard + requireRole(['owner','admin'])
- 校验：scopes 数组每个值都在 SCOPE_IDS 里
- 危险 scope（dangerous=true）允许传入（admin 显式批准就是它的职责）
- agents cross-tenant guard 同上
- 写 / upsert representation_boundaries（DO NOTHING 模式 + UPDATE）
- 写 audit_log: action='boundary.updated' + payload 含 diff

### 5.3 注意

- 改 boundary **不会主动失效现有 JWT**。新 scope 在下次 JWT 重签时生效。
  - 当前 JWT 有效期 90 天 → 改 boundary 后最坏需 90 天才完全生效
  - 这是已知 tradeoff（v0 也是同样模型）；如果需要立即生效，加 "agent JWT 强制刷新" endpoint（推到 V1.1）
- 改 boundary 不影响 hub 现有业务 endpoint —— 因为 hub 现有 endpoint 还没接入 enforceScope。M6 提供能力，使用是各 endpoint 按需。

---

## 6. routes/agent-tokens.ts（新）

### 6.1 端点

```
POST   /api/agent-tokens                  — admin issues
GET    /api/agent-tokens                  — list current tenant
POST   /api/agent-tokens/:id/regenerate   — invalidates old + new plain
DELETE /api/agent-tokens/:id              — revoke
```

### 6.2 业务规则

**POST**：
- orgGuard + requireRole(['owner','admin'])
- body: `{ employeeId: string, expiresIn?: '7d'|'30d'|'90d' = '7d' }`
- employee cross-tenant guard
- 生成 32-byte 随机 token plaintext（base64url，~43 字符）
- hash = SHA-256(plaintext) hex
- 插入 agent_tokens 行 status='pending'
- 写 audit_log
- 响应：`{ data: { id, plainToken, expiresAt } }` —— **plain token 仅这次返回，DB 不存**

**GET**：
- orgGuard + any member
- 列出当前 tenant 全部 agent_tokens（无 plain token）
- 按 created_at desc

**POST /:id/regenerate**：
- orgGuard + requireRole(['owner','admin'])
- 找 token, 校验 status='pending' (only pending 可 regenerate)
- 旧 token status='revoked' + revoked_at=now
- 插入新行（同 employee_id, expires_at 重新计算）
- 响应：同 POST（含新 plain token）

**DELETE /:id**：
- orgGuard + requireRole(['owner','admin'])
- UPDATE status='revoked' + revoked_at=now（软删，便于审计）

### 6.3 安全

- token plaintext 用 `crypto.getRandomValues(new Uint8Array(32))` 生成（Workers 内置）
- base64url encode
- DB 只存 SHA-256 hex（即使 DB 泄露，token 也无法反推）
- 响应中 plain token **绝不再次返回**（v0 同行为）
- 创建时 audit_log 记录 admin + employee（payload 不含 plain token）

### 6.4 client 侧消费（不在本 sprint）

V1.1 加 `POST /api/agents/activate-by-token`：
- body `{ token: plaintext, displayName, identityKey, identityKeyX, signedPrekey, signedPrekeySig, oneTimePrekeys }`
- hash → 找 agent_tokens WHERE token_hash=hash AND status='pending' AND expires_at > now
- 若找到 → 等同 device pairing 的 register 流程，但 owner_employee_id 来自 agent_tokens.employee_id
- 标记 token status='consumed' + consumed_at + agent_id

本 sprint 不实现此端点，注释里留 TODO。

---

## 7. agents.ts 内部 wiring（不改契约）

唯一改动：`POST /api/agents/register` handler 末尾的 agent insert + JWT sign 段。

### 7.1 改动点

```typescript
// 改前：
await db.insert(schema.agents).values({
  id: agentId,
  tenantId: pairing.tenantId,
  ownerUserId: pairing.userId,
  ...
})
...
const token = await signAgentJwt(agentId, pairing.tenantId, pairing.userId, c.env.JWT_SECRET)
return c.json({ data: { agentId, token, tenantId: pairing.tenantId } }, 201)

// 改后：
// 1. resolve employee
const [emp] = await db
  .select({ id: schema.employees.id })
  .from(schema.employees)
  .where(
    and(
      eq(schema.employees.orgId, pairing.tenantId),
      eq(schema.employees.userId, pairing.userId),
    ),
  )
const ownerEmployeeId = emp?.id ?? null  // 可能为 null（user 没 employee profile）

// 2. agent insert 加上 owner_employee_id + runtime_kind + runtime_meta + activated_at
await db.insert(schema.agents).values({
  id: agentId,
  tenantId: pairing.tenantId,
  ownerUserId: pairing.userId,
  ownerEmployeeId,
  runtimeKind: body.runtimeKind ?? "unknown",
  runtimeMeta: body.runtimeMeta ? JSON.stringify(body.runtimeMeta) : null,
  activatedAt: now.toISOString(),
  ...
})

// 3. create boundary with default scopes
const scopes = defaultScopes()
await db.insert(schema.representationBoundaries).values({
  id: nanoid(21),
  agentId,
  scopes: JSON.stringify(scopes),
  updatedAt: now.toISOString(),
})

// 4. sign JWT with scopes
const token = await signAgentJwt(
  agentId,
  pairing.tenantId,
  pairing.userId,
  scopes,
  c.env.JWT_SECRET,
)
```

### 7.2 zod 输入兼容

`/api/agents/register` 的 zod schema 增加 optional 字段：

```typescript
zValidator("json", z.object({
  code: z.string().length(6),
  displayName: z.string().min(1).max(50),
  type: z.enum(["skill", "bot"]).default("skill"),
  identityKey: z.string(),
  identityKeyX: z.string(),
  signedPrekey: z.string(),
  signedPrekeySignature: z.string(),
  oneTimePrekeys: z.array(...).min(1).max(100),
  runtimeKind: z.enum([...]).optional(),       // 新增可选
  runtimeMeta: z.record(z.string(), z.unknown()).optional(),  // 新增可选
}))
```

**API 契约**：response 字段不变。新增可选 request 字段不算 breaking。

---

## 8. 决策记录

| 主题 | 选 | 弃 | 原因 |
|---|---|---|---|
| owner_employee_id 关系 | ON DELETE SET NULL | CASCADE | 员工被删时 agent 不消失（保护历史消息） |
| owner_user_id | 保留 | DROP | 向后兼容（hub 现有代码不需要立即改） |
| runtime_kind 默认值 | 'unknown' + CHECK enum | NULL | 现有数据有合理默认 |
| representation_boundaries 1:1 | UNIQUE agent_id | 多行 | 一个 agent 一组 scope |
| JWT scope claim | 新增 + 旧 JWT 降级 default | 强制升级 | 旧 agent 不失效 |
| agent_tokens 状态机 | enum CHECK | 任意 text | DB 层防错 |
| token plain 存储 | 不存（只存 SHA-256）| 加密存 | v0 一致 + 最小信任 |
| audit_log 在 boundary 改动时 | 记录 + payload 含 diff | 不记 | 合规要求 |
| cron 自动 expired 转换 | 不做（按响应层判断）| 加 cron | 范围控制 |

---

## 9. 跨租户 / RBAC 风险点

继承上 sprint 红线。本 sprint 新增需特别注意：

- **boundaries 的 cross-tenant guard**：必须先 agents WHERE id=:agentId AND tenant_id=:tenantId 验证，再操作 representation_boundaries（agent_id 是隐式 tenant scope）
- **agent_tokens 的 employee_id 检查**：POST 时必须 employees WHERE id=:employeeId AND org_id=:tenantId
- **危险 scope 写入**：当前 design 让 admin 自己负责，未来如要二次确认（如 email confirm），加 design.md §10

---

## 10. 测试策略

`test/m5-m7.e2e.ts`，端到端覆盖：

1. **基础流**：Carol 创 tenant（auto-bootstrap owner employee）→ Carol 跑 pair-init → pair-confirm → 模拟 skill register → 校验 agents.owner_employee_id 是 Carol.employee.id，agents.runtime_kind 默认 'unknown'，agents.activated_at 设置，representation_boundaries 行存在 + 含 defaultScopes
2. **JWT scope claim**：register 返回的 JWT 解码后含 scope 数组
3. **boundary CRUD**：GET 默认 + PUT 加 dangerous scope + GET 验证 + audit_log 写入
4. **agent_token CRUD**：POST 返回 plain + DB 只存 hash + GET list 不含 plain + regenerate 失效旧 + DELETE soft revoke
5. **RBAC**：employee 角色不能 PUT boundary / POST agent-token
6. **cross-tenant**：A 用 B 的 agentId GET boundary → 404
7. **向后兼容**：模拟旧 JWT（不带 scope）verify → scope 降级到 defaults

---
