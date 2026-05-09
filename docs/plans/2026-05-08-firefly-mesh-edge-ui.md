# firefly-mesh edge — UI/UX 设计

> 基于：[ideation.md](2026-05-08-firefly-mesh-edge-ideation.md) + [design.md](2026-05-08-firefly-mesh-edge-design.md)
> 平台：Web PWA（Astro + React 岛屿，Cloudflare Pages）
> 框架：shadcn/ui (New York) + Tailwind v4 + Lucide React

---

## 1. 信息架构

```
firefly-mesh PWA
│
├── 公共区（未登录）
│   ├── /                    营销首页
│   ├── /login               登录
│   └── /signup              注册
│
├── Onboarding 流程（已登录，首次进入）
│   ├── /onboarding          创建团队 OR 加入团队
│   ├── /invite/:token       邀请接受页
│   └── /connect?code=X      Device Pairing 确认（关键页）
│
└── App 区 /app（已登录 + 已在团队）
    ├── /:tenant/inbox        主页面（高频）
    │   └── /:tenant/threads/:id   Thread 详情（桌面内联 / 移动跳转）
    ├── /:tenant/members      团队成员管理（低频）
    ├── /:tenant/settings     团队设置（低频）
    └── /me/devices           我的设备列表 + 撤销（中频）
```

**导航模式**：
- 桌面（≥ 1024px）：64px icon-only 左侧 sidebar，4 个顶级入口：Inbox / Members / Devices / Settings
- 移动（< 768px）：底部固定 Tab Bar，同 4 个入口

---

## 2. 用户流程

### 流程 1：Carol 创建团队

触发：访问 firefly-mesh.io → 点 "Get Started"

1. 看到 `/signup`，选择 Google / GitHub 或邮箱注册
2. 注册成功 → 自动跳转 `/onboarding`
3. 看到两个大选项卡：[Create a team] [Join a team]，点击 "Create a team"
4. 输入团队名称（单字段），点 [Continue]
5. 跳转 `/app/acme/inbox` — 空收件箱，显示 yellow banner "Invite teammates"
6. 点 [Copy invite link] → 剪贴板得到邀请 URL

完成：Carol 拿到邀请链接
异常：团队名已存在 → inline 错误 "Name taken, try another"

---

### 流程 2：Alice 接受邀请 + Device Pairing

触发：点击邀请链接

1. 看到 `/invite/:token` — 显示 "Join Acme on firefly-mesh"
2. 点 [Accept invite]；若未登录，弹 OAuth 登录弹窗
3. 登录后接受邀请，跳转 `/app/acme/inbox`
4. yellow banner："Connect your AI agent to start" + [Connect OpenClaw] 按钮
5. 点击 → 显示 pairing 指令卡片 + 实时等待状态（轮询 hub）
6. Alice 执行 `openclaw skill install firefly-mesh`，浏览器自动打开 `/connect?code=AB-9X42-K7`
7. 看到确认卡：设备名 + pairing code + 倒计时，点 [Bind device]
8. 1s 后跳回 inbox，banner 消失，连接状态变 "● Connected"

完成：Alice agent 绑定
异常：code 超时（5 min）→ "Code expired. Run the install command again."
异常：用户关闭 `/connect` 页面后再回来 → 倒计时继续，可正常绑定

---

### 流程 3：Bob 收到并处理 A2A 消息

触发：Bob 锁屏弹出 Web Push 通知

1. Bob 点击通知 → 打开 `/app/acme/inbox`
2. 消息卡片排在顶部：发件人 / 类型 badge / summary / 时间 / [Pending] 状态
3. 点击消息卡片 → 进入 thread 详情（桌面内联，移动跳转页面）
4. 看到完整解密 body + collapsible structured data
5. 底部固定 HITL 操作栏：[Accept] [Reject]
6. 点 [Accept] → 按钮 loading 150ms → 变 "✓ Accepted"，badge 更新

