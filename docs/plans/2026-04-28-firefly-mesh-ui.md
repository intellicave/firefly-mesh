# firefly-mesh — UI / UX 设计（autodev-ui 产出）

> **输入**：[ideation.md](2026-04-28-firefly-mesh-ideation.md) + [oss-scan.md](2026-04-28-firefly-mesh-oss-scan.md) + [design.md](2026-04-28-firefly-mesh-design.md)
> **风格继承**：firefly 上级项目 [DESIGN.md](../../../MultiAgent/DESIGN.md) + [globals.css](../../../MultiAgent/web/app/globals.css)
> **核心原则**：基于 firefly UI 复用最大化（meta.md §2.1）+ 复用前 audit（§2.2）

---

## 0. 设计原则（继承 firefly）

1. 信息密度高但层级清晰（企业用户容忍密集，不容忍混乱）
2. 温暖而不失专业（Claude 暖橙基调 + 现代 SaaS 结构感）
3. **HITL 强视觉提示**（橙色 CTA + 未读提示 + 实时 SSE 闪烁反馈）
4. 所有 agent 元素带"人味"（Agent 卡片始终显示 owner 员工 avatar + name）
5. **"这不是工具，是组织"** — 全程强化 mesh 视觉隐喻
6. **复用前先 audit**（meta.md §2.2 铁律）—— 不盲信 firefly 已实现的方案

---

## 1. 信息架构（6 顶级页面 + onboarding）

> **范围扩展 2026-04-28**：用户选方案 Y（3 层 namespace），新增 `/knowledge` + `/skills` 两页。Sidebar 从 4 → 6 项。

```
firefly-mesh
├── /                       → 自动重定向
│     未登录 → /login
│     首次 admin → /onboarding/create-org
│     已登录 → /inbox（默认主页）
│
├── /inbox                  P9 + 心脏页
│     ?tab=approve          待我批准发送（sender HITL）
│     ?tab=action           待我处理（receiver HITL + 任务审核）
│
├── /organization           P5 Org graph
│     节点 click → drawer 嵌入式（不跳转）
│
├── /knowledge              P12 三层 KB + RAG（新增）
│     ?scope=company         全员可见
│     ?scope=dept&id={id}    部门内可见
│     ?scope=personal        我自己
│
├── /skills                 P13 三层 Skill registry（新增）
│     ?scope=company
│     ?scope=dept&id={id}
│     ?scope=personal
│
├── /audit                  P11 A2A 追溯
│     ?thread={id}          drawer 嵌入完整 thread
│     ?actor={id}           按参与方 filter
│
├── /settings
│     /settings/account
│     /settings/agent       看自己的 agent 接入状态 + 重生 token
│     /settings/org         (admin)
│     /settings/members     (admin)
│     /settings/tokens      (admin)
│     /settings/boundaries  (admin)
│
└── /onboarding             首次部署 wizard（仅 admin 首次见）
      /onboarding/create-org
      /onboarding/import-employees
      /onboarding/generate-tokens
      /onboarding/done
```

### 按角色 Sidebar 显隐

| 项 | owner/admin | manager | employee | auditor |
|---|:-:|:-:|:-:|:-:|
| Inbox | ✅ | ✅ | ✅ | ✅ 只读 |
| Organization | ✅ 编辑 | ✅ 部门内编 | 只读 | 只读 |
| Knowledge | ✅ 全 scope 可写 | ✅ 自己 dept + personal 可写；company 只读 | ✅ 自己 dept 只读 + personal 可写；company 只读 | ✅ 全部只读 |
| Skills | ✅ 全 scope 可写 | ✅ 自己 dept + personal 可写；company 只读 | ✅ 自己 dept 只读 + personal 可写；company 只读 | ✅ 全部只读 |
| Audit | ✅ 全部 | 限本部门 | 限自己 | ✅ 全部 |
| Settings | ✅ 全部 | account + agent | account + agent | account + agent |

---

## 2. Design Tokens（直接继承 firefly globals.css）

第一版 firefly-mesh 的 [`packages/web/app/globals.css`](../packages/web/app/globals.css) **完全 = firefly globals.css**，原因：

- 所有 Claude 配色、字号刻度、圆角、阴影、字体都是设计真值，无需重新决策
- 已实现的 React Flow 全局微调、`pulse-orange` / `mesh-in` / `save-flash` / `message-flash` keyframe 都直接拿来用
- `prefers-reduced-motion` 已 honor

具体值见 firefly [globals.css](../../../MultiAgent/web/app/globals.css)。复用决策：**直接 fork**，唯一改动是 `<title>` 元数据（应用名 firefly-mesh）。

---

## 3. App Shell

```
┌──────────────────────────────────────────────────────────────────────┐
│ [🔥 firefly-mesh]  [Acme Inc. ▾]  [🔍 ⌘K]    [🔔 8]   [👤 Alice]   │  TopBar h-14
├─────────────────────┬────────────────────────────────────────────────┤
│ Sidebar w-60        │                                                 │
│                     │                                                 │
│ ◉ Inbox       (8)   │                                                 │
│ ○ Organization      │       Main Content (full bleed)                 │
│ ○ Knowledge         │                                                 │
│ ○ Skills            │                                                 │
│ ○ Audit             │                                                 │
│ ○ Settings          │                                                 │
│                     │                                                 │
│ ─────────────       │                                                 │
│ Pending Actions (8) │                                                 │
│  · Review task #12  │                                                 │
│  · Approve A2A msg  │                                                 │
│  · Sync with Bob    │                                                 │
│ ─────────────       │                                                 │
│ [👤] Alice Zhang    │                                                 │
│      admin          │                                                 │
└─────────────────────┴────────────────────────────────────────────────┘
```

