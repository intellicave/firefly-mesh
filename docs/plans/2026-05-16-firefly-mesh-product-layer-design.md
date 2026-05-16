# firefly-mesh product-layer — Design

> 本文档定义 v0 产品层在 hub 上的技术实现方案。前置阅读：
> - [ideation.md](2026-05-16-firefly-mesh-product-layer-ideation.md) — 范围 + 用户故事 + MVP 模块清单
> - [meta.md](2026-05-16-firefly-mesh-product-layer-meta.md) — 决策反转 + 保留清单
> - 参考：[edge-design.md](2026-05-08-firefly-mesh-edge-design.md) §2-4 架构、§6 数据模型

---

## 1. 架构影响

### 1.1 不变的

| 层 | 实现 | 备注 |
|---|---|---|
| ① Infra | Cloudflare Workers / DO / D1 / R2 / Pages | 保留 |
| ② Delivery | DO + WebSocket Hibernation + X3DH + AES-GCM | 保留（agent 间消息引擎，不动）|
| ③ Protocol | A2A v1.0 wire + ed25519 sig | 保留 |
| ④ Identity | Better Auth + Device Pairing | 保留 |
| ⑤ Experience | Next.js dashboard（services/web，下个 sprint 搬）+ 营销 Astro（services/pwa 改造）| 不在本 sprint |

### 1.2 新增的

| 层 | 实现 | 备注 |
|---|---|---|
| ⑥ **Product layer**（新） | hub D1 上的 6+ 新表 + Hono 路由 + 2 个新中间件 | **本 sprint 主战场** |

### 1.3 替换的（无）

本 sprint 不替换任何现有组件。完全是**叠加**。

---

## 2. 数据模型

### 2.1 设计原则

1. **D1（SQLite）兼容**：所有 v0 schema 的 pgTable 必须改写为 sqliteTable
   - `uuid()` → `text("id").primaryKey()`，应用层用 `nanoid()` 生成 ID（与 hub 现有 text PK 风格一致）
   - `timestamp()` → 业务表用 `text("created_at")` 存 ISO8601 字符串，与 hub 现有 app 表风格一致；Better Auth 接触的字段用 integer-timestamp（保留 hub 现有约定）
   - `jsonb()` → `text("field")` 存 JSON 字符串，应用层 `JSON.parse` / `JSON.stringify`
   - `vector()` → 推迟到 M8 Knowledge：先用 `text("embedding")` 存序列化数组，V0.2 接入 Vectorize 时迁移到 BLOB
   - `check()` 约束 → SQLite 支持，原样保留语法（`sql\`...\``）
   - `index()` → SQLite 支持基础索引，HNSW 不支持（vector 问题同上）

2. **租户隔离硬边界**：每条业务查询 SQL **必须** include `eq(orgId, c.get("orgId"))` —— 保持 v0 风格（详见 §5.2 RBAC 中间件）

3. **复用 hub 现有 tenants 表**：物理表名保持 `tenants`，但**新增 organizations 路由 + repo 层 alias**，对外 API 暴露 `/api/organizations`。物理重命名留 V1.1

4. **employees 与 memberships 并存**：
   - `memberships` = Better Auth + 邀请系统级关系（owner / admin / member）
   - `employees` = 产品层员工档案（name / title / dept / role: owner/admin/manager/employee/auditor / status）
   - 关系：1 个 user + 1 个 tenant 必然有 1 条 memberships（系统级）+ 可选有 1 条 employees（产品级）
   - 设计意图：未来如果 V1.1 允许"非员工身份"（如审计外部承包商、客户访问），memberships 仍可单独存在，不强制 employees

### 2.2 新增 schema（本 sprint 实现）

**全部 6 张表 + 1 张表扩展，加到 services/hub/src/db/schema.ts 文件尾部。**

