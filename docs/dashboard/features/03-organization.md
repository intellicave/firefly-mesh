# Feature 03 — 组织管理

> 本文档**只描述功能**(产品价值 / 用户故事 / UI / 状态 / 交互 / 边界)。
> 数据模型 / 接口 / 实现 / 迁移 见 `_archive/03-tech-draft.md`。

---

## 1. 是什么

组织管理是 Firefly Mesh 的**人员侧大脑**:把"组织的人 + 结构 + 工作"在一处显形,让 agent 的"角色感"和"协作感"有据可依。

为什么重要?Agent 替你做事时,得知道:
- 它代表谁(user → 哪个 employee)
- 这个 employee 隶属哪个 department
- 这个 department 由谁带
- 当前 agent 是哪个 project 的成员、project 还有哪些人
- 它的"汇报关系"决定了消息应该往谁审批、知识边界跟谁走

没有这层结构,agent 就只是"无主之魂";有了,agent 才能在"组织语境"下做出符合预期的事。

**4 个抽象**:
- **Tenant (org)** — 顶层容器。slug 决定子路径 `firefly-mesh.com/app/<slug>`,name 是显示名。
- **Member (user × tenant)** — 平台账号在该 org 的角色:`owner` / `admin` / `member`。一个 user 可加入多个 org,每个 org 各自有 role。
- **Employee** — org 内部的"人员记录"。可能关联 user(已上线),也可能没关联(admin 录入但还没邀请)。带 title、department、reports_to、status。
- **Department** — 部门。可嵌套(V1 单层,但已预留 parent)。有 lead employee。
- **Project** — 工作单元。有 owner、due_date、status、成员、任务列表。

**谁会用**:
- **Owner**:全部读写,含 org 删除。
- **Admin**:全部读写,除 org 删除。
- **Department lead**(employees.role_in_department='lead'):管自己部门的 employees 增改、project 成员调整。
- **Member**:只读;能看到自己 employee 卡片 + 同 org 的 directory + 自己参与的 project。

---

## 2. 用户故事

### 典型场景

| # | 角色 | 故事 |
|---|---|---|
| 1 | New owner | 我刚创建 Acme org,要把 5 个同事拉进来。`/settings/members` → [Invite] → 输入 5 个邮箱 + role,默认 member,Alice 选 admin → Send → 5 封邀请邮件发出 → 同事点链接 `/onboarding/accept?invite=...` → 接受 → 我刷新这里能看到 5 行 "joined just now"。 |
| 2 | Admin | 我想把 7 个工程师都归到 Engineering 部门。`/organization` Departments tab → [+ Department] "Engineering" → 输入 lead = Alice → 切回 Org tree → 拖拽 7 个员工节点到 Engineering 节点下 → tree 自动重排,部门小标着色。 |
| 3 | Admin | 我想看 Q3 Launch 项目进展。Projects tab → 点 "Q3 Launch" → `/organization/projects/q3-launch` → 显示 owner / due / member / task 列表(todo / in-progress / done 三栏看板)。 |
| 4 | Admin | 离职员工 Bob 要立即停用,但我不想删历史。Employees → Bob → 右栏 [Edit] → Status 改 `suspended` → 保存 → 该员工旁出现灰色 "suspended" 徽标,其关联 user 的 session 立即被踢,WS 也下线;但 Bob 历史发的 message 还能在 audit / inbox 里查到名字。 |
| 5 | Admin | 我对组织结构记不清,先大图看看。`/organization` 默认 Tree view(不是表格)→ 中央显示力导向布局的组织图:owner 在顶,部门小色块,员工节点带头像 → 用鼠标滚轮缩放,minimap 右下角导航。 |
| 6 | Department lead | 我是 Sales lead,想加新员工 Charlie。Employees tab → [+ Employee] → 名/邮箱/title/department(锁定为 Sales)→ Save → 弹 toast "Recorded as Invited. Send invite now?" → 一键发邀请邮件。 |
| 7 | Member | 我加入了 Acme,想看看公司组织。`/organization` 显示 tree view,但右上角 [+ Employee][+ Department][+ Project] 全部不出现;员工节点也不能拖动,只能点开看 profile。 |
| 8 | Admin | 我点开 Alice 的节点想细看。Sheet 滑出 3 个 tab:**Profile**(名/邮箱/title/dept/joined)、**Agent**(她绑定的 agent 列表,带 JWT 状态 + [Regenerate token])、**Boundary**(她当前能看到哪些 knowledge folder,矩阵显示)。 |