- **TopBar** (h-14)：Logo + Org switcher（multi-tenant，firefly 没有）+ ⌘K Search + 🔔 通知 + 用户头像
- **Sidebar** (w-60)：6 顶级 nav + Pending Actions 实时计数（橙色脉冲）+ 当前用户卡
- **激活态**：当前 nav 项 `bg-secondary` + 左侧 3px 橙色竖条
- **Pending dot**：用 `pulse-orange` 动画（fork firefly globals.css）

---

## 4. 页面详细设计

### 4.1 `/inbox` — HITL Inbox（心脏页）

**用途**：员工每天处理"待我批准发送" + "待我处理"，产品 80% 时间停留页面。
**入口**：登录后默认 / Sidebar / TopBar 通知 Bell
**出口**：drawer inline 完成 / 切其它页

**布局**：

```
┌──────────────────────────────────────────────────────────────────────┐
│ Inbox                                              [🔍 search...]     │  font-serif H1
├──────────────────────────────────────────────────────────────────────┤
│ ╔═ Pending Send (3) ═╗ Pending Action (5)                            │  Tabs
│                                                                        │
│ [Filter: type ▼] [Filter: agent ▼] [Sort: time ▼]                    │
│ ─────────────────────────────────────────────────────────────         │
│ ┌────────────────────────────────────────────────────────────────┐  │
│ │ [⬇commit] Bob's Hermes → Carol's Cursor             14m ago    │  │  hover:bg-secondary
│ │ ABC 公司方案：我们承诺 Q3 完成交付                  [✓][✕]     │  │  click → drawer
│ ├────────────────────────────────────────────────────────────────┤  │
│ │ [⇆request] Alice's OpenClaw → Bob's Hermes          2h ago     │  │
│ │ 请你的 agent 提供华东地区客户名单                   [✓][✕]     │  │
│ ├────────────────────────────────────────────────────────────────┤  │
│ │ [↪handoff] System → Carol (escalated)               3h ago     │  │  amber tint
│ │ 任务 #1234 第 3 轮被拒，自动升级                    [Open ▸]   │  │
│ └────────────────────────────────────────────────────────────────┘  │
│ [Load earlier ↑]                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Sheet drawer**（点击行右侧 480px 滑入）：

```
× commit  Bob → Carol
─────────────────────────────────
[Bob's Hermes] [Carol's Cursor]
  Sales VP      Legal Counsel

ABC 公司方案：我们承诺 Q3 完成
交付，含 SLA 99.9%，违约赔偿
不超过 X 元

─ Linked task ─
Task #1234: 华东市场拓展 Q3
→ Open task ▸

─ Audit metadata ─
Sender signature: ✓ Verified
Created: 2026-04-28 14:18
─────────────────────────────────
[✓ Approve (A)]  [✕ Reject (R)]
[+ Add comment]
```

**核心组件**（fork / 借鉴 / 新建标记）：

| 组件 | firefly 复用决策 |
|---|---|
| Tabs | fork `ui/tabs.tsx` |
| List row | **新建** `inbox/InboxRow.tsx`（行内 type badge + sender → receiver + content + actions） |
| Type badge | fork `ui/badge.tsx` + 7 种 type 配 4 种 accent 色 |
| Sheet drawer | fork `ui/sheet.tsx` |
| Filter / Sort | shadcn DropdownMenu fork |

**数据需求**：
- `GET /api/a2a/inbox?employeeId={me}&tab=approve|action&filter=...&cursor=...` → 返回 list (lazy load 完整内容只在 drawer)
- `POST /api/a2a/approve` (sender 侧) / `POST /api/a2a/accept` (receiver 侧) / `POST /api/a2a/reject`
- SSE channel: `/api/stream?topic=inbox.{employeeId}` 推送新消息
- 进 drawer 时 `GET /api/a2a/{messageId}` 返回完整内容 + linked task

**4 状态**：
- Loading → Skeleton 5 行
- Empty → `<Inbox>` icon + "No pending actions" + 提示语
- Normal → list + drawer
- Error → banner + retry
- Partial → list + "Load earlier ↑"
- New SSE → 顶部"+ N new"按钮（不打断 drawer）

---

### 4.2 `/organization` — Org Graph

**用途**：可视化员工/部门/项目结构 + 节点 click 编辑。
**入口**：Sidebar nav
**出口**：drawer 编辑完成（不跳转）

**布局**：

```
┌──────────────────────────────────────────────────────────────────────┐
│ Organization                              [部门 ▼ | 项目]  [+ Add]  │
├──────────────────────────────────────────────────────────────────────┤
│ [🔍 emp] [Filter dept ▼] [↻]              [➖ 100% ➕] [⛶ reset]  │
│ ─────────────────────────────────────────────────────────────────    │
│                          ┌─────────────┐                              │
│                          │ 👤 Alice    │                              │
│                          │ CEO         │                              │
│                          │ ● online    │                              │
│                          └──────┬──────┘                              │
│              ┌──────────────────┼──────────────────┐                  │
│       ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐         │
│       │ 👤 Bob      │    │ 👤 Eve      │    │ 👤 Carol    │         │
│       │ Sales VP    │    │ Eng VP      │    │ Legal       │         │
│       │ ● online    │    │ ● online    │    │ ○ offline   │         │
│       │  3 agents   │    │  5 agents   │    │  1 agent    │         │
│       └─────────────┘    └─────────────┘    └─────────────┘         │
│                                              ┌─ Minimap ─┐            │
└──────────────────────────────────────────────────────────────────────┘
```

**节点 drawer**（双 tab Profile / Agent，去掉 firefly drawer 中的 V2 字段：skills / prompt / memory / artifacts）：

```
× Bob Zhang
─────────────────────────────────
╔ Profile ╗  Agent  Boundary

