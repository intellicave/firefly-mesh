# firefly-mesh product-layer — UI

> **本 sprint 是后端优先**：实现 hub 的产品层 API。dashboard UI **不在本 sleep run 范围**（推迟到下个 sprint：把 `legacy/v0/packages/web/` 搬到 `services/web/` 并改 fetch 走新 hub API）。
>
> 本文档作用：**为下个 sprint 提供 UI ↔ API 的契约预览**，确保新 hub API 设计能被 v0 现有 dashboard UI 顺利消费。

---

## 1. UI 资产盘点

### 1.1 v0 dashboard 现有页面（待搬到 services/web/）

| 页面 | 文件 | 角色 |
|---|---|---|
| `/` (landing) | legacy/v0/packages/web/app/page.tsx | 营销 |
| `/login` | login/page.tsx | 登录 |
| `/signup` | signup/page.tsx | 注册 |
| `/onboarding` | onboarding/page.tsx | 引导首页 |
| `/onboarding/create-org` | onboarding/create-org/page.tsx | 创建组织 |
| `/onboarding/import` | onboarding/import/page.tsx | 导入员工 CSV |
| `/onboarding/tokens` | onboarding/tokens/page.tsx | 颁发 agent token |
| `/onboarding/done` | onboarding/done/page.tsx | 完成 |
| `/(dashboard)/inbox` | (dashboard)/inbox/page.tsx | A2A 收件箱 + HITL |
| `/(dashboard)/organization` | (dashboard)/organization/page.tsx | **员工 + 部门 + 项目管理（本 sprint 后端覆盖）**  |
| `/(dashboard)/knowledge` | (dashboard)/knowledge/page.tsx | 知识库（M8 后端覆盖）|
| `/(dashboard)/skills` | (dashboard)/skills/page.tsx | 技能（M9 后端覆盖）|
| `/(dashboard)/audit` | (dashboard)/audit/page.tsx | 审计日志（M12 后端覆盖）|
| `/(dashboard)/settings` | (dashboard)/settings/page.tsx | 设置 + agent 管理 |

### 1.2 视觉规范来源

继承 [edge ui.md](2026-05-08-firefly-mesh-edge-ui.md) 的设计 token（色彩、排版、圆角、间距、动效），dashboard 搬迁时保留 v0 已有的 shadcn/ui + Tailwind 配置。本 sprint 不引入新视觉规范。

---

## 2. 信息架构（本 sprint 后端覆盖的部分）

```
firefly-mesh.com               (营销)
  /pricing                     V0.2
  /docs                        V0.2

app.firefly-mesh.com           (dashboard，待搬)
  /                            → 重定向 /inbox or /onboarding
  /login                       Better Auth
  /signup                      Better Auth
  /onboarding/                 首次完整流（4步）
  /inbox                       A2A 收件箱（M11 覆盖，本 sprint 无）
  /organization                ← 本 sprint 完整覆盖
    │
    ├── 标签 1: Employees       /api/employees
    ├── 标签 2: Departments     /api/departments + /api/departments/:id/members
    └── 标签 3: Projects        /api/projects + /api/projects/:id/members
  /knowledge                   （M8 后端覆盖）
  /skills                      （M9 后端覆盖）
  /audit                       （M12 后端覆盖）
  /settings/
    /profile                   /api/employees/me（self profile）
    /agents                    /api/agents（已 hub 实现）
    /devices                   /api/agents (device sub-resource)
    /billing                   V0.2
```

---

## 3. /organization 页面规划（本 sprint API 的主消费者）

### 3.1 布局

```
┌──────────────────────────────────────────────────────────────────┐
│ < Acme Inc · Organization                          [+ Invite]   │
│  ─────────────────────────────────────────────────────────────  │
│   [Employees] [Departments] [Projects]                          │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│   {tab content}                                                  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 Tab 1: Employees

```
┌────────────────────────────────────────────────────────────────┐
│ Search: [_______]    Role: [All ▾]   Status: [Active ▾]        │
├────────────────────────────────────────────────────────────────┤
│ ☐ Name              Email                Role     Dept   Status │
├────────────────────────────────────────────────────────────────┤
│ ☐ Alice Liu         alice@acme.com       admin    Eng    ●Act  │
│ ☐ Bob Wei           bob@acme.com         manager  Prod   ●Act  │
│ ☐ Carol Tang        carol@acme.com       employee Eng    ●Act  │
│ ☐ Dave Smith        dave@acme.com        auditor  —      ●Arc  │
└────────────────────────────────────────────────────────────────┘
   [Bulk: Archive] [Bulk: Change Role]     Total 12 employees