### 边缘场景

| # | 故事 |
|---|---|
| E1 | 我想上传一张组织架构 .png(从 PPT 导出的方块图)直接生成组织结构。Employees tab → [Import] → 拖图进去 → 弹 dialog 显示识别结果:`Engineering (lead: Alice) ├ Platform ├ Growth`,我勾掉解析错的两行 → [Apply suggestions] → 后台批量建 employees + departments + 关联。失败的行单独标黄,不阻断整体。详见 §5.4。 |
| E2 | 我邀请了 dave@acme.com,但 dave 已经在 Beta org 里。dave 点邀请链接接受 → onboarding 引导他"join existing org"分支 → 接受后切换工作 org → 顶部 user menu 显示 "Switch org ▾",可在两个之间切换。 |
| E3 | 两个 admin 同时把 Bob 拖到不同部门 → 后保存者收到 "Charlie moved Bob to Sales 8s ago. Move to Eng anyway?" → 可选 [Apply mine] / [Discard mine] / [View diff]。 |
| E4 | 我误删了 Engineering 部门。员工的 department 字段被置为 NULL(部门没了但人还在)+ 顶部黄色 banner "Engineering deleted · 12 employees now unassigned · [Undo · 30s left]"。 |

---

## 3. UI 入口与界面

### 路由

- `/organization` — 主入口,默认 Tree view
- `/organization?view=table&tab=employees` — 表格视图,Employees tab
- `/organization?view=table&tab=departments` — 表格,Departments
- `/organization?view=table&tab=projects` — 表格,Projects
- `/organization/projects/:id` — 单项目详情(看板 + 成员 + 任务)
- `/settings/members` — 邀请管理(本 feature 的延伸,人员入口侧)

### 主视图 — Tree view (default)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Organization                            [Tree] [Table]      ⌘K Search…     │
│                                                              [+ Employee ▾] │
├──────────────────────────────────────────────────────────────────────────────┤
│  Filter: [All depts ▾]  [Status: Active ▾]  [Role: All ▾]   12 people · 3 depts│
│                                                                              │
│                          ┌─────────────────────┐                             │
│                          │  Alice K (owner)    │                             │
│                          │  alice@acme.com     │                             │
│                          └──────────┬──────────┘                             │
│                          ┌───────────┼───────────┐                            │
│                  ┌───────┴────┐  ┌───┴─────┐  ┌──┴──────┐                    │
│                  │ 🔧 Eng     │  │💼 Sales │  │⚖ Legal  │                    │
│                  │ Lead: Bob  │  │Lead: Liu│  │Lead: Wu │                    │
│                  └─┬──┬──┬────┘  └───┬─────┘  └─────────┘                    │
│           ┌────────┘  │  └──────┐    │                                       │
│        ┌──┴──┐    ┌───┴──┐  ┌───┴─┐  │                                       │
│        │ Bob │    │Carol │  │David│  │                                       │
│        └─────┘    └──────┘  └─────┘  │                                       │
│                                                                              │
│                                              ┌──── minimap ────┐             │
│                                              │   ▓▓ ▒▒        │             │
│                                              │   ▒  ▓▓ ▒      │             │
│                                              └─────────────────┘             │
└──────────────────────────────────────────────────────────────────────────────┘
```

- 鼠标滚轮缩放(0.3x – 2x),空白处拖拽平移,minimap 右下角辅助。
- 节点带头像 + 名 + role,部门节点带 icon + lead 名。
- 入场时有"mesh-in"动画(节点从中心扩散到位)。
- **Filter bar** 可按 department / status / role 筛,筛掉的节点淡出但保留位置(避免重排迷惑)。
- 顶部右侧 [+ Employee ▾] 是下拉:`+ Employee` / `+ Department` / `+ Project` / `Import org chart...`(组织图上传入口)。
- ⌘K 调出 org-wide search:按 name / email / title / dept,匹配项在图中高亮闪烁。

### Sheet — Employee detail (3 tabs)

```
                    ┌──────────────────────────────────────┐
                    │ ← Alice K                            │
                    │ [Profile] [Agent] [Boundary]         │
                    ├──────────────────────────────────────┤
                    │ Profile                              │
                    │                                      │
                    │ Name      Alice K                    │
                    │ Email     alice@acme.com   (verified)│
                    │ Title     [VP Engineering_________]  │
                    │ Reports   Owner (you)                │
                    │ Dept      [Engineering ▾]            │
                    │ Status    [Active ▾]                 │
                    │ Joined    2026-01-12                 │
                    │                                      │
                    │ [Save changes]   [Remove employee]   │
                    └──────────────────────────────────────┘

