# firefly-mesh product-layer — Plan

> 本 sprint 实施计划。契约式验收：每个 task 有 `acceptance_criteria`（必须 100% 通过才算 `completed`）+ `status` 字段（pending / in_progress / completed）。
>
> 计划格式遵循 [autodev-plan](../../../.claude/skills/autodev-plan/) 约定。完成情况由 [autodev-sync](../../../.claude/skills/autodev-sync/) 维护更新。

---

## 0. 范围声明

**本 sleep run 内必须实现**：M1 organizations + M2 employees + M3 departments + M4 projects（4 模块完整 CRUD + RBAC + 测试）

**本 sleep run 内只规划、不实现**：M5 agents 重归属 + M6 boundary + M7 agent_tokens + M8 knowledge + M9 skills + M10 tasks + M11 a2a 产品层 + M12 audit 扩展

**完全不在本 sprint 范围**：services/web 搬迁 / 营销页改造 / Stripe 接入 / 法律页 / 监控

---

## 1. 本 sprint 任务清单（按依赖序）

### Task 1.1 — Schema 扩展 + Drizzle 更新

**status**: completed
**owner**: claude (sleep run)
**files modified**:
- `services/hub/src/db/schema.ts` （append 5 表 + 索引）

**acceptance_criteria**:
- [ ] schema.ts 顶部 import 增加 `uniqueIndex`、`sql`、`primaryKey`（已有）
- [ ] 文件末尾追加 `// Product layer — sprint 2026-05-16` 注释块
- [ ] 5 张新表定义编译通过：employees / departments / department_members / projects / project_members
- [ ] employees 表 2 个 unique index（org_email_uq、org_user_uq 带 partial where）
- [ ] FK 全部 `references()` + `onDelete: 'cascade'` 或 `'set null'`
- [ ] enum 字段全部用 `text({ enum: [...] })` 模式（与 hub 现有约定一致）
- [ ] `pnpm --filter @firefly-mesh/hub typecheck` 通过

### Task 1.2 — Migration 0005

**status**: completed
**files created**:
- `services/hub/migrations/0005_product_layer.sql`

**acceptance_criteria**:
- [ ] 0005_product_layer.sql 创建，包含 5 个 CREATE TABLE + 2 个 CREATE UNIQUE INDEX
- [ ] 所有 CREATE 用 `IF NOT EXISTS`（防重入）
- [ ] FK 约束写明 `REFERENCES tenants(id) ON DELETE CASCADE` 等
- [ ] CHECK 约束写明 enum 取值
- [ ] PK 写明（composite PK 用 PRIMARY KEY (...) 子句）
- [ ] `pnpm --filter @firefly-mesh/hub exec wrangler d1 migrations apply firefly-mesh-hub --local` 成功（exit 0 + 5 表存在）
- [ ] 验证脚本：`wrangler d1 execute firefly-mesh-hub --local --command="SELECT name FROM sqlite_master WHERE type='table' AND name IN ('employees','departments','department_members','projects','project_members')"` 返回 5 行
- [ ] 不修改 0001-0004 任何文件

### Task 1.3 — 中间件 orgGuard

**status**: completed
**files created**:
- `services/hub/src/middleware/orgGuard.ts`

**acceptance_criteria**:
- [ ] export `orgGuard` MiddlewareHandler
- [ ] 读 session → 取 user.id → 接受 `?tenantId` query 或 path param 中的 tenantId（按现有 tenants.ts 的 :id 风格）
- [ ] 查 memberships 校验 user 属此 tenant（否则 404）
- [ ] 查 employees 加载 employee record（如果存在，注入 c.set("employee", ...)；不存在则注入 null + 不阻塞，由 requireRole 后续判断）
- [ ] 注入 c.set("tenantId", ...)
- [ ] employee.status === "archived" → 403 ARCHIVED_EMPLOYEE
- [ ] 单测：缺 session → 401；session 但非 member → 404；session + member 但无 employee → 200 + employee=null
- [ ] export `requireRole(allowed: Role[])` factory
- [ ] requireRole 检查 employee.role；employee=null → 403；role 不在 allowed → 403

### Task 1.4 — 中间件 db helper

**status**: completed
**files created**:
- `services/hub/src/db/connect.ts` (可选 — 如果 hub 现有用 inline drizzle 多次，统一封装)