完成：Bob 接受任务，Alice agent 收到回调
异常：解密失败 → "Cannot decrypt — key mismatch. Contact Alice to resend."

---

## 3. 页面清单

| 页面 | 路径 | 用途 | 主要入口 |
|------|------|------|---------|
| 营销首页 | `/` | 品牌展示 + 注册转化 | 直接访问 |
| 登录 | `/login` | 用户认证 | 首页 / 邀请链接（未登录） |
| 注册 | `/signup` | 新用户创建账号 | 首页 CTA |
| Onboarding | `/onboarding` | 创建或加入团队 | 注册后自动跳转 |
| 邀请接受 | `/invite/:token` | 接受团队邀请 | 邀请链接 |
| Device Pairing | `/connect?code=X` | skill 绑定账号（关键页）| skill 安装时自动打开 |
| 收件箱 | `/app/:tenant/inbox` | 查看 + 处理 A2A 消息 | 登录后主入口 / 通知点击 |
| Thread 详情 | `/app/:tenant/threads/:id` | 消息全文 + HITL 决策 | Inbox 点击 |
| 成员管理 | `/app/:tenant/members` | 查看成员 / admin 邀请移除 | 侧边栏 |
| 我的设备 | `/me/devices` | 查看 + 撤销 agent 设备 | 侧边栏 |
| 团队设置 | `/app/:tenant/settings` | 团队名/计划/危险区 | 侧边栏 |

---

## 4. 页面详细设计

### 4.1 营销首页 `/`

布局：
- 顶部 header：Logo 左 + [Sign in] [Get Started] 右
- Hero：大标题 + 副标题 + 2 个 CTA 按钮
- Feature grid：3 列（移动 1 列）
- Pricing 简表：Free / Team / Enterprise
- Footer

核心组件：
- Hero 大标题："Your AI agents, talking to each other."
- 副标题："Zero config. E2E encrypted. Push when offline."
- [Get started free]（primary）+ [See how it works]（ghost）
- Feature card × 3：Zero NAT / E2E Encrypted / Push Alerts

数据需求：静态，无 API

---

### 4.2 登录/注册 `/login` `/signup`

布局：居中卡片（max-w-sm），无侧边栏

核心组件：
- Social buttons（主）：[Continue with Google] [Continue with GitHub]
- 分割线 "or"
- 邮箱 + 密码表单（次）
- 切换链接

状态：
- 正常：表单可填写
- 提交中：按钮 loading，表单禁用
- 错误：inline 错误文案（"Invalid email or password"）

数据需求：POST `/api/auth/sign-in` / `sign-up`（Better Auth）

---

### 4.3 Onboarding `/onboarding`

布局：居中卡片，2 步骤

核心组件：
- 步骤 1：两个选项卡（Create / Join），选中态有紫色 ring
- 步骤 2（Create）：Team name 输入框 + [Create] 按钮
- 步骤 2（Join）：Invite link 输入框 + [Join] 按钮

状态：
- 空：两个选项未选
- 已选 + 表单：输入态
- 提交中：loading
- 错误：inline（"Name taken"）

数据需求：
- POST `/api/tenants`（创建团队）
- POST `/api/invitations/:token/accept`（加入）

---

### 4.4 Device Pairing `/connect?code=X`（最关键页面）

布局：居中卡片（max-w-sm），无侧边栏，极简

核心组件：
- 页面标题："Bind your agent"
- Device name 展示（从 code 查询）
- Pairing code 高亮：monospace 大号字，居中
- Team 选择器下拉（仅多团队时显示）
- 倒计时 badge："Expires in 4:23"（每秒更新）
- [Bind device] primary button（full width）

状态：

| 状态 | 展示 |
|------|------|
| 正常 | 确认卡 + 倒计时 |
| 绑定中 | 按钮 loading spinner |
| 绑定成功 | Lucide `CheckCircle` + "Device connected! You can close this tab." |
| code 已过期 | `AlertCircle` + "Code expired. Run `openclaw skill install firefly-mesh` again." |
| 未登录 | 跳转 `/login?redirect=/connect?code=X` |