Agent tab:
                    │ Agent                                │
                    │                                      │
                    │ ▣ alice-claude-code                  │
                    │   bound 2026-04-12 · last seen 12m   │
                    │   JWT  ••••••••••12ab  [Regenerate]  │
                    │   [Revoke device]                    │
                    │                                      │
                    │ ▣ alice-mcp                          │
                    │   bound 2026-05-01 · never connected │
                    │   [Revoke device]                    │

Boundary tab:
                    │ Boundary (what Alice can see)        │
                    │                                      │
                    │ ▣ Eng access            ◐ recursive  │
                    │   17 folders / 124 docs              │
                    │                                      │
                    │ ▣ Q3 boundary                        │
                    │   3 folders / 22 docs                │
                    │                                      │
                    │ Total visible: 19 folders / 142 docs │
                    │ [View as Alice ↗ ]                   │
```

3 个 tab 各自加载,默认 Profile。Agent tab 上的 [Regenerate] 按钮在确认弹窗后才执行,生效前显示旧 token 的最后 4 位帮人对照。

### Modal — Import org chart

```
        ┌────────────────────────────────────────────────────┐
        │ Import org chart                                   │
        │                                                    │
        │ ┌────────────────────────────────────────────────┐ │
        │ │  📥  Drop org-chart.png / .pdf / .csv          │ │
        │ │      Or paste from Excel  [Paste]              │ │
        │ └────────────────────────────────────────────────┘ │
        │                                                    │
        │ Detected (review before applying)                  │
        │                                                    │
        │ Engineering                                        │
        │   Lead: Alice K (matched alice@acme.com)           │
        │   Members:                                         │
        │     ☑ Bob M (matched bob@acme.com)                 │
        │     ☑ Carol L (new — will be created)              │
        │     ☑ David K (new — will be created)              │
        │                                                    │
        │ Sales                                              │
        │   Lead: Liu (new)                                  │
        │   Members:                                         │
        │     ☑ Eric (new)                                   │
        │     ⚠ Frank (ambiguous: 2 matches in directory)    │
        │       ◯ frank@acme.com  ● frank2@acme.com          │
        │                                                    │
        │ [Cancel]                       [Apply 6 changes]   │
        └────────────────────────────────────────────────────┘