Title:  Sales VP
Email:  bob@acme.com
Dept:   Sales
Role:   manager
Status: ● active

─ Reports to ─
Alice Zhang (CEO)

─ Reports ─
• Charlie Lee  (Sales Lead)
• Dora Wang    (Sales)
─────────────────────────────────
[Edit]  [Archive]
```

切到 Agent tab：

```
Profile  ╔ Agent ╗  Boundary

Runtime:    Hermes Agent v0.11.0
Last seen:  2 minutes ago
Status:     ● active

Skills loaded:
 • firefly-mesh/email-draft
 • firefly-mesh/sales-script

Token: ••••••••12ab    [Regenerate]
```

切到 Boundary tab：

```
Profile  Agent  ╔ Boundary ╗

Allowed scopes (server-side enforced):
 ☑ read_customer_data
 ☑ propose_deal
 ☑ send_internal_email
 ☐ send_external_email      ← 灰，受限
 ☐ sign_contract            ← 灰，受限
 ☐ commit_payment           ← 灰，受限

[Save]
```

**核心组件**（复用决策）：

| 组件 | firefly 路径 | 决策 |
|---|---|---|
| `OrgChart` (xyflow + Dagre) | `web/components/organization/org-chart.tsx` | ✅ **fork**（核心，直接拿） |
| `AgentDetailDrawer` | `web/components/organization/agent-detail-drawer.tsx` | **fork-and-trim**：删 V2 tab（skills/prompt/memory/artifacts），保留 Profile + 新增 Agent + Boundary tab |
| `NodeEditDialog` | `web/components/organization/node-edit-dialog.tsx` | **fork-and-trim** |
| `OrgToolbar` | `web/components/organization/org-toolbar.tsx` | **fork-and-trim** |
| `ConfirmDialog` | `web/components/organization/confirm-dialog.tsx` | ✅ fork |
| `ImageDropzone` | `web/components/organization/image-dropzone.tsx` | ✅ fork（admin 上传 logo） |
| `mesh-in` 节点入场动画 | `web/app/globals.css` | ✅ fork keyframe |
| `save-flash` 保存绿带 | `web/app/globals.css` | ✅ fork keyframe |
| `prompt-init-dialog` | firefly | ❌ 不复用（agent runtime 在客户端） |
| `skill-init-dialog` | firefly | ❌ 不复用（V2） |

**触发 firefly upgrade-backlog**：
- **B3（P3 nice-to-have）**：firefly 的 `agent-detail-drawer.tsx` 把"员工信息"+"agent 配置"+"工作产物"糅合在一个 drawer 里。firefly-mesh 的 trim 后只剩 Profile/Agent/Boundary 三 tab，更对应职责。建议 firefly 也按职责拆 tab，更符合 [PRD §3.3 节点详情结构](../../../MultiAgent/PRD.md)

**数据需求**：
- `GET /api/org` → 全部 employees + departments + projects + agents（小公司 < 200 人，整批返回）
- `PUT /api/employee/{id}` / `POST /api/employee` / `DELETE /api/employee/{id}`
- `PUT /api/boundary/{agentId}` 改 scope
- `POST /api/token/regenerate?employeeId={id}` 重生 token

**4 状态**：
- Loading → 中央 spinner（不用骨架，graph 需全数据）
- Empty → `<Network>` icon + "No employees yet" + admin CTA "Add your first"
- Normal → graph + drawer
- Error → banner + retry

---

### 4.3 `/audit` — A2A 对话追溯

**用途**：审计员/管理员复盘 A2A 对话归责到人。
**入口**：Sidebar nav / Inbox drawer "View thread" / Org drawer 某员工的"agent 历史"
**出口**：drawer 内嵌跳转 task

**布局**：

```
┌──────────────────────────────────────────────────────────────────────┐
│ Audit Trail                                          [Export CSV ▼]  │
├──────────────────────────────────────────────────────────────────────┤
│ [📅 last 7d ▼] [👥 actor ▼] [🏷 type ▼] [🔗 task ▼] [Reset]        │
│ ─────────────────────────────────────────────────────────────────    │
│ Today                                                                 │
│  ┊ 14:32  [commit] ✓  Alice → Bob's Hermes        Task #1234        │
│  ┊         "ABC 公司方案承诺 Q3 完成"                                  │
│  ┊                                                                    │
│  ┊ 14:30  [request] ✓  Bob's Hermes → Alice's…   Task #1234         │
│  ┊         "请你的 agent 提供华东客户名单"                              │
│  ┊                                                                    │
│  ┊ 14:25  [escalate] ⏳  System → Carol           Task #1230         │
│  ┊         "3 轮拒绝自动升级"                                           │
│ ──────────────────────────                                            │
│ Yesterday                                                              │
│  ┊ ...                                                                 │
│ [Load earlier ↑]                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Drawer**（点击行）：

