# firefly-mesh product-layer — API

> 本 sprint 新增的 hub API 完整契约。技术栈和约定继承 hub 现有：Hono + Drizzle + D1 + zod validator + `{ data: ... } / { error: { code, message } }` 信封 + nanoid PK + ISO8601 时间。

---

## 1. 约定（继承 hub 现有）

| 维度 | 约定 |
|---|---|
| 框架 | Hono on Cloudflare Workers |
| 路径前缀 | `/api/{resource}` |
| 认证 | session cookie（Better Auth）+ `requireSession` 中间件 |
| 新增中间件 | `orgGuard`（注入 employee + tenantId 到 c.var）+ `requireRole`（RBAC 装饰器） |
| 响应成功 | `{ data: <body> }` HTTP 200/201 |
| 响应失败 | `{ error: { code: STRING_ENUM, message: STRING, details?: any } }` HTTP 400-500 |
| 错误码 | UPPER_SNAKE，例：UNAUTHORIZED / FORBIDDEN / NOT_FOUND / VALIDATION_ERROR / CONFLICT / RATE_LIMIT |
| 输入验证 | `zValidator("json", z.object({...}))` |
| ID | text PK, `nanoid(21)` |
| 时间 | `new Date().toISOString()` text，业务表通用 |
| 分页 | cursor-based: `?cursor=<id>&limit=50`（response 含 `nextCursor`） |
| 跨租户保护 | 业务 SQL 必须 `eq(table.orgId, c.get("tenantId"))` —— 由 orgGuard 强制 |

---

## 2. 数据模型 diff（vs hub 当前 schema）

### 2.1 新增表（5）

```
employees (id, org_id→tenants, user_id→user nullable, name, email, title,
           avatar_url, status, role, created_at)
  + unique (org_id, email)
  + unique (org_id, user_id) where user_id IS NOT NULL

departments (id, org_id→tenants, parent_id, name, description, created_at)

department_members (department_id→departments, employee_id→employees, role, joined_at)
  PK (department_id, employee_id)

projects (id, org_id→tenants, name, description, status, start_at, end_at, created_at)

project_members (project_id→projects, employee_id→employees, role, joined_at)
  PK (project_id, employee_id)
```

### 2.2 现有表不动

hub 当前 15 表全部保留原状。本 sprint 不 ALTER 任何现有表（即使 design.md §7.1 提到的 invitations 改造，也推迟）。

### 2.3 对现有端点的影响

| 现有端点 | 影响 | 处理 |
|---|---|---|
| `POST /api/tenants` | 无 | 不动 |
| `GET /api/tenants` | 无 | 不动 |
| `GET /api/tenants/:id` | 无 | 不动 |
| `GET /api/tenants/:id/members` | **语义重叠** with `GET /api/employees` | 两者并存。tenants/members 返回 user-tier 视图（userId/role membership），employees 返回 product-tier 视图（name/title/dept/role employee） |
| `POST /api/invite` | **未来改造**（M2 sprint，非本次）| 不动 |
| `POST /api/invite/:token/accept` | **未来改造**：accept 时同时创建 employee（待 M2 sprint）| 不动 |
| `/api/agents/*` | 无（M5 sprint 才动 owner 关联）| 不动 |
| `/api/messages/*` / `/api/a2a/*` | 无 | 不动 |
| `/api/me/*` | 无 | 不动 |

---

## 3. 新增端点清单（本 sprint 实现）

### 3.1 Organizations（语义包装 tenants，4 端点）

| Method | Path | Auth | Role | 说明 |
|---|---|---|---|---|
| GET | `/api/organizations/me` | session + orgGuard | any | 当前用户当前 tenant 的 organization 信息 |
| PATCH | `/api/organizations/me` | session + orgGuard | owner/admin | 更新 displayName |
| GET | `/api/organizations/me/stats` | session + orgGuard | any | 员工数/部门数/项目数统计 |
| GET | `/api/organizations/by-slug/:slug` | session | any（不需 orgGuard，跨域跳转用）| 查 slug 对应 tenant 基本信息（用于邀请页等不带 cookie 上下文的场景）|

### 3.2 Employees（10 端点）

| Method | Path | Auth | Role | 说明 |
|---|---|---|---|---|
| GET | `/api/employees` | session + orgGuard | any | 列出当前 tenant 全部员工，支持 query：`?role=&status=&dept=&search=&cursor=&limit=` |
| GET | `/api/employees/:id` | session + orgGuard | any | 单个员工详情 |
| GET | `/api/employees/me` | session + orgGuard | any | 当前用户在当前 tenant 的 employee record |
| POST | `/api/employees` | session + orgGuard | owner/admin | 创建员工（无 user_id 的"待绑定"状态，邀请接受时绑定）|
| PATCH | `/api/employees/:id` | session + orgGuard | owner/admin（或 self limited fields）| 更新员工档案（self 只能改 name/title/avatar） |
| PATCH | `/api/employees/:id/role` | session + orgGuard | owner/admin | 改 role，触发 memberships.role 同步 |
| PATCH | `/api/employees/:id/status` | session + orgGuard | owner/admin | active ↔ archived |
| DELETE | `/api/employees/:id` | session + orgGuard | owner/admin | 硬删（含级联 dept_members / project_members）；如果 user_id 存在，**不**删 user 也不删 membership（业务关系断开） |
| GET | `/api/employees/:id/departments` | session + orgGuard | any | 此员工所属部门列表 |
| GET | `/api/employees/:id/projects` | session + orgGuard | any | 此员工参与项目列表 |