```

每行可单独勾选 / 取消;ambiguous 用 radio 让人选;失败行单独 fallback,不阻断队列。

### Sub-page — `/organization/projects/:id`

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ← Organization · Q3 Launch                                                  │
│  Owner: Alice K  ·  Due: 2026-08-31  ·  Active                              │
│  6 members  ·  18 tasks  ·  72% complete                                     │
│  [Edit project]                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│   Todo (4)            In progress (8)        Done (6)                       │
│  ┌───────────┐      ┌──────────────┐       ┌──────────────┐                  │
│  │ T-12 Pric │      │ T-08 Designs │       │ T-01 Plan ✓  │                  │
│  │ Assign: ? │      │ Assign: Bob  │       │              │                  │
│  │ Due Aug 5 │      │ Due Jul 28   │       └──────────────┘                  │
│  └───────────┘      └──────────────┘                                         │
│  ┌───────────┐      ...                                                      │
│  │ T-14 ...  │                                                               │
│  └───────────┘                                                               │
│  [+ Task]                                                                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

V1 看板支持基础拖拽改 status;Due 过期的卡片红边;无 assignee 的卡片显示 "?"。

### Members 页 — `/settings/members`

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Team members                                  [+ Invite]                    │
├──────────────────────────────────────────────────────────────────────────────┤
│ Active                                                                       │
│   🖼 Alice K       Owner   Joined 2026-01-12  Last active just now           │
│   🖼 Bob M         Admin   Joined 2026-02-03  Last active 2h ago             │
│   🖼 Carol L       Member  Joined 2026-04-22  Last active yesterday          │
│                                                                              │
│ Pending invitations                                                          │
│   dave@acme.com   Member  expires 2026-05-15  [Copy link] [Resend] [Revoke] │
│   eric@acme.com   Admin   expires 2026-05-13  [Copy link] [Resend] [Revoke] │
│                                                                              │
│ Past members (last 90 days)                                                  │
│   🖼 Frank Y      Member  Suspended 2026-04-30  [Reinstate]                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 状态机

| 状态 | 触发 | UI |
|---|---|---|
| **Loading initial** | 进 `/organization` | tree 区中央 spinner,filter bar 灰显 |
| **Empty (新 tenant)** | 没 employee 没 department | 大空态卡 "Build your org" + 3 按钮 [+ Employee] [+ Department] [Import chart] |
| **Ready (tree)** | 数据就绪 | tree 渲染,mesh-in 入场动画 0.4s |
| **Ready (table)** | 切到 table | 三 tab 表格 |
| **Filtering** | 改 filter bar | 节点淡出/淡入 0.2s,人数实时更新 |
| **Searching (⌘K)** | 输入 query | 命中节点闪烁;非命中淡到 30% 透明度 |
| **Selecting employee** | 点节点 | Sheet 右滑入(380ms),tree 中该节点高亮 |
| **Editing** | 在 Sheet 改字段 | 字段下方"Unsaved changes" 灰条;[Save] 高亮 |
| **Saving** | 点 Save | 按钮 spinner;成功后 toast "Saved" + Sheet 内绿色 flash 1s |
| **Concurrent edit** | 别人改了 | 顶部黄色 banner "Charlie edited 12s ago · [View diff]" |
| **Dragging in tree** | 拖动节点 | 半透明缩略图跟随;有效落点高亮绿色,无效红色 |
| **Drop pending confirm** | 拖到部门上(跨部门) | 弹 confirm "Move Bob from Eng to Sales?" 防误操作 |
| **Importing chart** | 上传文件 | Modal 内 spinner "Detecting structure…"(2-5s)→ 显示识别结果 |
| **Apply changes** | Modal 内 Apply | progress bar "Applied 4/6 changes…" → 完成后绿色 toast + 关闭 modal + tree 重渲染 |
| **Suspending employee** | Status 改 suspended + Save | 节点变灰,关联 user 立即被踢(WS 收到 `member.suspended` 事件) |
| **Deletion (department)** | Confirm | 顶部黄色 sticky toast "Engineering deleted · 12 employees unassigned · [Undo · 30s]" |
| **Deletion (employee, hard)** | Force delete confirm "Type name to confirm" | 节点淡出,从 tree 移除 |
| **Permission denied (member)** | member 试图 [+ Employee] | 按钮根本不渲染(UI 层隐藏);不是 disable |
| **Invitation sent** | Members 页 Send | Pending 列表追加该行,绿色 "Just sent" 标签 2s 后淡 |
| **Invitation revoked** | Revoke | Pending 行红色淡出,toast "Invitation revoked" |
| **Project board loading** | 进 `/projects/:id` | 三列骨架(每列 3 卡片) |
| **Drag task between columns** | 拖卡片 | 半透明跟随,目标列绿色高亮 → 落下 → 立即更新 status |
| **Task editing** | 双击卡片 | inline 改 title;`Esc` 取消,`↵` 保存 |
| **Network offline** | 任何操作时 | 右下 sticky toast,操作排队,重连后自动 push |

---

## 5. 杀手锏功能 ⭐

### 5.1 组织树状图(力导向 + minimap)

不是表格,不是树形列表,是**真实的力导向 graph**:节点 = 员工 / 部门,连线 = 汇报 / 隶属关系,布局自动平衡。
为什么重要:**人记结构靠空间,不靠表格**。看到 Alice 节点在上、Engineering 在下、3 名工程师挂在 Engineering 上,你大脑用 0.5 秒理解;同样信息在 Excel 表格里要 30 秒。
能力:
- 鼠标滚轮缩放、空白处拖拽平移
- minimap 右下角导航,大组织(>50 人)也不迷路
- mesh-in 入场动画:节点从中心扩散到位,有种"组织在长成"的视觉
- ⌘K 搜索:命中节点闪烁,非命中淡到 30% 透明
- filter:按 department / status / role 筛,被筛掉的淡出但保留位置(防止重排迷惑)
- 拖拽节点改隶属:把 Bob 从 Eng 拖到 Sales → confirm dialog → 立即生效 + audit log

### 5.2 上传组织图直接结构化(上传即组织)

用户的痛点:从老系统 / 启动文档 / PPT 把组织信息搬进来,手输 50 个员工 + 部门 + 关系太慢。
新动作:**[Import org chart]** 接受 3 种输入:
- `.png` / `.jpg` 组织架构图截图 — 系统识别方块 + 连线 → 抽出"谁带谁,谁汇报给谁"的层级
- `.csv` / Excel 粘贴 — 自动识别 name/email/title/dept 列
- `.pdf` (员工花名册 / HR 报告)— 抽表格
关键设计:**永远先 review,再 apply**。识别结果在 Modal 中按层级展开,每行可勾选/反选,ambiguous 用 radio 让人挑,匹配已有员工的自动 link(避免重复创建)。
失败行(图片识别错、ambiguous 太多)单独保留,允许部分 apply、剩下手输。

### 5.3 Employee 3-tab drawer(Profile / Agent / Boundary)

点员工节点,Sheet 右滑入,3 个 tab 把"这个人的全部数字身份"一站可见:
- **Profile** — 基础信息 + status
- **Agent** — 这个员工绑定的所有 agent 设备列表,带 JWT 状态、最后活跃、[Regenerate token]([Revoke])。**一站式撤销离职员工的所有 agent**,不用再去 `/settings/devices` 找。
- **Boundary** — 矩阵图:这个员工继承哪些 boundary、能看到几个 folder / 几个 doc、含 [View as Alice ↗] 按钮(以 Alice 视角打开 `/knowledge`,看她实际看到什么)

后两个 tab 是**反向视图**:从"权限规则"切到"具体人能看到什么",合规审查的杀手锏。

### 5.4 Department lead 角色(分布式管理)

不是只有 owner/admin 能管。**Department lead** 是新中间角色:
- 在 `employees` 表里靠 `role_in_department='lead'` 标记
- 自动获得"管理本部门员工 + 调整本部门 project 成员"的能力
- UI 上,lead 看到的按钮一样齐全,但隐藏"删除部门"、"改部门名"等部门级动作
落地价值:Owner 不用为每个新员工亲自下场,把"运营自治权"下放给部门 lead,这是 SaaS 团队规模化的关键。

### 5.5 Project Kanban(顺手做项目管理)

很多团队为了管 agent 协作另开 Trello / Linear,信息散。
V1 我们直接在 `/organization/projects/:id` 给一个**轻量 Kanban**:三列(Todo / In progress / Done)+ 拖拽改 status + 卡片含 assignee / due。
不与 Linear 竞争,但解决"agent 触发了一个任务,我得记一下"的就近场景 — agent 发消息时可一键 "Create task from this message",任务自动落到对应 project,assignee 自动选当前 user。

---

## 6. 交互细节

- **键盘**:
  - `⌘K` org-wide search(name/email/title/dept)
  - `T` 切换 Tree / Table 视图
  - `↑/↓/←/→` 在 tree 中按方位移动焦点节点(可访问性)
  - `↵` 打开 Sheet,`Esc` 关闭
  - Tree 节点上 `E` 直接进入编辑,`Del` 删除(带 confirm)
- **拖拽**:
  - 员工节点拖到部门 → 改 department(confirm)
  - 部门节点拖到部门 → 嵌套(V1 一层上限,超限提示 "Nesting limit reached")
  - 文件拖到任何位置 → 自动触发 Import org chart Modal
  - Kanban 卡片拖列 → 改 status,无 confirm(轻量动作)
- **内联编辑**:
  - 节点 double-click 直接改名(不进 Sheet)
  - Sheet 内字段失焦自动 save(不需点 Save)— 但带敏感字段(role / status / department)的需要 [Save changes] 显式
- **视觉反馈**:
  - 节点变化时,所在 tree 路径自动滚动到中心 + 短暂高亮 1s
  - 部门按 8 色循环分配 accent 色,员工节点自动继承所属部门色
  - status=suspended 的员工灰显 + 加锁 icon
  - "Last seen" 数据:刚刚 (绿点) / 今天 (黄) / 7d+ (灰)
- **撤销**:
  - 删除部门 / 项目 / 员工 → 顶部 sticky toast "[Undo · 30s]"(软删时间窗)
  - 撤回邀请 → 立即生效,toast 中"[Undo]" 在窗口内可恢复
- **复制**:
  - 任何邀请链接旁 [Copy link] 一键(不用强迫别人查邮件)
  - 员工节点右键 → Copy email / Copy profile link / Open in `/knowledge` (filtered by them)

---

## 7. 边界与异常路径

- **跨 tenant**:URL 改 `tenantId` 拉别人的 org → 一律 "Not found or no access"
- **Member 隐藏管理动作**:[+ Employee]、[+ Department]、[+ Project]、Sheet 内 [Save]/[Remove] 按钮整体不渲染(不是 disable)。让 UI 看起来"就是不能"
- **Department lead 看到自己部门级动作**,但不出现部门删除入口
- **离职员工的旧消息**:employees.status=suspended,但 messages / audit 历史里他的 name 仍可查(employees 行不硬删 → user_id 置 NULL 也保留)
- **删除部门**:有员工的部门删除 → 员工 department_id 置 NULL,顶部黄 banner "12 unassigned · [Undo]"。30s 后真正落地,期间可撤销
- **删除项目**:项目带 tasks → confirm "This will delete 18 tasks. Type 'Q3 Launch' to confirm."
- **删除员工 (hard)**:有关联 agent → 拒绝 "Revoke 3 devices first.";关联到 user → 只是把 employees.user_id 置 NULL(不动 user 账号)
- **导入冲突**:org chart 导入时 detect 到的 email 已有 employee → 自动 link 而非新建。ambiguous 时 radio 让人选
- **并发编辑同员工**:后保存者看 "Charlie edited Bob's department 8s ago. View diff?"
- **跨部门拖拽 confirm**:严肃动作(改隶属)弹 confirm;轻动作(改 task status)无 confirm
- **节点过多的 tree**(>200 员工)→ 默认折叠到部门级,点部门才展开员工;mesh-in 动画跳过
- **图片识别精度低**:Modal 中显示 confidence,< 60% 行用黄色标 "Low confidence",default 不勾选
- **批量 apply 失败行**:不阻断队列,失败的单独留在 Modal 里供 retry / manual 输入

---

## 8. 开放问题

- **部门嵌套深度**:V1 限 1 层(部门下不能再分子部门),避免过早复杂化。**决策**:大组织有需要时,再放开到 3 层上限。
- **Member 能否看到 directory(所有同事的 profile)?** **决策**:V1 默认是 — 透明文化;不愿透明的 org 可在 Settings 加 toggle "Hide directory from members"(V1 留位)。
- **Reports-to 关系是单链(Org chart)还是 DAG(矩阵管理)?** V1 单链(每人最多 1 个直接 manager);矩阵管理只在 project_members 里表达。简化心智。
- **图片识别失败率**:V1 估 30% 高识别错率(尤其手画 / 中英文混排)。**决策**:不阻断,允许部分 apply + manual 录入;长远要做"识别 review 反馈"反哺模型。
- **谁能看到员工的 Boundary tab?** owner/admin 全看;department lead 只看本部门成员的;member 只看自己的。
- **Suspended vs Removed**:V1 提供两种 — Suspended 保留所有数据只是禁用登录(可 Reinstate),Removed = employees 行删除(user_id 那一行不动,只切断关联)。
- **Project tasks 的复杂度**:V1 Kanban 是"够用即可"。和 Linear / Jira 不重叠的定位是"agent-triggered tasks"。若用户要更专业的 PM,V1 不挡:他可以把 task 当 lightweight reference,主力还用 Linear。
- **Audit 入口**:这页所有写操作都该在 audit log 留痕(P0 验证)。但 UI 上要不要"显眼的最近活动 feed"? **决策**:不需要,Audit 已经有自己的 page。这里保持安静。
- **OnLeave 状态**:V1 只有 active/invited/suspended 三态。"休假中"算 V1.5 加,不阻塞。