```
× Thread #ad-3f72  (Task #1234)
─────────────────────────────────
╔ Messages ╗  Linked Task  Audit Log

Message 1  · 14:18  · [request] ✓
  From:  Bob's Hermes (Sales VP)
  To:    Alice's OpenClaw (CEO)
  Body:  请你的 agent 提供华东...
  Approved by Bob: 14:18  ✓
  Accepted by Alice: 14:20 ✓

Message 2  · 14:25  · [inform] ✓ auto
  From:  Alice's OpenClaw
  To:    Bob's Hermes
  Body:  附华东客户列表 v2.1...

Message 3  · 14:32  · [commit] ✓
  ...

[Show full payload (JSON)]
```

**核心组件**（**新建**为主）：

| 组件 | 决策 |
|---|---|
| `AuditTimeline` | **新建**（vertical 时间线 + group by day） |
| `AuditFilterBar` | **新建**（4 个 dropdown filter + Reset） |
| `ThreadDrawer` | **新建**（3 tab：Messages / Linked Task / Audit Log） |
| Lifecycle pill | **借鉴样式** firefly `messages/lifecycle-capsule.tsx`（不直接 fork，因为 firefly 的是消息单条，不是 thread overview） |
| `animate-message-flash` | ✅ fork firefly globals.css |

**数据需求**：
- `GET /api/audit/threads?from={ts}&to={ts}&actor={id}&type={t}&taskId={id}&cursor={c}` → list
- `GET /api/audit/threads/{threadId}` → 完整 thread + audit_log
- `GET /api/audit/threads/{threadId}/export.csv`
- SSE: `/api/stream?topic=audit.org.{orgId}` 实时推送新消息（auditor 可观）

**4 状态**：
- Loading → 时间线 5 行骨架
- Empty → `<History>` icon + "No A2A activity in this range" + 引导改 filter
- Normal → 时间线
- Error → banner + retry
- Partial → load earlier
- New SSE → 行用 `animate-message-flash` 闪 2s

---

### 4.4 `/settings` — 设置

**布局**（左 sub-nav + 右 content）：

```
┌──────────────────────────────────────────────────────────────────────┐
│ Settings                                                              │
├──────────────────────────────────────────────────────────────────────┤
│ ┌─ Sub-nav ─────┐  ┌─ Content ──────────────────────────────────┐  │
│ │               │  │                                              │  │
│ │ Account       │  │   [当前所选项的内容]                         │  │
│ │ My Agent      │  │                                              │  │
│ │ ─────         │  │                                              │  │
│ │ Org Profile¹  │  │                                              │  │
│ │ Members¹      │  │                                              │  │
│ │ Tokens¹       │  │                                              │  │
│ │ Boundaries¹   │  │                                              │  │
│ │              ¹ admin                                              │  │
│ └────────────────┘  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

#### `/settings/account`

| 字段 | 操作 | 复用 |
|---|---|---|
| Avatar | ImageDropzone | fork firefly `image-dropzone.tsx` |
| Name | Input | shadcn |
| Email (readonly) | - | shadcn |
| Change password | Dialog + 2 输入 | fork firefly settings 模式 |
| Delete account | Confirm dialog | fork firefly `confirm-dialog.tsx` |

#### `/settings/agent`（**新建**，firefly 没有）

我自己的 agent 接入信息：

| 字段 | 内容 |
|---|---|
| Runtime kind | `Hermes Agent` |
| Runtime version | `v0.11.0` |
| Skill manifest | `@firefly-mesh/skill v0.1.0` |
| Last seen | `2 minutes ago` |
| Token | `••••••••12ab` + [Regenerate] |
| Quick connect snippet | 复制可用的 `<agent> skill install` 一行命令 |

**触发 firefly upgrade-backlog**：
- 不触发——firefly 当前 agent 在 server 端跑，无"接入状态"概念。这是 firefly-mesh 特有页面。

#### `/settings/org`（admin）

| 字段 | 复用 |
|---|---|
| Org name / slug / logo | fork firefly settings 模式 |
| Default language | shadcn select |

#### `/settings/members`（admin）

员工 CRUD 表格 + 批量导入：

```
┌─ Members ────────────────────────────────────────────────────┐
│ [+ Add]  [📎 Import CSV]  [📥 Export CSV]   [🔍 search]    │
│ ────────────────────────────────────────────────────────────  │
│ Name      Email           Title       Role     Status   ⋯   │
│ Bob Zhang bob@acme.com   Sales VP    manager  ● active  ⋯  │
│ Eve Liu   eve@acme.com   Eng VP      manager  ● active  ⋯  │
│ ...                                                            │
└──────────────────────────────────────────────────────────────┘
```

| 组件 | 复用 |
|---|---|
| Table | shadcn Table |
| 行编辑 | inline edit + save |
| Import | fork firefly `organization/import-preview.tsx` |
| Export | 浏览器下载 CSV |

#### `/settings/tokens`（admin，**新建**）

```
┌─ Access Tokens ───────────────────────────────────────────────┐
│ [+ Generate for selected employees]      [🔍 search]         │
│ ────────────────────────────────────────────────────────────  │
│ Employee  Token   Status      Created    Expires    Action   │
│ Bob Zhang ••12ab  ● consumed  Apr 25     Apr 28     [revoke] │
│ Eve Liu   ••6f3d  ⏳ pending  Apr 28     May 5      [revoke] │
│ Carol L.  ••a91c  ❌ revoked  Apr 22     -           -       │
│ ...                                                            │
└──────────────────────────────────────────────────────────────┘
```

#### `/settings/boundaries`（admin，**新建**）

per-agent 的 JWT scope 配置（checkbox group + scope catalog）：

```
┌─ Representation Boundaries ───────────────────────────────────┐
│ [👤 Bob Zhang ▼ Hermes Agent]                                │
│ ────────────────────────────────────────────────────────────  │
│ ☑ read_customer_data       (read)                            │
│ ☑ propose_deal             (write, requires HITL)            │
│ ☑ send_internal_email      (action, requires HITL)           │
│ ☐ send_external_email      (action, requires HITL)           │
│ ☐ sign_contract            (action, requires HITL, dangerous)│
│ ☐ commit_payment           (action, requires HITL, dangerous)│
│                                                                │
│ [Save]   [Apply to all in dept]                               │
└──────────────────────────────────────────────────────────────┘
```

**数据需求**：
- `GET /api/employee/{me}` / `PUT /api/employee/{me}`
- `GET /api/agent/{me}` 个人 agent 接入元数据
- `POST /api/auth/change-password`
- `DELETE /api/account`
- `GET /api/org` (admin)
- `GET /api/employee` (admin) / `POST` / `PUT` / `DELETE`
- `GET /api/token` (admin) / `POST` / `DELETE` (revoke)
- `GET /api/boundary/{agentId}` / `PUT`

**4 状态**：每个 sub-page 都按表单标准走 Loading / Empty (Tokens 子页) / Normal / Error / Saving / Saved。

---

### 4.5 `/knowledge` — 三层知识库（新增 P12）

**用途**：员工 / 管理员上传共享文档；agent 通过 `firefly.kb.search(query, scope)` 检索。
**入口**：Sidebar nav / Audit drawer 内"linked KB"链接
**出口**：drawer 编辑文档元数据 / 重 chunk

**布局**（顶部 3 namespace tabs + list）：

```
┌──────────────────────────────────────────────────────────────────────┐
│ Knowledge Base                                       [+ Upload]      │
├──────────────────────────────────────────────────────────────────────┤
│ ╔ Company (12) ╗  Dept ▼ Sales (8)   ◐ My Personal (5)              │  3 namespace tabs
│ ─────────────────────────────────────────────────────────────────    │
│ [🔍 search this scope]  [Filter: type ▼] [Sort: updated ▼]          │
│ ──────────────────────────────────────────────────────────────────   │
│ ┌──────────────────────────────────────────────────────────────┐  │
│ │ 📄 Q3 Customer Onboarding Playbook        Apr 25  [Edit][⋯] │  │
│ │ ABC company contract template, 8 pages, 24 chunks indexed       │  │
│ ├──────────────────────────────────────────────────────────────┤  │
│ │ 📄 Sales Pitch Deck v3.2                  Apr 20  [Edit][⋯] │  │
│ │ Quarterly sales deck, 12 slides, 18 chunks                      │  │
│ ├──────────────────────────────────────────────────────────────┤  │
│ │ ...                                                              │  │
│ └──────────────────────────────────────────────────────────────┘  │
│  [Load more ↑]                                                        │
└──────────────────────────────────────────────────────────────────────┘
```

**Drawer**（点击"Edit"或行）：

```
× Q3 Customer Onboarding Playbook
─────────────────────────────────
Scope: Company  [▼ change]
Title: ____________________
Tags:  [sales] [onboarding] [+ add]