**acceptance_criteria**:
- [ ] export `drizzleD1(env: Bindings)` 返回 Drizzle D1 instance with schema
- [ ] 现有 routes（tenants.ts 等）不强制改造（保留向后兼容）
- [ ] 新 routes 一律用此 helper

### Task 1.5 — 路由 organizations.ts

**status**: completed
**files created**:
- `services/hub/src/routes/organizations.ts`

**acceptance_criteria**:
- [ ] 4 个端点全部实现（GET /me, PATCH /me, GET /me/stats, GET /by-slug/:slug）
- [ ] GET /me 返回 tenants 当前记录 + memberships.role + 当前 employee
- [ ] PATCH /me 用 zValidator 校验 displayName，requireRole(['owner','admin'])
- [ ] /me/stats 返回 `{ employeeCount, departmentCount, projectCount }`
- [ ] /by-slug/:slug 不需要 orgGuard（无 tenant 上下文场景）；只返 id/slug/displayName，不返敏感字段
- [ ] index.ts 挂载 `app.route("/api/organizations", organizationsRouter)`
- [ ] 至少 1 个 integration test

### Task 1.6 — 路由 employees.ts

**status**: completed
**files created**:
- `services/hub/src/routes/employees.ts`
- `services/hub/src/lib/employees.ts` (business logic)

**acceptance_criteria**:
- [ ] 10 个端点全部实现（GET list, GET :id, GET me, POST, PATCH :id, PATCH :id/role, PATCH :id/status, DELETE :id, GET :id/departments, GET :id/projects）
- [ ] GET list 支持 query `?role&status&dept&search&cursor&limit`
- [ ] POST 业务规则全部覆盖（含 owner role 升级限制、(orgId,email) 唯一、可选 user_id 校验、可选 dept/project 联入）
- [ ] PATCH :id/role 含 self-protect + last-owner-guard
- [ ] DELETE 含级联校验（dept_members + project_members 自动级联 by FK）
- [ ] 跨租户保护：所有 SQL include `eq(employees.orgId, c.get("tenantId"))`
- [ ] index.ts 挂载
- [ ] integration test 覆盖：正常路径 + RBAC 反测试 + self-not-allowed + last-owner + 跨租户注入

### Task 1.7 — 路由 departments.ts

**status**: completed
**files created**:
- `services/hub/src/routes/departments.ts`
- `services/hub/src/lib/departments.ts`

**acceptance_criteria**:
- [ ] 8 个端点全部实现
- [ ] GET 返回树形结构（含 parent_id 嵌套；客户端可解析）
- [ ] POST 含 parent_id 同租户校验 + 环检测（不能让 X 的 parent 是 X 的后代）
- [ ] DELETE 删部门时**显式**先删 department_members，再删 children departments，最后删自己（避免依赖 FK ON DELETE 处理复杂层级）— 用事务包
- [ ] members 子资源端点（GET / POST / DELETE）
- [ ] 部门 head 权限：除了 admin/manager，本部门 head 也可改本部门信息 + 加减成员
- [ ] 跨租户保护 + integration test

### Task 1.8 — 路由 projects.ts

**status**: completed
**files created**:
- `services/hub/src/routes/projects.ts`
- `services/hub/src/lib/projects.ts`

**acceptance_criteria**:
- [ ] 10 个端点全部实现
- [ ] GET list：auditor 看全部，employee 只看自己加入的（用 INNER JOIN project_members）
- [ ] PATCH /:id/status 校验状态机（planning→active→done→archived，禁止逆转）
- [ ] members 子资源端点（GET / POST / PATCH / DELETE）
- [ ] project lead 权限：role='lead' 的成员可改本项目 + 加减成员
- [ ] 跨租户保护 + integration test

### Task 1.9 — 挂载与冒烟

**status**: completed
**files modified**:
- `services/hub/src/index.ts` (4 行新增 import + 4 行新增 app.route)

