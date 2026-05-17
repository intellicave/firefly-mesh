# product-layer M5-M7 — API

> 沿用上 sprint 约定（`{ data | error: { code, message } }` 信封 / Hono / Drizzle / zod / nanoid PK / ISO8601 / orgGuard + requireRole）。

---

## 1. M5 — agents.ts 内部扩展（**对外契约不变**）

### 1.1 修改

**POST /api/agents/register**：
- 已有字段全部保留
- **新增可选 request 字段**：
  - `runtimeKind?: 'openclaw'|'hermes'|'claude-code'|'cursor'|'claude-desktop'|'other-mcp'|'unknown'`
  - `runtimeMeta?: object`（任意 JSON）
- **response 字段不变**：仍 `{ data: { agentId, token, tenantId } }` HTTP 201

**所有现有 endpoint 路径 + 路径参数 + response shape 完全不变。**

### 1.2 内部新行为

- agent 行写入额外列：owner_employee_id（查 employees 反查得），runtime_kind, runtime_meta, activated_at
- 创建 representation_boundaries 行（默认 scope）
- JWT 加 scope claim

### 1.3 GET /api/agents/me/list 新增（可选 phase 2，本 sprint 不实现）

为 dashboard "My devices" 页面服务。**推迟到 web 搬迁 sprint**。

---

## 2. M6 — boundaries.ts（新，2 端点）

### 2.1 GET /api/boundaries/:agentId

- **Auth**: session + orgGuard
- **Role**: any（含 employee, auditor）
- **Cross-tenant**: agents WHERE id=:agentId AND tenant_id=:tenantId
- **Response 200**:
  ```json
  {
    "data": {
      "agentId": "...",
      "scopes": ["read_kb", "submit_task", ...],
      "catalog": [
        { "id": "read_kb", "description": "...", "category": "read", "defaultEnabled": true },
        ...
      ],
      "updatedAt": "2026-05-17T..."
    }
  }
  ```
- **Errors**: 401 / 400 TENANT_REQUIRED / 404 AGENT_NOT_FOUND
- **Behavior**: 若 representation_boundaries 行不存在（旧 agent）→ scopes = defaultScopes()，updatedAt = null

### 2.2 PUT /api/boundaries/:agentId

- **Auth**: session + orgGuard + requireRole(['owner','admin'])
- **Request**:
  ```typescript
  zValidator("json", z.object({
    scopes: z.array(z.string()).max(50),
  }))
  ```
- **Validation**: 每个 scope ID 必须在 SCOPE_IDS 里
- **Cross-tenant**: agents check 同上
- **Behavior**: upsert representation_boundaries（不存在则插入）
- **Audit**: action='boundary.updated' + payload `{ before: [...], after: [...] }`
- **Response 200**: 同 GET shape

---

## 3. M7 — agent-tokens.ts（新，4 端点）

### 3.1 POST /api/agent-tokens

- **Auth**: session + orgGuard + requireRole(['owner','admin'])
- **Request**:
  ```typescript
  zValidator("json", z.object({
    employeeId: z.string(),
    expiresIn: z.enum(['7d', '30d', '90d']).default('7d'),
  }))
  ```
- **Cross-tenant**: employees WHERE id=:employeeId AND org_id=:tenantId
- **Logic**: 
  1. 生成 32-byte random → base64url → plain
  2. hash = SHA-256(plain) hex
  3. expiresAt = now + expiresIn
  4. INSERT agent_tokens(id, org_id, employee_id, token_hash, status='pending', expires_at, created_at, created_by)
  5. audit_log: action='agent_token.issued', payload `{ employeeId }`
- **Response 201**:
  ```json
  { "data": {
    "id": "tok_xxx",
    "plainToken": "ftk_xxxxxxxxxxxxx",
    "employeeId": "emp_xxx",
    "expiresAt": "2026-05-24T..."
  }}
  ```
- **Errors**: 401 / 400 / 403 / 404 EMPLOYEE_NOT_FOUND

### 3.2 GET /api/agent-tokens

- **Auth**: session + orgGuard
- **Role**: any（不含 plain token，所以 read OK）
- **Response 200**:
  ```json
  { "data": [
    { "id", "employeeId", "agentId": null, "status", "expiresAt", "consumedAt": null, "revokedAt": null, "createdAt", "createdBy" },
    ...
  ]}
  ```
  - 状态自动 derive：如果 status='pending' AND expiresAt < now → 响应中显示 'expired'（DB 字段不动）

### 3.3 POST /api/agent-tokens/:id/regenerate

- **Auth**: session + orgGuard + requireRole(['owner','admin'])
- **Logic**:
  1. SELECT agent_tokens WHERE id=:id AND org_id=:tenantId
  2. 若不存在 → 404
  3. 若 status != 'pending' → 409 INVALID_STATUS
  4. UPDATE status='revoked', revoked_at=now
  5. 生成新 token (plain + hash)
  6. INSERT 新行（同 employee_id, expires_at 重新算）
  7. audit_log: action='agent_token.regenerated', payload `{ oldId, newId }`
- **Response 200**: 同 POST shape（含新 plain token）

### 3.4 DELETE /api/agent-tokens/:id

- **Auth**: session + orgGuard + requireRole(['owner','admin'])
- **Logic**: UPDATE status='revoked', revoked_at=now WHERE id=:id AND org_id=:tenantId
- **Response 200**: `{ data: { id, revoked: true } }`
- **Errors**: 404

---

## 4. 影响清单（上 sprint API）

| 上 sprint endpoint | 影响 | 处理 |
|---|---|---|
| GET/PATCH /api/organizations/* | 0 | 不动 |
| /api/employees/* | 0 | 不动 |
| /api/departments/* | 0 | 不动 |
| /api/projects/* | 0 | 不动 |

| hub 原 endpoint | 影响 | 处理 |
|---|---|---|
| POST /api/auth/* | 0 | 不动 |
| POST /api/tenants | 0（上 sprint 已加 bootstrap） | 不动 |
| /api/invite/* | 0 | 不动 |
| /api/messages/* | 0 | 不动 |
| /api/a2a/* | 0 | 不动 |
| /api/me/* | 0 | 不动 |
| **POST /api/agents/register** | request 可选字段 + 内部行为变 | 见 §1 |
| 其他 /api/agents/* | 0 | 不动 |

---

## 5. 测试契约（自检列表）

每个新端点至少覆盖：
- ✓ 正常路径 (200/201)
- ✓ 401 无 session
- ✓ 403 role 不够 / no employee profile
- ✓ 400 zod 校验失败
- ✓ 404 资源不存在 / 跨租户引用
- ✓ 409 状态不对（仅 agent_tokens regenerate）

---