数据需求：
- GET `/api/agents/pair-status?code=X` → `{ deviceName, expiresAt, tenants[] }`
- POST `/api/agents/pair-confirm` → `{ code, tenantId, deviceName }`

---

### 4.5 收件箱 `/app/:tenant/inbox`

布局：
- 左：64px sidebar（桌面）/ 底部 Tab（移动）
- 主：消息列表（flex-1）
- 右：Thread 详情面板（桌面 ≥ 1280px，380px 固定）

核心组件：
- **Banner（首次，未绑定设备）**：黄色，"Connect your AI agent" + [Connect] 按钮
- **WebSocket 状态 badge**：右上角，`● Connected` / `● Reconnecting...` / `● Offline`
- **消息卡片**（每条）：
  - 发件人头像（initials fallback）+ 名字
  - 类型 badge（颜色区分：Request=紫，Inform=蓝，Commit=绿，Handoff=橙）
  - Summary 文本（1 行截断）
  - 时间戳（相对时间）+ 未读蓝点
  - HITL 状态 badge（Pending=黄，Accepted=绿，Rejected=红）
- 新消息入列：淡入 + 向下推 150ms

状态：

| 状态 | 展示 |
|------|------|
| 加载中 | 3 行消息骨架屏 |
| 空（设备已绑）| Lucide `Inbox` 图标 + "No messages yet. Install the skill to start." |
| 空（设备未绑）| banner 覆盖 |
| 正常 | 消息列表 |
| 网络错误 | 顶部 toast "Failed to load — [Retry]" |

数据需求：
- GET `/api/messages/inbox?after=:lastSeq&tenantId=:id` → `[{ messageId, type, summary, senderName, senderAvatar, timestamp, hitlState, unread }]`
- WebSocket `wss://hub.firefly-mesh.io/ws?tenantId=:id` + JWT

---

### 4.6 Thread 详情 `/app/:tenant/threads/:id`

布局：
- 顶部：返回按钮 + 发件人 + 类型 badge
- 主体：消息全文（prose 排版）
- 结构化数据：collapsible `<details>` 卡片
- 底部固定：HITL 操作栏（hitlState = pending 时显示）

核心组件：
- **消息 body**：解密后全文，prose 样式
- **Structured data**：`<details>` 折叠，展开显示 JSON key-value 表
- **HITL 操作栏**：[Accept]（primary）[Reject]（destructive ghost），带二次确认（Reject 时弹 "Are you sure? This cannot be undone."）
- **状态 banner**（已决策）：如 "You accepted this on May 9, 2026"

状态：

| 状态 | 展示 |
|------|------|
| 加载中 | 正文骨架屏 |
| 正常 | 全文 + 操作栏 |
| 解密失败 | `AlertTriangle` + "Cannot decrypt — key mismatch." |
| 已决策 | 状态 banner，操作栏隐藏 |

数据需求：
- GET `/api/messages/:id` → `{ envelope（解密后）, hitlState, threadId, decidedAt }`
- POST `/api/messages/:id/accept`
- POST `/api/messages/:id/reject`

---

### 4.7 我的设备 `/me/devices`

布局：列表页，每行一个设备卡片

核心组件：
- 设备卡片：设备名 / 绑定时间 / 最后活跃 / 状态 badge（Active=绿/Offline=灰）
- [Revoke] 按钮（每行，destructive，二次确认弹窗）
- [Connect new device] 按钮（触发新的 pairing 流程）

状态：

| 状态 | 展示 |
|------|------|
| 加载中 | 骨架屏 |
| 空 | "No devices connected. [Connect your first device]" |
| 正常 | 设备列表 |

数据需求：
- GET `/api/agents/me` → `[{ agentId, deviceName, boundAt, lastSeenAt, status }]`
- DELETE `/api/agents/:agentId`（撤销）
- POST `/api/agents/pair-init`（新设备配对入口）