[📄 Replace file]   原文件 v1.2.pdf, 8 pages

─ Indexing status ─
24 chunks indexed
Last embed: 2 minutes ago
Embed model: voyage-3-large

─ Preview top chunks ─
Chunk 1 (Score: 0.92): "ABC 公司在 2026 Q1 ..."
Chunk 2 (Score: 0.88): "联系人列表 / 决策链 ..."
─────────────────────────────────
[Save] [Re-index]  [Delete]
```

**核心组件**：
- 顶部 3 tab：fork `ui/tabs.tsx`；scope 切换走 URL `?scope=` 参数
- list 行：**新建** `KnowledgeRow.tsx`（icon + title + meta + chunks 计数）
- 上传：fork firefly `image-dropzone.tsx` 思路，扩到接受 PDF / DOCX / MD / TXT；客户端切片预览
- drawer：fork `ui/sheet.tsx`；scope 改的下拉用 shadcn Select

**数据需求**（接 ui §9）：
- `GET /api/knowledge?scope=company|dept|personal&deptId=...&cursor=...` → list
- `POST /api/knowledge/upload` (multipart) → 解析 + chunk + embed pipeline 启动（异步 task，SSE 推 progress）
- `GET /api/knowledge/{id}` → 元数据 + chunks 预览
- `PUT /api/knowledge/{id}` / `POST /api/knowledge/{id}/reindex` / `DELETE`
- `GET /api/knowledge/search?q={q}&scope=...` → RAG 检索（同时是 agent 通过 skill tool 调的 endpoint）

**4 状态**：
- Loading → list 5 行骨架
- Empty → `<BookOpen>` icon + "No documents in this scope" + admin/owner CTA "Upload first" / 普通员工"Ask your admin"
- Normal → list + drawer
- Error → banner + retry
- Indexing → list 行右侧带 spinner + chunk count 实时更新（SSE）

**复用决策**：
- firefly 有 `web/components/knowledge/`（计划但 V2，未实际实现完整）→ 检查后预计**新建为主，借鉴 firefly knowledge schema 字段名**
- pgvector + embedMany 实现：firefly `web/lib/ai/knowledge-pipeline.ts` → **借鉴算法 + 重写**
- chunk preview 渲染：shadcn 自建

**触发 firefly upgrade-backlog**：
- 新增 **B4（P3）**：firefly KB MVP 是 V0.2，但 firefly-mesh 升进 v1。建议 firefly 也对齐升级（KB 在 PRD §3.7 是核心能力，缺它影响产品完整性）

---

### 4.6 `/skills` — 三层 Skill registry（新增 P13）

**用途**：员工 / 管理员管理分级 skill；agent 接入时 server 推送 = 所有 Company + 所属 Dept + 自己 Personal。
**入口**：Sidebar nav
**出口**：drawer 编辑 skill 元数据 / 启用 disable / 试运行

**布局**：

```
┌──────────────────────────────────────────────────────────────────────┐
│ Skills                                              [+ Create]       │
├──────────────────────────────────────────────────────────────────────┤
│ ╔ Company (8) ╗  Dept ▼ Sales (3)   ◐ My Personal (2)               │
│ ─────────────────────────────────────────────────────────────────    │
│ [🔍 search]  [Sort: usage ▼]                                          │
│ ──────────────────────────────────────────────────────────────────   │
│ ┌──────────────────────────────────────────────────────────────┐  │
│ │ ✨ email-draft        v0.3.2     used 124× this week  [Edit] │  │
│ │ Compose customer-friendly emails with company tone              │  │
│ ├──────────────────────────────────────────────────────────────┤  │
│ │ ✨ sop-checker        v0.2.1     used 56×             [Edit] │  │
│ │ Verify task output against the SOP for that node                │  │
│ ├──────────────────────────────────────────────────────────────┤  │
│ │ ...                                                              │  │
│ └──────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