### 3.3 Departments（8 端点）

| Method | Path | Auth | Role | 说明 |
|---|---|---|---|---|
| GET | `/api/departments` | session + orgGuard | any | 树形（含 parent_id 嵌套） |
| GET | `/api/departments/:id` | session + orgGuard | any | 单个部门详情 |
| POST | `/api/departments` | session + orgGuard | owner/admin/manager | 创建部门，body 含可选 parent_id |
| PATCH | `/api/departments/:id` | session + orgGuard | owner/admin/manager（或本部门 head）| 改 name/description/parent_id |
| DELETE | `/api/departments/:id` | session + orgGuard | owner/admin | 删部门（含子部门 + members 关联，但 employees 自身保留）|
| GET | `/api/departments/:id/members` | session + orgGuard | any | 部门成员列表 |
| POST | `/api/departments/:id/members` | session + orgGuard | owner/admin/manager（或本部门 head）| 加成员 body `{ employeeId, role? }` |
| DELETE | `/api/departments/:id/members/:employeeId` | session + orgGuard | owner/admin/manager（或本部门 head）| 移成员 |

### 3.4 Projects（10 端点）

| Method | Path | Auth | Role | 说明 |
|---|---|---|---|---|
| GET | `/api/projects` | session + orgGuard | any | 列出，query `?status=&cursor=&limit=`。`auditor` 看全部，`employee` 只看自己加入的 |
| GET | `/api/projects/:id` | session + orgGuard | any | 详情 |
| POST | `/api/projects` | session + orgGuard | owner/admin/manager | 创建（status 默认 planning） |
| PATCH | `/api/projects/:id` | session + orgGuard | owner/admin/manager（或 project lead）| 改 name/description/start_at/end_at |
| PATCH | `/api/projects/:id/status` | session + orgGuard | owner/admin/manager（或 project lead）| 状态转移，按 state machine 校验 |
| DELETE | `/api/projects/:id` | session + orgGuard | owner/admin | 删 |
| GET | `/api/projects/:id/members` | session + orgGuard | any | 成员列表 |
| POST | `/api/projects/:id/members` | session + orgGuard | owner/admin/manager（或 project lead）| 加成员 body `{ employeeId, role? }` |
| PATCH | `/api/projects/:id/members/:employeeId` | session + orgGuard | owner/admin/manager（或 project lead）| 改成员 role |
| DELETE | `/api/projects/:id/members/:employeeId` | session + orgGuard | owner/admin/manager（或 project lead）| 移成员 |

**合计本 sprint 实现 32 个新端点。**

---

## 4. 关键端点详细设计

### 4.1 POST /api/employees

**Request**:
```typescript
zValidator("json", z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  title: z.string().max(100).optional(),
  avatarUrl: z.string().url().optional(),
  role: z.enum(["owner", "admin", "manager", "employee", "auditor"]).default("employee"),
  userId: z.string().optional(), // for backfill of existing user; otherwise null
  departmentIds: z.array(z.string()).optional(),
  projectIds: z.array(z.string()).optional(),
}))
```

**业务规则**:
1. orgGuard 已经注入 tenantId
2. RBAC 检查：requester employee.role ∈ ['owner', 'admin']
3. 创建 owner 角色员工 → 必须 requester 是 owner（不允许 admin 升级他人到 owner）
4. 如果 body 含 userId → 检查该 user 已属当前 tenant（否则 VALIDATION_ERROR）
5. 检查 (orgId, email) 唯一（CONFLICT 如有）
6. 事务：插入 employees + （可选）插入 department_members + project_members
7. 同步 memberships：如果 role ∈ ['owner', 'admin'] → upsert memberships.role 同步；如果 'manager'/'employee'/'auditor' → memberships.role = 'member'
8. 写 audit_log（current schema 兼容）

**Response 201**:
```json
{ "data": {
  "id": "emp_xxx",
  "orgId": "tnt_xxx",
  "email": "...",
  "name": "...",
  "title": null,
  "avatarUrl": null,
  "role": "employee",
  "status": "active",
  "userId": null,
  "createdAt": "2026-05-16T..."
}}
```

**Errors**:
- 400 VALIDATION_ERROR（zod 失败 / userId 不属当前 tenant）
- 403 FORBIDDEN（role 不够 / 试图创建 owner 但 requester 不是 owner）
- 409 CONFLICT（email 重复）

### 4.2 PATCH /api/employees/:id/role

**Request**:
```typescript
zValidator("json", z.object({
  role: z.enum(["owner", "admin", "manager", "employee", "auditor"]),
}))
```