---

### 4.8 团队成员 `/app/:tenant/members`

布局：表格页

核心组件：
- 成员表格：头像 / 名字 / 邮箱 / 角色 / 加入时间
- [Invite member] 按钮（admin only）→ 弹窗：单邮箱输入 → 发送邀请邮件
- 每行 [Remove] 按钮（admin only，destructive，二次确认）

数据需求：
- GET `/api/tenants/:id/members` → `[{ userId, name, email, role, joinedAt }]`
- POST `/api/tenants/:id/invite`（发邀请邮件）
- DELETE `/api/tenants/:id/members/:userId`（移除成员）

---

## 5. 视觉规范

### 5.1 色彩系统（shadcn CSS 变量，HSL）

| 角色 | 亮色 HSL | 暗色 HSL | CSS 变量 |
|------|----------|----------|---------|
| 主色（品牌紫） | `258 90% 66%` | `258 80% 72%` | `--primary` |
| 主色 foreground | `0 0% 100%` | `0 0% 100%` | `--primary-foreground` |
| 辅助色 | `200 80% 50%` | `200 70% 55%` | `--accent` |
| 成功 | `142 71% 45%` | `142 71% 50%` | `--success` |
| 警告 | `38 92% 50%` | `38 92% 55%` | `--warning` |
| 错误 | `0 84% 60%` | `0 84% 65%` | `--destructive` |
| 背景 | `0 0% 98%` | `224 14% 8%` | `--background` |
| 卡片 | `0 0% 100%` | `224 14% 12%` | `--card` |
| 边框 | `220 13% 91%` | `220 13% 20%` | `--border` |
| 主文字 | `224 71% 4%` | `210 40% 98%` | `--foreground` |
| 次要文字 | `215 16% 47%` | `215 20% 65%` | `--muted-foreground` |

**消息类型 badge 颜色：**

| 类型 | 颜色（亮色） |
|------|------------|
| Request | `--primary`（紫） |
| Inform | `200 80% 50%`（蓝） |
| Commit | `142 71% 45%`（绿） |
| Handoff | `32 95% 55%`（橙） |
| Escalate | `0 84% 60%`（红） |
| Block | `0 0% 40%`（灰） |

### 5.2 排版

字体：`Inter, system-ui, sans-serif`（via `@fontsource/inter`）

| 层级 | 字号 | 字重 | 用途 |
|------|------|------|------|
| Display | 36px | 700 | 营销首页大标题 |
| H1 | 28px | 700 | 页面标题 |
| H2 | 20px | 600 | 区域标题 |
| H3 | 16px | 600 | 卡片标题 |
| Body | 14px | 400 | 正文、消息内容 |
| Small | 13px | 400 | 辅助文字、时间戳 |
| Caption | 12px | 400 | Badge 文字 |

### 5.3 圆角（shadcn New York 风格）

| 元素 | 圆角 |
|------|------|
| 按钮 | `6px` |
| 卡片/消息行 | `8px` |
| 输入框 | `6px` |
| 弹窗 | `12px` |
| Badge/Tag | `9999px`（药丸） |
| 头像 | `50%`（圆形） |

### 5.4 间距

基础单位：4px。刻度：`4 / 8 / 12 / 16 / 24 / 32 / 48px`

| 场景 | 值 |
|------|----|
| 组件内边距（button/input） | `8px 12px` |
| 消息卡片内边距 | `12px 16px` |
| 消息行间距 | `2px` |
| 区域间距 | `24px` |
| 页面水平边距 | `16px`（移动）/ `24px`（桌面） |
| 信息密度 | 紧凑 |

### 5.5 图标系统

- **图标库：Lucide React**（shadcn 官方配套）
- 风格：线性（stroke）
- 默认尺寸：`16px`（行内）/ `20px`（导航/功能按钮）
- 描边粗细：`strokeWidth={1.75}`（正常态）/ `strokeWidth={1.5}`（空态）
- 颜色：`currentColor`（跟随文字色，自动适配暗色模式）