**Drawer**：

```
× email-draft
─────────────────────────────────
Scope: Company  [▼ change]
Manifest ID: firefly-mesh/email-draft
Version: 0.3.2  [bump → 0.3.3]
Status: ● active

─ SKILL.md ─
[markdown editor / monaco lite]

# Email Draft
When user asks for a draft email,
follow these steps:
1. Identify recipient
2. Match company tone...

─ Bound files ─
 • templates/welcome.md
 • templates/followup.md
 • [+ Add file]

─ Conflict preview ─
Personal scope override: none
Department override:    sop-team has v0.3.0 (older)
─────────────────────────────────
[Save]  [Run dry test]  [Disable]
```

**核心组件**：
- 顶部 3 tab：同 `/knowledge`
- list 行：icon `Sparkles` + manifest_id + version + usage count + edit
- markdown 编辑器：MVP 用 `@uiw/react-md-editor` 或 textarea + shiki 预览（不上 Monaco，太重）
- conflict preview：server 端实时算出"如果这个 skill 改了，会影响哪些 dept / personal scope"

**数据需求**：
- `GET /api/skill?scope=...&deptId=...` → list（不返回完整 SKILL.md，只元数据）
- `GET /api/skill/{id}` → 完整 manifest + bound files + conflict info
- `POST /api/skill` (admin/manager 限本 scope) / `PUT /api/skill/{id}` / `DELETE`
- `POST /api/skill/{id}/dry-run` → 临时 skill 容器跑一次 sample input
- `GET /api/skill/loaded?employeeId={me}` → 该员工的有效 skill 列表（资料组装：Company + Dept + Personal，按优先级合并）

**4 状态**：每页通用 Loading / Empty / Normal / Error；agent 接入时拉 loaded skill 走 SSE 实时同步。

**复用决策**：
- 100% **新建**（firefly skill 是计划 V0.2，没现成实现可 fork）
- agentskills.io 标准用作 manifest 校验

**触发 firefly upgrade-backlog**：
- 新增 **B5（P3）**：firefly Skill 是 PRD §3.6 核心，MVP 是 hardcoded；firefly-mesh 升进 V1 完整 3 层 registry。建议 firefly 也对齐升级。

---

### 4.7 `/onboarding/*` — 首次部署 wizard

**Layout**（独立，无 sidebar）：

```
┌──────────────────────────────────────────────────────────────────────┐
│ [🔥 firefly-mesh]                                                    │
├──────────────────────────────────────────────────────────────────────┤
│           ●━━━━━●━━━━━○━━━━━○                                       │
│           1     2     3     4                                          │
│       Org   Import Tokens Done                                         │
├──────────────────────────────────────────────────────────────────────┤
│  ╭──────────────────────────────────────────────────────────────╮    │
│  │   [当前 step 表单 / 内容]                                       │    │
│  ╰──────────────────────────────────────────────────────────────╯    │
├──────────────────────────────────────────────────────────────────────┤
│       [← Back]                              [Continue →]              │
└──────────────────────────────────────────────────────────────────────┘
```

| Step | 路径 | 内容 | 复用 |
|---|---|---|---|
| 1 Create Org | `/onboarding/create-org` | org name + slug + admin email + password | **新建**（简单表单，react-hook-form + zod） |
| 2 Import | `/onboarding/import-employees` | 上传 CSV / 粘贴 / 跳过；预览表格可编辑 | **fork-and-trim** firefly `organization/import-preview.tsx` + `image-dropzone.tsx` |
| 3 Tokens | `/onboarding/generate-tokens` | 员工列表 + 一次性 token 表格 + 复制/CSV 下载 + 必勾 confirm | **fork-and-trim** firefly `organization/import-done.tsx`（凭据展示已完整实现） |
| 4 Done | `/onboarding/done` | "Mesh ready" + 接入指南卡片（OpenClaw / Hermes / Cursor）+ Continue | **新建** |