**业务规则**:
1. orgGuard + requester.role ∈ ['owner', 'admin']
2. 不能改自己（self-protect）
3. 改 owner 角色 → requester 必须是 owner
4. **不能把唯一 owner 降级**（先查 tenant 内 owner 数 > 1）
5. 事务：UPDATE employees.role + UPDATE memberships.role（按映射规则）+ audit_log

**Response 200**: 同 GET /api/employees/:id

**Errors**:
- 403 SELF_NOT_ALLOWED / FORBIDDEN
- 409 LAST_OWNER（试图把唯一 owner 降级）

### 4.3 POST /api/departments

**Request**:
```typescript
zValidator("json", z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  parentId: z.string().optional(),
  headEmployeeId: z.string().optional(),
}))
```

**业务规则**:
1. orgGuard + requester.role ∈ ['owner', 'admin', 'manager']
2. 如果 parentId → 检查 parent 属当前 tenant（防跨租户引用）+ 检查环（不能让 X 的 parent 是 X 的后代）
3. 事务：插入 departments + （可选）插入 department_members(role='head')

**Response 201**:
```json
{ "data": {
  "id": "dept_xxx",
  "orgId": "tnt_xxx",
  "parentId": null,
  "name": "Engineering",
  "description": null,
  "createdAt": "2026-05-16T..."
}}
```

### 4.4 PATCH /api/projects/:id/status

**Request**:
```typescript
zValidator("json", z.object({
  status: z.enum(["planning", "active", "done", "archived"]),
}))
```

**状态机**:
```
planning ─→ active ─→ done ─→ archived
                                ↑
       └────────────────────────┘
```

- 任何状态 → archived（管理员可强制归档）
- planning → active：owner/admin/manager/project lead
- active → done：同上
- 不允许：active → planning（一旦激活不可回退；如有特殊情况走删除+重建）
- 不允许：done → active（已结项不可重开；如要重启走新项目）

**业务规则**:
1. orgGuard + RBAC
2. 校验状态转移合法
3. UPDATE projects.status + audit_log

---

## 5. 后续模块设计预览（M5-M12，本 sprint 不实现）

**M5 — Agents 重归属**：
```sql
ALTER TABLE agents ADD COLUMN owner_employee_id TEXT REFERENCES employees(id);
ALTER TABLE agents ADD COLUMN runtime_kind TEXT NOT NULL DEFAULT 'unknown'
  CHECK (runtime_kind IN ('openclaw','hermes','claude-code','cursor','claude-desktop','other-mcp','unknown'));
ALTER TABLE agents ADD COLUMN runtime_meta TEXT;
ALTER TABLE agents ADD COLUMN activated_at TEXT;
```
新端点：`GET /api/employees/:id/agents`、`PATCH /api/agents/:id/reassign-owner`

**M6 — Boundary**：
```sql
CREATE TABLE representation_boundaries (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  scopes TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);
```
影响 agent JWT 签发逻辑（lib/jwt.ts）。

**M7 — Agent Tokens**（V1.1，admin 主动签发）：
```sql
CREATE TABLE agent_tokens (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','consumed','revoked','expired')),
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT REFERENCES employees(id)
);
```

**M8 — Knowledge**（V0.2 接 Vectorize）：
```sql
CREATE TABLE knowledge_documents (...);
CREATE TABLE knowledge_chunks (...);  -- embedding 字段 BLOB 存 float32 二进制
```
三层 scope (company / department / personal) + CHECK 约束。

**M9 — Skills**：
```sql
CREATE TABLE skills (...);  -- manifest TEXT (JSON)
CREATE TABLE agent_skills (agent_id, skill_id, enabled);
```

**M10 — Tasks**：HITL 状态机 7 态，dispatch_approval_id / review_approval_id 引用 a2a_messages。

**M11 — A2A 产品层**：
```sql
CREATE TABLE a2a_threads (...);
CREATE TABLE a2a_messages (
  ...
  encrypted_message_id TEXT REFERENCES messages_meta(id),  -- 链到 hub 加密层
  hitl_sender_status TEXT DEFAULT 'auto',
  hitl_receiver_status TEXT DEFAULT 'auto',
  type TEXT  -- 7 类型
);
```

**M12 — Audit 扩展**：
```sql
ALTER TABLE audit_log ADD COLUMN actor_type TEXT;
ALTER TABLE audit_log ADD COLUMN resource_type TEXT;
ALTER TABLE audit_log ADD COLUMN resource_id TEXT;
ALTER TABLE audit_log ADD COLUMN payload TEXT;
```

合计后续模块新增 ~10 表 + 2 ALTER。完整 sprint 排序见 [plan.md §3](2026-05-16-firefly-mesh-product-layer-plan.md#3-后续-sprint-排期)。

---

## 6. 测试契约

每个新端点至少一组 integration test，覆盖：
- 正常路径（200/201）
- 认证失败（401）
- RBAC 失败（403，含 self-not-allowed / last-owner）
- 参数错误（400）
- 资源不存在（404）
- 跨租户注入（A 用 B 的 id → 必须 403/404）

测试基础设施沿用 hub 现有 `test/e2e.ts` 模式，本 sprint 新增 `test/product-layer.e2e.ts`。

---