```typescript
// ---------------------------------------------------------------------------
// Product layer — sprint 2026-05-16
// Adds the v0 organization-collaboration product layer on top of hub's
// agent-mesh communication substrate. See:
//   docs/plans/2026-05-16-firefly-mesh-product-layer-design.md
// ---------------------------------------------------------------------------

// Organizations API alias for `tenants` — physical table NOT renamed in this sprint.
// API exposes /api/organizations but Drizzle queries hit `tenants`.
// V1.1 decision: rename or keep.

export const employees = sqliteTable(
  "employees",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // Nullable: account_mode='none' supports non-login employees (audit-only).
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    title: text("title"),
    avatarUrl: text("avatar_url"),
    status: text("status", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    role: text("role", {
      enum: ["owner", "admin", "manager", "employee", "auditor"],
    })
      .notNull()
      .default("employee"),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    orgEmailUq: uniqueIndex("employees_org_email_uq").on(t.orgId, t.email),
    orgUserUq: uniqueIndex("employees_org_user_uq")
      .on(t.orgId, t.userId)
      .where(sql`${t.userId} IS NOT NULL`),
  }),
)

export const departments = sqliteTable("departments", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: text("created_at").notNull(),
})

export const departmentMembers = sqliteTable(
  "department_members",
  {
    departmentId: text("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["head", "member"] })
      .notNull()
      .default("member"),
    joinedAt: text("joined_at").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.departmentId, t.employeeId] }),
  }),
)

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status", {
    enum: ["planning", "active", "done", "archived"],
  })
    .notNull()
    .default("planning"),
  startAt: text("start_at"),
  endAt: text("end_at"),
  createdAt: text("created_at").notNull(),
})

export const projectMembers = sqliteTable(
  "project_members",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    role: text("role"),
    joinedAt: text("joined_at").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectId, t.employeeId] }),
  }),
)
```

**需要额外 import**：`uniqueIndex`、`sql`（已用了 primaryKey、text）。schema.ts 顶部 import 行需要扩展。

### 2.3 hub 现有表的兼容性影响

| hub 现表 | 影响 | 处理 |
|---|---|---|
| user / session / account / verification | 0 | 不动 |
| tenants | 别名为 organizations，物理不动 | 不动 |
| memberships | 与 employees 并存，关系层补一个反查 view（SQL） | 不动表，应用层 join |
| invitations | 接受邀请时**同时**创建 employees（同事务） | 改 invitations.ts 路由逻辑（非本 sprint，下个 sprint 做 M2 完整邀请流时改）|
| auditLog | 本 sprint **不动表结构**，M12 再 ALTER | 不动 |
| devicePairingCodes / agents / oneTimePrekeys / threads / messagesMeta / pendingMessages / pushSubscriptions | 0 | 不动 |

### 2.4 后续模块 schema（仅设计，不实现）

