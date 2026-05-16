# 05 — Organization (员工 / 部门 / 项目)

## 1. Purpose

把 tenant 内部的组织结构暴露给 admin。**这是 v1 dashboard 中数据最丰富的页**:展示员工、部门、项目三类资源,允许新增 / 改 / 删。

## 2. Entry / Exit

| 入口 | 来源 |
|---|---|
| Sidebar 「Organization」 | 主路径 |
| Audit log 链接 | 跨页跳转 |

| 出口 | 目标 |
|---|---|
| 员工详情 | 同页 Sheet 展开 |
| 部门详情 | 同页 Sheet 展开 |
| 项目详情 | `/organization/projects/:id` (有独立子页因为含子任务) |

## 3. Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Organization                                                │
│  [Employees] [Departments] [Projects]                        │
├──────────────────────────────────────────────────────────────┤
│ Tab: Employees                                               │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Search [_____]                              [+ Add员工]  │ │
│ │                                                          │ │
│ │ Name      Role         Department     Status     Joined  │ │
│ │ ──────────────────────────────────────────────────────── │ │
│ │ Alice K   Engineer     Platform       Active   2026-01   │ │
│ │ Bob M     PM           Growth         Active   2026-02   │ │
│ │ Charlie   Designer     Platform       Invited  2026-04   │ │
│ │ ...                                                      │ │
│ │                                                          │ │
│ │ [Prev] Page 1 of 3 [Next]                                │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

Tab 切换为 Departments / Projects 时,表格列变化 (见 §5)。

## 4. States

| Tab | 状态 | 行为 |
|---|---|---|
| 全部 | Loading | Table skeleton (5 行) |
| 全部 | Empty | 空态卡片 + 「Add first <X>」按钮 |
| 全部 | Error | 红色 banner + Retry |
| Employees | 行被点击 | Sheet 展开员工详情 |
| Employees | 新增中 | Dialog,提交时按钮 disabled |
| Departments | 行被点击 | Sheet 展开部门成员列表 |
| Projects | 行被点击 | 跳转 `/organization/projects/:id` |

## 5. Data Needs

### Employees tab
| 字段 | 类型 |
|---|---|
| id | string |
| name | string |
| email | string |
| role | enum (owner / admin / member) |
| department | string \| null |
| status | enum (active / invited / suspended) |
| joinedAt | string (ISO) |
| avatar | string \| null |

### Departments tab
| 字段 | 类型 |
|---|---|
| id | string |
| name | string |
| memberCount | number |
| leadName | string \| null |
| createdAt | string |

### Projects tab
| 字段 | 类型 |
|---|---|
| id | string |
| name | string |
| status | enum (active / paused / archived) |
| ownerName | string |
| memberCount | number |
| taskCount | number |
| dueDate | string \| null |

## 6. API Mapping

| 操作 | 端点 | 状态 |
|---|---|---|
| 员工列表 | `GET /api/tenants/:tenantId/employees?cursor=&q=` | ⚠️ **待补** (现有 `members` 是登录用户层,需要更细) |
| 员工新建 | `POST /api/tenants/:tenantId/employees` | ⚠️ **待补** |
| 员工更新 | `PATCH /api/tenants/:tenantId/employees/:id` | ⚠️ **待补** |
| 员工删除 | `DELETE /api/tenants/:tenantId/employees/:id` | ⚠️ **待补** |
| 部门列表 | `GET /api/tenants/:tenantId/departments` | ⚠️ **待补** |
| 部门 CRUD | `POST / PATCH / DELETE /api/tenants/:tenantId/departments/:id?` | ⚠️ **待补** |
| 项目列表 | `GET /api/tenants/:tenantId/projects` | ⚠️ **待补** |
| 项目 CRUD | `POST / PATCH / DELETE /api/tenants/:tenantId/projects/:id?` | ⚠️ **待补** |
| 任务列表 (子页) | `GET /api/projects/:id/tasks` | ⚠️ **待补** |

**完整端点列表** 见 `api/hub-needed.md` §4。共需新增 12 个端点 (employee 4 + department 4 + project 4)。

## 7. Migration Steps

1. **还原**:
   ```
   legacy/v0/packages/web/app/(dashboard)/organization/page.tsx
   legacy/v0/packages/web/components/organization/*
   ```
2. **后端表迁移**:
   - 新增 D1 migration `0006_org_entities.sql`:
     ```sql
     CREATE TABLE employees (
       id TEXT PRIMARY KEY,
       tenant_id TEXT NOT NULL,
       user_id TEXT,           -- 若是平台用户则 FK 到 user 表
       name TEXT NOT NULL,
       email TEXT,
       role TEXT NOT NULL,     -- owner/admin/member
       department_id TEXT,
       status TEXT NOT NULL,   -- active/invited/suspended
       joined_at TEXT NOT NULL
     );
     CREATE INDEX idx_employees_tenant ON employees(tenant_id);

     CREATE TABLE departments (
       id TEXT PRIMARY KEY,
       tenant_id TEXT NOT NULL,
       name TEXT NOT NULL,
       lead_employee_id TEXT,
       created_at TEXT NOT NULL
     );

     CREATE TABLE projects (
       id TEXT PRIMARY KEY,
       tenant_id TEXT NOT NULL,
       name TEXT NOT NULL,
       status TEXT NOT NULL,
       owner_employee_id TEXT,
       due_date TEXT,
       created_at TEXT NOT NULL
     );

     CREATE TABLE tasks (
       id TEXT PRIMARY KEY,
       project_id TEXT NOT NULL,
       title TEXT NOT NULL,
       status TEXT NOT NULL,
       assignee_employee_id TEXT,
       due_date TEXT,
       created_at TEXT NOT NULL
     );
     ```
3. **Hub 新增 routes** (`services/hub/src/routes/employees.ts`、`departments.ts`、`projects.ts`、`tasks.ts`),都做 tenant 隔离 (查询 `WHERE tenant_id = :tid AND ...`)。
4. **权限**:
   - 列表:tenant member 可见
   - 写操作:owner / admin only
5. **删除**:级联策略 — 删 department 时不级联删 employee,改 employee.department_id = NULL。删 project 时级联删 tasks。

## 8. Acceptance

- [ ] 三个 tab 切换正常,数据各自加载
- [ ] 员工 / 部门 / 项目都能列出、搜索、分页
- [ ] 添加员工:Dialog 表单 → 提交后表格刷新,新员工出现
- [ ] 编辑员工:Sheet 内修改 → Save 后表格行更新
- [ ] 删除员工:Confirm Dialog → 删除后行消失
- [ ] 部门下成员展示正确 (Sheet 内)
- [ ] 项目点进去后,子页 `/organization/projects/:id` 显示任务列表
- [ ] tenant member 角色看不到「Add / Edit / Delete」按钮 (UI 层隐藏 + 后端权限校验)
- [ ] 跨 tenant 攻击:在 URL 中改 `tenantId` 拉别人的员工 → 后端返回 403

## 9. Open Questions

- 员工的 user 关联是否强制? **决策**:不强制 — 可以只是「记录中的员工」(无平台账号),只有当员工接受邀请后才关联 user_id。
- 部门是否支持嵌套? **决策**:V1 单层,V2 再考虑。
- 项目和员工是 N:M 还是 1:N? **决策**:V1 项目只有 owner (1:1) 和 member (N:M),用 `project_members` 中间表。本文档省略 — 见 `api/hub-needed.md` 完整 schema。
- 数据导入:如何把现有 Notion / Linear 数据导入? **决策**:V2 实现 connector,V1 走 CSV (onboarding step 2 的入口)。
