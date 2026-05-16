# firefly-mesh product-layer — Rules (红线 + CI 检查)

> 本 sprint 写代码前必读。继承 [edge rules.md](2026-05-08-firefly-mesh-edge-rules.md) 全部红线，本文档只追加本 sprint 新增红线。

## A. 跨租户隔离（最高优先级）

**A1. 所有业务表查询必须 include `eq(table.orgId, c.get("tenantId"))`。** 由 orgGuard 中间件强制注入 tenantId 到 c.var。

**A2. 禁止仅按 `:id` 查询然后软断言 tenant 匹配。** 这是 P0-1 / P0-2 等历史 bug 的根源。每条 SQL 物理隔离。

**A3. CI grep 检查**：`routes/{employees,departments,projects,organizations}.ts` 文件里任何 `db.select().from(...)`、`db.update(...)`、`db.delete(...)` 调用，AST 中 `.where()` 子句必须出现 `eq(...orgId|tenantId..., ...)` 模式。

## B. RBAC 同步（employees ↔ memberships）

**B1. 改 employees.role 必须同步改 memberships.role。** 映射规则：
- employees.role IN ('owner', 'admin') → memberships.role = same
- employees.role IN ('manager', 'employee', 'auditor') → memberships.role = 'member'

**B2. 通过 `lib/employees.ts` 的 `syncMembershipRole()` 函数封装。** 所有 employees.role 变更都过此函数，禁止直接 UPDATE memberships。

**B3. 删 employee 不删 user 和 memberships。** 业务关系断开，账号系统层不动。除非用户主动注销 account（不在本 sprint 范围）。

## C. 状态机校验

**C1. projects.status 转移必须显式校验**，禁止任意 UPDATE。合法转移：
- planning → active / archived
- active → done / archived
- done → archived
- archived → ❌ 终态（除非 admin/owner 用 DELETE）

**C2. 状态机查表在 `lib/projects.ts` 顶部定义为 const map**，单元测试覆盖所有 4×4 转移组合。

## D. last-owner 保护

**D1. tenant 内 owner 角色 employees 必须 >= 1。** PATCH employees.role 把 owner 降级时，必须先 SELECT COUNT(*) WHERE org_id=? AND role='owner' > 1，否则 409 LAST_OWNER。

**D2. DELETE employee 类似检查。**

## E. self-protection

**E1. 任何 employee 不能改自己的 role**（PATCH /api/employees/:id/role 中 id == current employee.id → 403 SELF_NOT_ALLOWED）。

**E2. 任何 employee 不能 DELETE 自己**（同上）。

**E3. 例外**：PATCH /api/employees/:id 中如果 id == current employee.id，允许改 name / title / avatar_url 但**不能**改 role / status / email。

## F. ID 与时间约定

**F1. 所有新业务表 PK 用 `text("id").primaryKey()` + 应用层 `nanoid(21)`**（与 hub 现有约定一致）。

**F2. 业务表 created_at / updated_at / joined_at 类型 `text` + 应用层 `new Date().toISOString()`**（与 hub 现有约定一致）。Better Auth 表保持 integer-timestamp。

**F3. JSON 字段类型 `text` + `JSON.stringify` / `JSON.parse`**（D1 无 JSONB）。

## G. SQLite 兼容子集

**G1. SQL 中禁止 PostgreSQL 专有语法**：UUID 默认值（用 nanoid）、SERIAL（用 text）、JSONB（用 text）、ARRAY（用 text JSON）、vector（M8 用 BLOB）、RULE（用应用层）。

**G2. 自引用 FK（如 departments.parent_id 引用 departments.id）用软引用**（不写 REFERENCES，由应用层校验环）。SQLite 自引用 FK 容易导致迁移问题。

## H. 中间件层级

**H1. 业务路由必须使用 `requireSession` + `orgGuard` + `requireRole(...)` 组合**，禁止直接读 cookie / 直接查 session。

**H2. orgGuard 之后所有 c.get("employee") 可能为 null**（user 在 tenant 内但还没建 employee 记录）。Route handler 必须显式处理 null 或用 `requireRole` 强制 employee 存在。

## I. 测试约束

**I1. 每个新路由至少 1 个 integration test**，覆盖正常路径 + 401 + 403 + 跨租户反测试。

**I2. 现有 `test/e2e.ts` 不能回归**，sprint 完成前必须全绿。

## J. 不可破坏（红线）

**J1. 禁止删除 services/hub 现有 8 张基础设施表**（user / session / account / verification / auditLog / devicePairingCodes / oneTimePrekeys / pushSubscriptions）。

**J2. 禁止改动 hub 现有 6 路由的对外契约**（tenants / invitations / agents / messages / a2a / me 的端点路径和响应字段保持不变；内部实现可重构）。

**J3. 禁止删除 legacy/v0/**。它是 v0 产品层的源材料 + 历史归档。

**J4. 禁止 sleep 模式下执行 `wrangler deploy` / `wrangler d1 execute --remote`。** 本地通过 + 测试通过后由用户手动远程应用。

---

**完整红线清单 = 本文 A-J + edge rules.md 全部**。如发现新红线，先开 PR 修本文再提交业务代码。