完整 schema 设计见 [api.md §5 后续模块](2026-05-16-firefly-mesh-product-layer-api.md#5-后续模块设计预览)。本文档只列每个模块需要的表数：

- M5 agents 重归属：ALTER agents ADD COLUMN（4 列）
- M6 boundary：1 新表 `representation_boundaries`
- M7 agent_tokens：1 新表
- M8 knowledge：2 新表（documents + chunks）
- M9 skills：2 新表（skills + agent_skills）
- M10 tasks：1 新表 + HITL 状态机
- M11 a2a 产品层：2 新表（a2a_threads + a2a_messages）
- M12 audit 扩展：ALTER auditLog ADD COLUMN（6 列）

**最终表数 = hub 15 现表 + 本 sprint 5 新表 + M5-M12 共 11 新表 = 26 表**（v0 是 21 表，多出的 5 表来自 hub 加密通信底座 = oneTimePrekeys + threads + messagesMeta + pendingMessages + pushSubscriptions）。

---

## 3. Migration 策略

### 3.1 本 sprint 的 migration

**新建文件**：`services/hub/migrations/0005_product_layer.sql`

```sql
-- Product layer — sprint 2026-05-16
-- Adds employees / departments / department_members / projects / project_members
-- on top of hub's agent-mesh substrate.
-- Does NOT touch existing 15 tables.
-- See docs/plans/2026-05-16-firefly-mesh-product-layer-design.md

CREATE TABLE IF NOT EXISTS employees (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  title       TEXT,
  avatar_url  TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  role        TEXT NOT NULL DEFAULT 'employee'
              CHECK (role IN ('owner','admin','manager','employee','auditor')),
  created_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS employees_org_email_uq ON employees(org_id, email);
CREATE UNIQUE INDEX IF NOT EXISTS employees_org_user_uq  ON employees(org_id, user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS departments (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_id   TEXT,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS department_members (
  department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  employee_id   TEXT NOT NULL REFERENCES employees(id)   ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('head','member')),
  joined_at     TEXT NOT NULL,
  PRIMARY KEY (department_id, employee_id)
);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'planning'
              CHECK (status IN ('planning','active','done','archived')),
  start_at    TEXT,
  end_at      TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id  TEXT NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  role        TEXT,
  joined_at   TEXT NOT NULL,
  PRIMARY KEY (project_id, employee_id)
);
```

### 3.2 本 sprint 的 migration 应用

**本地**：
```bash
pnpm --filter @firefly-mesh/hub exec wrangler d1 migrations apply firefly-mesh-hub --local
```

**生产（不在本 sleep run 执行）**：
```bash
pnpm --filter @firefly-mesh/hub exec wrangler d1 migrations apply firefly-mesh-hub --remote
```

红线：sleep 模式禁止执行 `--remote`，本地通过 + 测试通过后由用户手动远程应用。

### 3.3 Rollback 策略

5 张新表都是 ADD-only，rollback = DROP TABLE。如发现问题：

```sql
DROP TABLE IF EXISTS project_members;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS department_members;
DROP TABLE IF EXISTS departments;
DROP TABLE IF EXISTS employees;
```

**注意**：DROP 会丢失任何已插入的数据。但本 sprint 不动远程，所以风险隔离在本地。

---

## 4. RBAC 设计

### 4.1 两层角色

**系统级（memberships.role）**：owner / admin / member
- owner：tenant 的拥有者，billing + 删除 tenant + 转让所有权
- admin：tenant 管理（邀请、删除成员、配置）
- member：普通成员（系统层面无限制，业务层面由 employee.role 决定）

**产品级（employees.role）**：owner / admin / manager / employee / auditor
- owner / admin：与系统级同义，hub 写入时同步
- manager：可以创建/编辑部门 + 项目 + 派发任务
- employee：基础操作 + 自己创建的 KB
- auditor：只读全部 + 审计导出

### 4.2 权限矩阵（首 sprint 4 个模块）

| 操作 | owner | admin | manager | employee | auditor |
|---|---|---|---|---|---|
| GET /api/organizations/me | ✅ | ✅ | ✅ | ✅ | ✅ |
| PATCH /api/organizations/me | ✅ | ✅ | ❌ | ❌ | ❌ |
| GET /api/employees | ✅ | ✅ | ✅ | ✅ | ✅ |
| POST /api/employees | ✅ | ✅ | ❌ | ❌ | ❌ |
| PATCH /api/employees/:id | ✅ | ✅ | ❌（除非 self）| ❌（除非 self limited fields）| ❌ |
| DELETE /api/employees/:id | ✅ | ✅ | ❌ | ❌ | ❌ |
| GET /api/departments | ✅ | ✅ | ✅ | ✅ | ✅ |
| POST /api/departments | ✅ | ✅ | ✅ | ❌ | ❌ |
| PATCH /api/departments/:id | ✅ | ✅ | ✅（dept head）| ❌ | ❌ |
| DELETE /api/departments/:id | ✅ | ✅ | ❌ | ❌ | ❌ |
| POST /api/departments/:id/members | ✅ | ✅ | ✅（dept head）| ❌ | ❌ |
| GET /api/projects | ✅ | ✅ | ✅ | ✅（自己加入的）| ✅ |
| POST /api/projects | ✅ | ✅ | ✅ | ❌ | ❌ |
| PATCH /api/projects/:id | ✅ | ✅ | ✅（project lead）| ❌ | ❌ |
| DELETE /api/projects/:id | ✅ | ✅ | ❌ | ❌ | ❌ |

### 4.3 Hono 中间件实现

新增 2 个中间件：`services/hub/src/middleware/orgGuard.ts` 和 `services/hub/src/middleware/rbac.ts`

**withOrgGuard** 接口：
```typescript
// Reads session → looks up employee record in c.get('tenantId') → sets c.set('employee', ...)
// 404 if user has no employee record in current tenant
// 403 if employee.status = 'archived'
export const orgGuard: MiddlewareHandler<{ Bindings, Variables: { employee, tenantId } }>
```

**withRBAC** 接口：
```typescript
// Decorator factory: returns middleware that checks employee.role against allowed list
// 403 if role not in allowed
export const requireRole = (allowed: Role[]) =>
  (c, next) => {
    const employee = c.get('employee')
    if (!allowed.includes(employee.role)) return c.json({ error: { code: 'FORBIDDEN' } }, 403)
    return next()
  }
```

**用法示例**（routes/projects.ts）：
```typescript
projects.post("/", requireRole(["owner", "admin", "manager"]), async (c) => { ... })
projects.delete("/:id", requireRole(["owner", "admin"]), async (c) => { ... })
```

### 4.4 跨租户隔离硬约束

**红线**：任何业务 SQL 查询必须 include `eq(table.orgId, c.get("tenantId"))`。**禁止**仅按 `:id` 查询然后软断言 tenant 匹配（这是 P0-1 / P0-2 等之前修过的同类 bug 的根源）。

CI 检查方案：在 rules.md 加 lint rule，static grep 检查 routes/*.ts 里所有 `db.select().from()` / `db.update()` / `db.delete()` 调用必须有 `eq(*.orgId, ...)` clause。

---

## 5. 中间件 + repo 分层

### 5.1 routes 层（HTTP）

`services/hub/src/routes/`:
```
employees.ts       — CRUD + invite-bind
departments.ts     — CRUD + member management
projects.ts        — CRUD + member management + status state
organizations.ts   — read+update tenant alias (existing tenants.ts kept for backward compat)
```

每个文件结构：
```typescript
import { Hono } from "hono"
import { orgGuard, requireRole } from "../middleware/orgGuard.ts"
import { drizzleD1 } from "../db/connect.ts"  // helper to get db from c.env
import * as schema from "../db/schema.ts"
import { eq, and } from "drizzle-orm"
import { z } from "zod"

export const employeesRouter = new Hono<...>()
  .use("*", sessionMiddleware)  // from existing middleware/auth.ts
  .use("*", orgGuard)            // new

employeesRouter.get("/", async (c) => { ... })
employeesRouter.post("/", requireRole(["owner","admin"]), async (c) => { ... })
// ...
```

### 5.2 db 层

新增 `services/hub/src/db/connect.ts`（helper to centralize db construction）：
```typescript
import { drizzle } from "drizzle-orm/d1"
import * as schema from "./schema.ts"
import type { Bindings } from "../auth.ts"

export const drizzleD1 = (env: Bindings) => drizzle(env.DB, { schema })
```

之前 src/index.ts 里有动态 import 这套，可统一收敛。

### 5.3 lib 层（业务逻辑）

新增 `services/hub/src/lib/`:
```
ids.ts             — nanoid wrapper (re-export from hub existing if any)
employees.ts       — business logic: hireEmployee, archiveEmployee
departments.ts     — assignToDepartment, transferDepartment
projects.ts        — addProjectMember, transitionProjectStatus
```

routes 调用 lib 函数，lib 函数操作 db。routes 不直接写复杂业务逻辑。

### 5.4 test 层

新增 `services/hub/test/product-layer.e2e.ts`（端到端 integration test）：
- 创建 tenant
- 邀请 + 创建 employee
- 创建 department + 加成员
- 创建 project + 加成员 + 状态转移
- RBAC 反测试（auditor 不能 POST）
- 跨租户反测试（在 tenant A 用 tenant B 的 employee_id 操作 → 403）

合入现有 `test/e2e.ts`，或独立文件，由 `pnpm test` 跑全套。

---

## 6. 能力-组件映射（更新）

继承 [edge-design.md §3 能力组件映射](2026-05-08-firefly-mesh-edge-design.md)，在此追加产品层条目：

| 能力 | 主责组件 | 依赖 | 新/续 |
|---|---|---|---|
| 组织管理（CRUD） | routes/organizations.ts + 复用 tenants 表 | tenants / memberships | 新增（API 层）|
| 员工管理（CRUD + 邀请绑定） | routes/employees.ts + lib/employees.ts | user / tenants / employees / invitations | 新增 |
| 部门管理（含层级 parent_id） | routes/departments.ts + lib/departments.ts | departments / department_members | 新增 |
| 项目管理（含状态机） | routes/projects.ts + lib/projects.ts | projects / project_members | 新增 |
| RBAC 系统级 | middleware/orgGuard + memberships | session + memberships | 沿用 + 包装 |
| RBAC 产品级 | middleware/rbac + employees.role | employees | 新增 |
| 跨租户隔离 | middleware/orgGuard (强制 eq orgId) | 全部业务表 | 新增中间件层强约束 |

---

## 7. 与 hub 现有功能的协调

### 7.1 invitations 改造（推迟到 M2 完整流程）

**当前**：`POST /api/invite/:token/accept` 接受邀请后，创建 `memberships` 记录。

**新**：同时创建 `employees` 记录（同事务）+ 用 invitations 的 `email` 字段填 employee.email + 用 token 创建者的 role 反查（通常 admin 邀请普通员工，邀请时可附带 role 字段）。

**本 sprint 不做**：因为完整邀请流改造涉及更多 UI 流（dashboard 还没搬过来），先把基础 CRUD 上线。注释 employees.ts 留 TODO。

### 7.2 tenants 路由共存

**保留** `services/hub/src/routes/tenants.ts`（向后兼容），**新增** `organizations.ts` 实质上是它的语义包装。两者并存到 V1.1 重命名时合并。

### 7.3 agents 关系（推迟到 M5）

**当前**：`agents.owner_user_id` 引用 user。

**M5 改造**：ALTER ADD `owner_employee_id` 引用 employees。

**本 sprint 不做**：写入 design 但不改 schema，避免和 hub 现有 agent 代码冲突。

---

## 8. 技术鲜度验证

### 8.1 D1 + Drizzle SQLite

已通过 hub 现有 15 表 + 4 migrations 验证。无新依赖。

### 8.2 Hono 中间件

已通过 hub 现有 sessionMiddleware + rateLimitByIp 验证。新增 orgGuard / rbac 用相同模式。无新依赖。

### 8.3 nanoid

hub 现有代码用什么生成 text PK？查到再说，如果没用可以引 `nanoid`（已经在 better-auth 依赖里），或者引入 `nanoid` 独立 dep。无版本冲突风险。

### 8.4 zod

已在 hub 用（messages.ts 等路由有 z.parse）。无新依赖。

---

## 9. 决策回顾（本设计中的关键选择）

| 主题 | 选 | 弃 | 原因 |
|---|---|---|---|
| organizations 物理表 | 复用 tenants（API 层 alias）| 立即重命名 | 风险 < 收益；V1.1 再决 |
| employees vs memberships | 并存（系统层 + 产品层）| 合并到 employees 单表 | memberships 是 Better Auth 约定 + 邀请流的契约，删了改 hub 多处 |
| employees.role 数量 | 5（v0 一致） | 简化到 3 | v0 已经验证 5 角色够用，保留以避免 V1 数据迁移 |
| 中间件分层 | orgGuard + rbac 独立 | 合并 | 单一职责 + rbac 可单独装饰 route |
| schema 物理外键 | 全部 REFERENCES + ON DELETE | 软外键（无 FK 约束）| D1 支持，开启更安全 |
| 状态字段 | 用 enum check 约束 | 任意 text | 数据库层防错 |
| created_at 类型 | TEXT (ISO8601) | INTEGER (unix ms) | 与 hub app 表约定一致（Better Auth 表才用 integer） |
| parent_id（部门树） | 软引用（无 FK 约束自引用）| 自引用 FK | SQLite 自引用 FK 复杂，应用层校验环 |

---

## 10. 后续模块（M5-M12）设计预览

完整 schema + API 见 [api.md §5](2026-05-16-firefly-mesh-product-layer-api.md#5-后续模块设计预览)。要点：

- **M5 agents 重归属**：ALTER agents ADD `owner_employee_id`、`runtime_kind`、`runtime_meta`、`activated_at`。owner_user_id 保留作 fallback
- **M6 boundary**：`representation_boundaries(agent_id, scopes[])`，agent JWT 签发时 inject scope claim
- **M7 agent_tokens**：v0 的 admin-issued token 模式 vs hub 现有 device pairing 模式 二选一，建议保留 device pairing 为主，agent_tokens 作为 enterprise-issued 模式 V1.1 再加
- **M8 knowledge**：documents 用 text JSON 存 tags，chunks.embedding 先 BLOB 存 binary float32 数组，V0.2 接 Vectorize 索引
- **M9 skills**：复用 agentskills.io manifest schema（v0 已有 SkillManifest interface），三层 scope（company/dept/personal）
- **M10 tasks**：HITL 状态机 7 态保留，dispatchApprovalId / reviewApprovalId 引用 a2a_messages
- **M11 a2a 产品层**：a2a_threads / a2a_messages 存非加密 metadata + HITL state；a2a_messages.encrypted_message_id 引用 hub messagesMeta.id（双层）
- **M12 audit 扩展**：ALTER auditLog ADD `actor_type`、`resource_type`、`resource_id`、`payload`（JSON）

---

## 11. 开放问题

继承 [ideation.md §10](2026-05-16-firefly-mesh-product-layer-ideation.md#10-开放问题) 6 个开放问题，本 design 已 resolve 其中 3 个：

- ✅ Q2（memberships vs employees 关系）→ §2.1 并存方案
- ✅ Q4（D1 + Vectorize 实现）→ §2.1 vector 字段先 text 存，V0.2 迁 BLOB
- ✅ Q5（HITL 状态机分层）→ §10 M11 双层模型

未 resolve（推迟到对应模块 sprint 解决）：
- ⏳ Q1（organizations 物理重命名）→ V1.1
- ⏳ Q3（agents.owner 改 employee）→ M5
- ⏳ Q6（agent_tokens vs devicePairingCodes）→ M7

---