**禁止使用 emoji 作为 UI 图标**（白名单：i18n JSON 值、代码注释、UGC 内容）

---

## 6. 动效规范

**基调：极简**（效率工具，不用华丽动效）

### 6.1 过渡参数

| 类型 | 时长 | 缓动 | 用途 |
|------|------|------|------|
| hover/focus | 120ms | `ease-out` | 按钮、卡片悬浮 |
| 展开/折叠 | 200ms | `ease-in-out` | details、dropdown |
| 弹窗入场 | 200ms | `ease-out` | Modal、Drawer |
| Toast 入 / 出 | 180ms / 150ms | `ease-out` / `ease-in` | 操作反馈 |
| 页面切换 | 200ms | `ease-in-out` | 路由级淡入淡出 |

所有时长用 CSS 变量定义，不硬编码：
```css
--duration-instant: 120ms;
--duration-standard: 200ms;
--duration-enter: 200ms;
--duration-exit: 150ms;
```

### 6.2 场景方案

| 场景 | 方案 |
|------|------|
| 页面切换 | 淡入淡出 200ms |
| 数据加载 | 骨架屏（无旋转器） |
| 新消息入列（WebSocket 推送） | 淡入 + translateY(8px→0) 150ms |
| 按钮点击 | `scale(0.97)` 100ms |
| HITL Accept | 按钮 → ✓ 对勾动画 → badge 更新 |
| 表单错误 | 输入框 shake 300ms |
| `prefers-reduced-motion` | 所有 transform/animation 禁用，仅保留 opacity |

---

## 7. ASCII 线框图

### 7.1 收件箱（桌面，≥ 1280px）

```
┌────┬────────────────────────────────┬─────────────────────────┐
│    │  Inbox          ● Connected   │  Thread 详情（内联）     │
│ 🔲 │ ─────────────────────────────  │                         │
│    │ ┌────────────────────────────┐ │  Alice → you            │
│ □  │ │ ⚠ Connect your agent  [×] │ │  [Request]  2m ago      │
│    │ └────────────────────────────┘ │  ─────────────────────  │
│ 👥 │                                │  请帮我加个 webhook      │
│    │ ┌────────────────────────────┐ │  通知功能，具体需求见    │
│ ⚙  │ │● Alice Chen  [Request] 2m │ │  attached JSON.         │
│    │ │  请帮我加个... [Pending]   │ │                         │
│    │ └────────────────────────────┘ │  ▶ structured data      │
│    │ ┌────────────────────────────┐ │  ─────────────────────  │
│    │ │  Bob Wang  [Inform]    1h  │ │  [Accept]  [Reject]     │
│    │ │  部署完成  [Accepted]       │ │                         │
│    │ └────────────────────────────┘ │                         │
└────┴────────────────────────────────┴─────────────────────────┘
64px   flex-1                            380px
```

### 7.2 Device Pairing（移动优先）

```
┌────────────────────────┐
│                        │
│    firefly-mesh        │
│                        │
│  ┌──────────────────┐  │
│  │  Bind your agent │  │
│  │                  │  │
│  │  Device          │  │
│  │  Alice's MacBook │  │
│  │                  │  │
│  │  Pairing code    │  │
│  │  ┌────────────┐  │  │
│  │  │ AB-9X42-K7 │  │  │
│  │  └────────────┘  │  │
│  │                  │  │
│  │  Team  [Acme ▾]  │  │
│  │                  │  │
│  │  Expires in 4:23 │  │
│  │                  │  │
│  │ [ Bind device  ] │  │
│  └──────────────────┘  │
│                        │
└────────────────────────┘
```

### 7.3 Onboarding（新用户）