```

**状态**：
- Loading：骨架屏（skeleton row × 5）
- Empty：插画 + "No employees yet · [Invite first member]"
- Error：banner "Failed to load · [Retry]"
- 行 hover：显示 [Edit] [Archive] 按钮
- 自己的行：不能删自己，按钮置灰

**详情 drawer**（右滑）：
```
┌──────────────────────────────────────┐
│ < Back                Alice Liu      │
├──────────────────────────────────────┤
│ ┌─Avatar─┐  Alice Liu                │
│ │  AL    │  alice@acme.com           │
│ └────────┘  Senior Engineer           │
│                                       │
│ Role:        [admin ▾]                │
│ Status:      [● Active ▾]             │
│ Departments: Eng, Tools-Team [+]      │
│ Projects:    Project Falcon (lead),   │
│              Project Hawk             │
│                                       │
│ Joined:      2025-04-12                │
│ User ID:     bauth_xxx                 │
│                                       │
│ [Cancel]                    [Save]    │
└──────────────────────────────────────┘
```

### 3.3 Tab 2: Departments

```
┌────────────────────────────────────────────────────────────────┐
│ + New Department                                                │
├────────────────────────────────────────────────────────────────┤
│                                                                  │
│   📁 Engineering ▾                                  12 members  │
│       └── Tools Team                                  5 members  │
│       └── Platform Team                               7 members  │
│   📁 Product ▾                                       8 members  │
│   📁 Sales                                            6 members  │
│                                                                  │
└────────────────────────────────────────────────────────────────┘
```

**点部门展开 → 右侧 panel**：
```
┌──────────────────────────────────────┐
│ Engineering                    [···] │
├──────────────────────────────────────┤
│ Description: ...                      │
│ Head: Alice Liu                       │
│ Parent: —                             │
│                                       │
│ Members (12):                         │
│  Alice Liu (head)    [×]              │
│  Bob Wei             [×]              │
│  Carol Tang          [×]              │
│  ...                                  │
│ [+ Add member]                        │
│                                       │
│ [Edit] [Delete]                       │
└──────────────────────────────────────┘
```

### 3.4 Tab 3: Projects

```
┌────────────────────────────────────────────────────────────────┐
│ [All ▾] [Planning] [Active] [Done] [Archived]    + New Project │
├────────────────────────────────────────────────────────────────┤
│                                                                  │
│ ┌──────────────────────┐ ┌──────────────────────┐               │
│ │ Project Falcon       │ │ Project Hawk         │               │
│ │ ● Active             │ │ ● Planning           │               │
│ │ 4 members            │ │ 2 members            │               │
│ │ Sep 1 - Dec 31       │ │ TBD - TBD            │               │
│ │ ─────────────────── │ │ ─────────────────── │               │
│ │ Q3 search rebuild... │ │ AI-powered onboar... │               │
│ └──────────────────────┘ └──────────────────────┘               │
│                                                                  │
└────────────────────────────────────────────────────────────────┘
```

**点 card → drawer**（同 employees 的详情 drawer 模式）。

---

## 4. 关键交互

### 4.1 邀请员工（dashboard → hub 调用流）

```
[+ Invite] 按钮点击
  → 弹窗：输入 email + 选 role + 选 dept
  → POST /api/invite (existing hub endpoint，会改造支持 employee 关联)
  → 邀请邮件发出
  → dashboard 显示 toast "Invitation sent"

被邀者点链接
  → GET /invite/:token → 登录或注册
  → POST /api/invite/:token/accept (existing，本 sprint 改造)
  → 同事务：建 membership + 建 employee（拿邀请时配的 role + dept）
  → 跳 /onboarding/profile 让员工填 name / title / avatar
```

**注意**：完整邀请流改造（含 employee 关联）属于 M2 的 follow-up，**不在本 sleep run 范围**。本 sleep run 只新增 employees CRUD（admin 可直接 POST /api/employees 创建无 user_id 的"待绑定"员工，邀请接受时绑定 user_id）。

### 4.2 改 employee 角色（产品级 RBAC）

```
点员工详情 drawer → Role 下拉切换 admin → Save
  → PATCH /api/employees/:id { role: 'admin' }
  → hub:
     - check requester employee.role in ['owner','admin']
     - update employees.role
     - 如果新 role 是 owner/admin → 同步更新 memberships.role
     - 写 audit_log
  → 200 OK
  → drawer 显示 toast "Role updated"
```

### 4.3 状态机：项目状态转移

```
planning → active        admin / manager / project lead
active → done            admin / manager / project lead
* → archived             admin / manager
* → planning             不允许（一旦 active 就回不去 planning）
```

UI 上下拉只显示 valid transition options。

---

## 5. UI 不做的事（本 sprint）

- ❌ 实际写 services/web/ 代码（下个 sprint）
- ❌ 设计 inbox / knowledge / skills / audit 页面（对应模块 sprint 时再做）
- ❌ 设计移动端响应式（v0 已有，搬迁时验证）
- ❌ 重新设计视觉规范（v0 + edge 已定）
- ❌ 设计 onboarding 流（v0 已有 5 步，搬迁时调整 fetch 即可）

---

## 6. 验收

dashboard 搬迁完毕后（下下个 sprint），通过以下用户流验收本 sprint API 设计：

1. Carol（owner）能在 /organization 创建 3 个部门、邀请 5 个员工、创建 2 个项目，每步都看到立即反馈
2. Alice（admin）能改 Bob 的部门归属，但不能把自己降级
3. Carol 能让 Bob 成为 Project Falcon 的 lead，Bob 进 /organization?tab=projects 看到 Project Falcon 高亮
4. Dave（auditor）打开 /organization 能看全数据，但所有 +/编辑按钮置灰
5. 删除 Bob 时弹"你确定？这会同时把他从 2 个部门 + 3 个项目移除"

每个验收点对应一个 hub API endpoint（见 [api.md §3 RBAC 矩阵](2026-05-16-firefly-mesh-product-layer-api.md)）。

---