**触发 firefly upgrade-backlog**：
- 不触发——firefly 已实现的 `import-preview.tsx` / `import-done.tsx` 在 firefly-mesh 上下文下完整可用。

**关键不变量**：
- token 一次性显示，刷新即丢失（firefly 已实现）
- "I have saved" checkbox 必勾，防忘记（firefly 已实现）

**4 状态**：
- Loading → step 骨架
- Empty → 不会出现
- Normal → 表单
- Error → 内联红字 / 顶部 banner（如 CSV 解析失败）
- Generating tokens → 骨架表格
- Tokens 已展示 → 表格 + 红 alert "displayed only once" + 必勾 checkbox

---

## 5. 复用决策矩阵（汇总）

| firefly 资源 | firefly-mesh 处理 | 触发 upgrade-backlog |
|---|---|---|
| `app/globals.css` 全套 tokens + keyframes | ✅ 完全复用 | - |
| `components/ui/*` (12 shadcn 基础) | ✅ 完全 fork | - |
| App shell（TopBar + Sidebar） | fork-and-trim（4 nav 项 + multi-tenant org switcher） | - |
| `components/organization/org-chart.tsx` | ✅ fork | - |
| `components/organization/agent-detail-drawer.tsx` | fork-and-trim：3 tab Profile / Agent / Boundary | **B3 P3** |
| `components/organization/node-edit-dialog.tsx` | fork-and-trim | - |
| `components/organization/org-toolbar.tsx` | fork-and-trim | - |
| `components/organization/confirm-dialog.tsx` | ✅ fork | - |
| `components/organization/image-dropzone.tsx` | ✅ fork | - |
| `components/organization/import-preview.tsx` | ✅ fork（onboarding step 2） | - |
| `components/organization/import-done.tsx` | ✅ fork（onboarding step 3） | - |
| `components/organization/save-success-dialog.tsx` | ✅ fork | - |
| `components/organization/prompt-init-dialog.tsx` | ❌ 不用（agent 在客户端） | - |
| `components/organization/skill-init-dialog.tsx` | ❌ 不用（V2） | - |
| `components/messages/lifecycle-capsule.tsx` | 借鉴样式 | - |
| `components/my-agent/*` (7 文件) | ❌ 全不复用（BYO-agent 哲学不同） | - |
| `components/dashboard/*` | ❌ V2 | - |
| `components/skills/*` | ❌ V2 | - |
| `components/audit/*` | 检查后预计**新建**（firefly 仅部分实现） | - |
| `components/settings/*` | fork-and-trim Account / Org / Members；新建 Agent / Tokens / Boundaries | - |
| `components/theater/*` | ❌ firefly 演示模块 | - |
| `components/knowledge/*` | 检查后看（firefly 计划 V0.2 未完整实现）；预计**新建为主，借鉴 schema 字段名**；扩到 3 层 namespace | **B4 P3** firefly 也应对齐升级 |
| `components/skills/*` | 检查后看（firefly hardcoded MVP）；预计**完全新建**（agentskills.io 完整 3 层 registry） | **B5 P3** firefly 也应对齐升级 |
| `components/workflows/*` | ❌ V2 | - |

---

## 6. 视觉规范

继承 firefly DESIGN.md。完整 tokens / 图标 / 字体 / 圆角 / 阴影规则见 §2 + firefly [DESIGN.md](../../../MultiAgent/DESIGN.md)。

补充 firefly-mesh 特有图标速查：

| 用途 | Lucide Icon |
|---|---|
| Inbox | `Inbox` |
| Audit / 时间线 | `History` |
| Token / Key | `Key` |
| Boundary / scope | `ShieldCheck` |
| MCP server | `Plug` |
| Skill (agentskills.io) | `Sparkles` |
| Agent online | `Circle` (filled, accent-green) |
| Agent offline | `Circle` (outline, gray-mid) |

---

## 7. 动效规范

继承 firefly globals.css 已实现的 keyframe：

| 场景 | class | fork? |
|---|---|---|
| Org graph 节点入场（首次加载） | `animate-mesh-in` | ✅ |
| Org graph 保存成功（顶部绿带） | `animate-save-flash` | ✅ |
| Inbox / Audit SSE 新消息 | `animate-message-flash` | ✅ |
| Sidebar 待办 dot | `pulse-orange` | ✅ |

全 honor `@media (prefers-reduced-motion: reduce)`。

---

## 8. 响应式策略

桌面优先（≥ 1280px 完整体验）；笔记本 (1024–1280px) Sidebar icon-only；平板 (768–1024px) Sidebar 折叠汉堡 + Drawer 全屏 take-over；移动 (< 768px) banner "Best on desktop" + 只读浏览。

详见 Step 7。

---

## 9. 数据需求汇总（给 API 设计阶段）

下面列每个页面/状态/动作需要的 API endpoint，供 [autodev-api 阶段](2026-04-28-firefly-mesh-api.md) 直接消费。

### 全局
| 用途 | Endpoint | 类型 |
|---|---|---|
| 当前用户 / org 信息 | `GET /api/me` | REST |
| 切换 org（multi-tenant） | `POST /api/me/switch-org` | REST |
| 全局通知 | SSE `/api/stream?topic=user.{me}` | SSE |
| 登出 | `POST /api/auth/sign-out` | REST |