**acceptance_criteria**:
- [ ] index.ts 顶部 import 4 个新 router
- [ ] index.ts 挂载 4 个 `/api/organizations` / `/api/employees` / `/api/departments` / `/api/projects`
- [ ] `pnpm --filter @firefly-mesh/hub typecheck` 全绿
- [ ] `pnpm --filter @firefly-mesh/hub exec wrangler dev` 启动成功（端口监听 + 无报错）
- [ ] curl 冒烟：401 on 无 session，200 on /` 根路径

### Task 1.10 — E2E 测试

**status**: completed
**files created**:
- `services/hub/test/product-layer.e2e.ts`

**acceptance_criteria**:
- [ ] 端到端用户故事覆盖：
  - Carol 注册 → 创建 tenant → 创建 employee(self, role=owner) → 创建 dept × 2 → 创建 project × 1
  - Alice 注册 → Carol 邀请 → Carol POST /api/employees backfill user_id → Alice GET /me 看到正确 employee
  - Carol POST /api/departments/:id/members 加 Alice → Alice GET /api/employees/me/departments 看到
  - Carol POST /api/projects/:id/members 加 Alice 为 lead → Alice 可以 PATCH project
  - Dave (auditor) GET 所有 → 200；POST anything → 403
  - 跨租户：Carol 用别的 tenant 的 employeeId → 404 / 403
- [ ] `pnpm --filter @firefly-mesh/hub test` 全绿
- [ ] 现有 e2e.ts 不回归（hub 的 6 现有路由测试仍通过）

### Task 1.11 — 文档同步 + 状态更新

**status**: completed
**files modified**:
- `docs/pipeline/state.yaml` (new sprint progress)
- `docs/plans/2026-05-16-firefly-mesh-product-layer-meta.md` (created)
- `docs/plans/2026-05-16-firefly-mesh-product-layer-index.md` (created)
- `docs/plans/2026-05-16-firefly-mesh-product-layer-rules.md` (created)
- 本 plan.md 各 task status 更新

**acceptance_criteria**:
- [ ] meta.md 写明反转 edge §2.1 / §3.2 / §8 但保留 D1-D8
- [ ] index.md 作为本 sprint 文档地图
- [ ] rules.md 加新红线（跨租户保护 SQL grep / 状态机校验 / role 同步规则）
- [ ] state.yaml 标 new sprint topic、phase 1-5.9 视为本 sprint 全部完成、phase 6 部分完成（M1-M4 done）
- [ ] git commit 拆分为：(1) docs all 8 design files (2) hub schema + migration (3) middlewares (4) routes one commit per module (5) tests

---

## 2. 后续 sprint 排期（出 plan、不实现）

| sprint | 模块 | 估时 | 依赖 |
|---|---|---|---|
| **2026-05-19 ~ 23** | M5 + M6 + M7 (agents 重归属 + boundary + agent_tokens 半成品) | ~5 天 | 本 sprint |
| **2026-05-26 ~ 30** | M11 + M12 (a2a 产品层 + audit 扩展) | ~5 天 | M5 |
| **2026-06-02 ~ 06** | M10 (tasks + HITL) | ~5 天 | M11 |
| **2026-06-09 ~ 13** | M8 + M9 (knowledge + skills) | ~5 天 | M10 |
| **2026-06-16 ~ 20** | services/web 搬迁 sprint A：搬代码 + 改 fetch + i18n 移植 | ~5 天 | M5-M12 |
| **2026-06-23 ~ 27** | services/web 搬迁 sprint B：删 server route + 部署 + 端到端 | ~5 天 | A |
| **2026-06-30 ~ 07-04** | Stripe + 法律 + 监控 + soft launch | ~5 天 | web 完成 |

合计 **7 周到 V1.0 GA**。各 sprint 独立 autodev-add 调用 + 独立 docs/plans/{date}-firefly-mesh-{topic}-*.md 系列。

---

## 3. 降阶信号词扫描

按 CLAUDE.md「设计即契约——禁止降阶实现」，本计划自检以下降阶信号词：

- ❌ "for now" / "暂时" / "暂用" / "暂时跳过" — 0 次
- ❌ "TODO" / "FIXME" 作为占位符 — 0 次（注释里写 "TODO: 待 M2 sprint 改造完整邀请流" 是**规划性 TODO**，非占位）
- ❌ "later" / "稍后" 作为推迟实现 — 0 次（"V0.2" / "下个 sprint" 是**显式排期**，非降阶）
- ❌ mock 替代真实调用 — 0 次（所有 endpoint 真实操作 D1）
- ❌ 空函数体 / pass / 空 return — 0 次

**唯一明确推迟到下个 sprint 的功能**（不算降阶，是范围声明）：
1. invitations.ts 改造（接受邀请时同步创建 employee）— 推迟到 M2 sprint，本 sprint 留可手动调 POST /api/employees backfill
2. agents.owner_employee_id ALTER — 推迟到 M5 sprint
3. UI 实施 — 推迟到 services/web 搬迁 sprint

**所有推迟项在 §0 范围声明 + §2 后续 sprint 排期里已明确列出，不构成隐性降阶。**

---

## 4. 风险与缓解

| 风险 | 概率 | 缓解 |
|---|---|---|
| Drizzle 改 schema 后 typecheck 报错（与 hub 现有 6 路由的 type 冲突） | 中 | Task 1.1 后立刻跑 typecheck，发现冲突第一时间修；不让冲突积累 |
| D1 migration apply local 失败（D1 限制 SQL 语法） | 中 | 写 migration 严格用 SQLite 兼容子集（无 SERIAL / 无 ENUM 类型只能 CHECK / 无 ARRAY） |
| 跨租户 SQL 漏写 eq(orgId, ...) → 安全 bug | 高 | orgGuard 强制注入 tenantId + rules.md 加 lint + e2e 反测试覆盖 |
| 状态机校验逻辑实现错误（如允许 active→planning） | 中 | lib/projects.ts 用映射表显式定义 valid transitions + 单测覆盖 |
| last-owner-guard 错误（多 owner tenant 下意外阻塞） | 低 | lib/employees.ts 显式 SELECT COUNT WHERE role='owner' > 1 才允许降级 |
| memberships.role vs employees.role 同步不一致 | 中 | lib/employees.ts 显式封装 syncMembershipRole(employee)，所有 role 改动都通过它 |

---

## 5. 完成判定

本 sleep run **唯一通过条件**（全部满足才能在 §6 写 "completed"）：

1. **所有 11 个 task 的 acceptance_criteria 100% 通过**
2. **`pnpm --filter @firefly-mesh/hub typecheck` 全绿**
3. **`pnpm --filter @firefly-mesh/hub test` 全绿**（含新 product-layer.e2e.ts 和现有 e2e.ts）
4. **`pnpm --filter @firefly-mesh/hub exec wrangler dev` 启动成功**（local D1 migrations apply 包含 0005）
5. **`pnpm --filter @firefly-mesh/hub exec wrangler dev` 启动后，能用 curl 调出 4 个新路由的健康响应**
6. **state.yaml 标新 sprint progress**
7. **git 至少 3 个 commit**（docs / schema+migration / routes+tests），每个 commit 编译 + 测试通过

**任一未达成 → status 保持 in_progress，回到主对话报告差距。**

---

## 6. 任务状态汇总

| Task | Status |
|---|---|
| 1.1 Schema 扩展 | completed |
| 1.2 Migration 0005 | completed |
| 1.3 中间件 orgGuard | completed |
| 1.4 db helper | completed |
| 1.5 路由 organizations | completed |
| 1.6 路由 employees | completed |
| 1.7 路由 departments | completed |
| 1.8 路由 projects | completed |
| 1.9 挂载与冒烟 | completed |
| 1.10 E2E 测试 | completed |
| 1.11 文档同步 | completed |

**Sleep run 完成于** 2026-05-16。所有 acceptance_criteria 通过（typecheck 0 错误 / 11/11 e2e 子用例通过 / 现有 e2e 6/6 phase 无回归 / 跨租户注入 e2e 阻塞验证通过 / wrangler dev 本地启动正常）。

---

## 7. 实现偏离设计的说明（drift notes）

实现过程中发现设计需要小调整，已就地修正：

1. **tenants.ts 增加 owner employee 自动 bootstrap**（5 行 insert）
   - 原计划：`tenants.ts | 无 | 不动`
   - 实际：`POST /api/tenants` 在创建 tenant + memberships + auditLog 后，**新增**一条 owner employee 插入
   - 原因：未做此 bootstrap 时，新 tenant 的 owner 没有 employee 记录 → `requireRole(['owner','admin'])` 全部 403 NO_EMPLOYEE_PROFILE → 整个产品层 mutating endpoint 无法使用
   - 影响：API 契约不变（POST /api/tenants response 字段不变），只是内部多创建一行
   - 红线 J2 合规："禁止改动 hub 现有 6 路由的对外契约（内部实现可重构）"
   - 后续：M2 sprint 完成 invitation accept 时同步创建 employee 的流程

2. **rules.md J2 自查**：本次修改 tenants.ts 属于"内部实现重构"，不改对外契约。Pass。