```
┌────────────────────────┐
│   firefly-mesh         │
│  ─────────────────     │
│  Welcome! Let's set up │
│                        │
│  ┌──────┐  ┌────────┐  │
│  │Create│  │ Join a │  │
│  │  a   │  │  team  │  │
│  │ team │  │        │  │
│  └──────┘  └────────┘  │
│   (selected: purple)   │
│                        │
│  Team name             │
│  [ Acme             ]  │
│                        │
│  [     Continue     ]  │
└────────────────────────┘
```

### 7.4 营销首页 Hero（桌面）

```
┌──────────────────────────────────────┐
│ firefly-mesh      [Sign in][Get →]   │
├──────────────────────────────────────┤
│                                      │
│  Your AI agents,                     │
│  talking to each other.              │
│                                      │
│  Zero config. E2E encrypted.         │
│  Push when offline.                  │
│                                      │
│  [Get started free] [See how it →]   │
│                                      │
│  ┌──────────┐┌──────────┐┌────────┐  │
│  │ Zero NAT ││Encrypted ││  Push  │  │
│  │  config  ││ end-to-  ││ alerts │  │
│  └──────────┘└──────────┘└────────┘  │
└──────────────────────────────────────┘
```

---

## 8. 响应式策略

| 区域 | 移动（< 768px） | 桌面（≥ 1024px） |
|------|----------------|----------------|
| 导航 | 底部 Tab Bar（4 icon）| 左侧 64px icon sidebar |
| Inbox + Thread | 分页：列表 → 详情跳转 | 左右分栏，内联 |
| Feature grid | 1 列 | 3 列 |
| Pairing 页 | 全屏居中卡片 | max-w-sm 居中 |
| Onboarding | 选项上下排 | 选项左右排 |

**导航细节：**
- 侧边栏（桌面）：hover 展开文字标签（tooltip 或 mini-label）
- Tab Bar（移动）：选中 tab icon 填充为 `--primary` 色
- 两端导航不显示文字，仅 icon（空间紧凑）

**交互差异：**
- 桌面：消息行 hover 显示 quick-action（[Accept] [Reject] inline）
- 移动：消息行左滑展开 quick-action（swipe gesture）

---

## 9. 数据需求汇总（API 设计阶段直接输入）

| 页面 | 操作 | endpoint（待 api.md 确认） | 数据字段 |
|------|------|--------------------------|---------|
| 登录/注册 | POST | `/api/auth/sign-in` `/sign-up` | email, password |
| Onboarding | POST | `/api/tenants` | name |
| Onboarding（加入） | POST | `/api/invitations/:token/accept` | token |
| Device Pairing（查询） | GET | `/api/agents/pair-status?code=X` | code → `{ deviceName, expiresAt, tenants[] }` |
| Device Pairing（确认） | POST | `/api/agents/pair-confirm` | `{ code, tenantId, deviceName }` |
| Inbox | GET | `/api/messages/inbox` | `?tenantId&after=lastSeq` → 消息列表 |
| Inbox | WS | `wss://hub/ws` | JWT auth → deliver/ack 帧 |
| Thread 详情 | GET | `/api/messages/:id` | → `{ envelope, hitlState, decidedAt }` |
| HITL Accept | POST | `/api/messages/:id/accept` | — |
| HITL Reject | POST | `/api/messages/:id/reject` | — |
| My Devices | GET | `/api/agents/me` | → `[{ agentId, deviceName, boundAt, lastSeenAt, status }]` |
| Revoke Device | DELETE | `/api/agents/:agentId` | — |
| New Device（入口） | POST | `/api/agents/pair-init` | → `{ code, verifyUrl, expiresIn }` |
| Members | GET | `/api/tenants/:id/members` | → `[{ userId, name, email, role, joinedAt }]` |
| Invite | POST | `/api/tenants/:id/invite` | `{ email }` |
| Remove Member | DELETE | `/api/tenants/:id/members/:userId` | — |
| Push subscribe | POST | `/api/push/subscribe` | `{ subscription }` |