### Inbox
| 用途 | Endpoint |
|---|---|
| 列 sender pending | `GET /api/a2a/inbox?tab=approve&cursor={c}` |
| 列 receiver pending + review | `GET /api/a2a/inbox?tab=action&cursor={c}` |
| 单条详情 | `GET /api/a2a/{messageId}` |
| sender 批准发送 | `POST /api/a2a/{messageId}/approve` |
| sender 拒绝发送 | `POST /api/a2a/{messageId}/reject` |
| receiver 接受 | `POST /api/a2a/{messageId}/accept` |
| receiver 拒绝 | `POST /api/a2a/{messageId}/reject-receive` |
| 任务审核通过 / 退回 | `POST /api/task/{taskId}/review` |
| SSE | `/api/stream?topic=inbox.{employeeId}` |

### Organization
| 用途 | Endpoint |
|---|---|
| 全部 org graph 数据 | `GET /api/org/graph` |
| 创建/改/删员工 | `POST /api/employee` / `PUT /api/employee/{id}` / `DELETE /api/employee/{id}` |
| 创建/改/删部门 | `POST /api/department` / `PUT /api/department/{id}` / `DELETE` |
| 项目同上 | `/api/project/*` |
| 改 boundary | `PUT /api/boundary/{agentId}` |
| 重生 token | `POST /api/token/regenerate` |

### Audit
| 用途 | Endpoint |
|---|---|
| 列 thread | `GET /api/audit/threads?from=...&to=...&actor=...&type=...&taskId=...&cursor=...` |
| 单 thread 完整 | `GET /api/audit/threads/{threadId}` |
| 导出 CSV | `GET /api/audit/threads/{threadId}/export.csv` |
| SSE | `/api/stream?topic=audit.org.{orgId}` |

### Settings
| 用途 | Endpoint |
|---|---|
| 我的信息 | `GET /api/me` / `PUT /api/me` |
| 我的 agent | `GET /api/me/agent` |
| 改密 | `POST /api/auth/change-password` |
| 删账户 | `DELETE /api/me` |
| 组织 | `GET /api/org` / `PUT /api/org` |
| 员工列表（admin） | `GET /api/employee?orgId=...` |
| token 列表（admin） | `GET /api/token` / `POST /api/token` / `DELETE /api/token/{id}` |
| boundary | `GET /api/boundary?agentId=...` / `PUT /api/boundary/{agentId}` |

### Onboarding
| 用途 | Endpoint |
|---|---|
| 创建 org | `POST /api/org` (用于首次 wizard，含创建 admin user) |
| 导入员工 | `POST /api/employee/import` (multipart CSV) |
| 批量生成 token | `POST /api/token/batch` |
| Wizard 状态 | `GET /api/onboarding/state` (server 记录到哪一步) |

### Knowledge (P12 新增)
| 用途 | Endpoint |
|---|---|
| 列文档（按 scope） | `GET /api/knowledge?scope=company\|dept\|personal&deptId=...&cursor=...` |
| 上传 | `POST /api/knowledge/upload` (multipart) → 异步 chunk + embed pipeline |
| 单文档元数据 + chunks | `GET /api/knowledge/{id}` |
| 改 / 重 index / 删 | `PUT /api/knowledge/{id}` / `POST /api/knowledge/{id}/reindex` / `DELETE` |
| RAG 检索（agent 调）| `GET /api/knowledge/search?q={q}&scope=...` |
| 上传进度 SSE | `/api/stream?topic=knowledge.indexing.{docId}` |

### Skills (P13 新增)
| 用途 | Endpoint |
|---|---|
| 列 skill（按 scope） | `GET /api/skill?scope=...&deptId=...` |
| 单 skill manifest + 冲突 | `GET /api/skill/{id}` |
| 创建 / 改 / 删（按 scope 权限） | `POST /api/skill` / `PUT /api/skill/{id}` / `DELETE` |
| 试运行 | `POST /api/skill/{id}/dry-run` |
| 该员工有效 skill 列表（合并 Company+Dept+Personal） | `GET /api/skill/loaded?employeeId={me}` |
| Skill 推送 SSE（agent 端订阅） | `/api/stream?topic=skill.{employeeId}` |

### 外部 client（skill / MCP 包调，非 web UI）
| 用途 | Endpoint |
|---|---|
| Agent 激活 | `POST /api/agent/activate` (with token) |
| 任务 list / submit / output | `GET /api/task/list` / `POST /api/task/submit` / `POST /api/task/output` |
| A2A send / inbox | `POST /api/a2a/send` / `GET /api/a2a/inbox` |
| KB 检索 | `GET /api/knowledge/search?q={q}&scope=auto` |
| Skill 加载 | `GET /api/skill/loaded?employeeId={me}` |
| Agent card (A2A v1.2) | `GET /.well-known/agent-card.json` |

---

## 10. 阶段交接

下一步：**Step 5 (autodev-api)**——基于本 ui.md "数据需求汇总"（§9），产出 [`2026-04-28-firefly-mesh-api.md`](2026-04-28-firefly-mesh-api.md)：
- 所有 endpoint 的 zod schema
- 错误码目录
- SSE channel 命名约定
- A2A v1.2 agent card 完整 JSON
- 认证 / 授权流（JWT scope enforce 中间件）

按用户指令"go 123 到 4 停下"——本阶段（Step 4 ui）在用户的 batch 范围之外（用户已说 4 停下）。**实际：用户后续追加 "go 4" 同意 Step 4 执行**，故本 ui.md 写完即停，等待用户确认后再走 Step 5 (api)。

---

**UI 完成。**
