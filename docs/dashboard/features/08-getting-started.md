# Feature 08 — 快速入门 (4-step Onboarding)

> 本文档**只描述功能**。数据 / 接口 / 实现 / 迁移见 `_archive/08-tech-draft.md`。

---

## 1. 是什么

快速入门是 Firefly Mesh 的**首次接触体验** — 新用户第一次进 dashboard 时,引导完成 4 件事:
1. **创建组织** 或 **加入已有组织**(通过邀请)
2. **导入数据**(可选,V1 仅 CSV 兜底,主连接器 Coming soon)
3. **配对第一个 agent**(运行 CLI,完成 device pairing)
4. **完成** → 跳转 inbox

**为什么是独立 feature**:它**横跨多个其他 feature**(账户 + 组织 + 设备),但必须**连贯地一次执行完**——形成"剧情" 而不是"散点功能"。
新用户的前 5 分钟决定他对产品的第一印象;onboarding 是**唯一的一次机会**让他理解"这个产品要解决什么、我能拿到什么、我下一步做什么"。

**核心原则**:
- **每一步都可中断 + 可恢复**:关浏览器后再登录,自动跳回上次未完成的 step。
- **可跳过(skip)是 first-class**:不强制配 agent、不强制 import — 跳过也算"完成"。
- **没有未完成的视觉负债**:完成 onboarding 后,4-step UI **永远不会再出现**(再访问 `/onboarding` 被重定向 `/inbox`)。
- **诚实**:连接器还没做就显示 "Coming soon" 灰态,不假装可用。

**谁会用**:新用户。已完成 onboarding 的 user 不会再看到。

---

## 2. 用户故事

### 典型场景

| # | 角色 | 故事 |
|---|---|---|
| 1 | New user fresh signup | 注册完跳 `/onboarding/create-org`。进度条显示 ● 1 ─ 2 ─ 3 ─ 4 → 我选"Create a team",输 "Acme Inc" → URL preview "firefly-mesh.com/app/acme-inc" 自动渲染 → Continue → 跳 step 2。3 秒后我已经站在第 2 步上,体感"流畅"。 |
| 2 | Invited user | 我收到 dave@acme.com 邀请邮件 → 点链接 `app.firefly-mesh.com/onboarding/accept?invite=tok_abc` → 我先登录(若没账号则跳 signup → 完成后回来)→ 看到 "You've been invited to Acme Inc by Alice K · [Accept] / [Decline]" → Accept → **直接跳 inbox**,完全不走 4-step(因为我已经"接入了一个 org",不需要新建组织)。 |
| 3 | Power user with multiple orgs | 我已经在 Beta Inc 工作,Alice 又邀请我加 Acme Inc。我接受邀请后跳 inbox → 顶部 user menu 多了 "Switch org ▾" → 切到 Acme → 我看到的是 Acme 的 inbox,onboarding 不会再触发(我已经有 tenant 了)。 |
| 4 | Cautious explorer | 我在 step 2 import 看到三个 connector "Notion / Slack / Linear" 都灰显 "Coming soon" → 我点 Skip → 进 step 3。step 3 我也想"先看看再说",点 Skip → 进 step 4 done → 跳 inbox。我啥也没做但产品**完整可用**(只是 inbox 空)。 |
| 5 | Engineer who hates onboarding | 我点 Skip / Skip / Skip 三连 → 跳 inbox。但**那个进度条 4/4 也没显示完成**(只显示 ✓ ✓ ✓ 的中间 step,paired_agent 未做)。我后来在 `/settings/devices` 配了第一个 agent → onboarding_state 的 paired_agent 自动置 1 → completed 自动派生为 true。我**永远不会被强迫**再走 onboarding 页。 |
| 6 | First-time pairing in onboarding | step 3 我选 Claude Code runtime → [Copy] 命令 → 终端粘贴跑 → 浏览器侧:在 step 3 页面下方 "Waiting for first device…" 旋转 spinner → 3 秒后 spinner 变 ✓ + "alice-claude-laptop connected"(WS 实时推送)→ [Continue] 按钮自动从灰显变激活 → 我点 Continue → step 4 → done → inbox。**整个流程 30 秒内完成**。 |
| 7 | Interrupted mid-flow | 我刚做完 step 1(创建 Acme),然后被同事打断,关掉浏览器。1 小时后回来,登录 → middleware 检测 `created_org=1, imported=0, paired_agent=0, completed=0` → 自动跳 `/onboarding/import`(下一未完成 step)→ 我接着做。 |
| 8 | Slug typo regret | step 1 我把团队名打成 "Akme",创建后 URL 是 `/app/akme`。我后悔 → 没问题:onboarding 后到 `/settings` (team settings tab) 可以改 slug + display name。step 1 不是"final commitment"。 |

### 边缘场景

| # | 故事 |
|---|---|
| E1 | step 1 slug 撞车(同名 tenant 已存在)→ 输入框下红字"Name taken, try another" 实时校验(每输入后 400ms debounce 调后端) |
| E2 | 邀请已过期 → `/onboarding/accept?invite=...` 显示"This invitation has expired · Ask <inviter> to resend." |
| E3 | 邀请已使用 → "This invitation has already been used." + [Go to inbox] / [Sign in as different user] |
| E4 | 邀请非法(token 不存在)→ "Invalid invitation." + 简单错误页 |
| E5 | step 1 创建失败(网络 / 后端)→ 红 banner,form 数据保留,Continue 可重试 |
| E6 | step 3 我跑了命令但 CLI 出错了 → 浏览器侧依然 spinner;5 分钟后 code 过期 → 顶部柔和提示 "Pair code expired · Restart pairing or [Skip for now]" |
| E7 | 我同时打开两个 dashboard tab,在 tab A 走 onboarding,在 tab B 已经完成 → tab A 的 step 2 刷新时 middleware 检测 completed=true → 直接跳 inbox + toast "Onboarding completed in another tab" |

---

## 3. UI 入口与界面

### 路由

- `/onboarding` — 起点(= `/onboarding/create-org`)
- `/onboarding/create-org` — Step 1
- `/onboarding/import` — Step 2
- `/onboarding/tokens` — Step 3
- `/onboarding/done` — Step 4
- `/onboarding/accept?invite=<token>` — 邀请接受的特殊入口(不走 4-step)

### 通用 layout (4-step 共用)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Firefly Mesh                              ● 1 ─ ○ 2 ─ ○ 3 ─ ○ 4             │
│                                            Create org                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                       (step-specific content)                                │
│                                                                              │
│                                                                              │
│                                                                              │
│                      [← Back]              [Continue ▸]                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

- 顶部进度条:**4 个圆点** + 当前 step 高亮(填充),已完成的填 ✓,未到的灰圈。下方显示当前 step 名称(辅助文本)。
- 默认 max-width 居中(420px),桌面 + 移动同一布局。
- 底部 [Back] [Continue] 按钮固定;左下角小字 "Need help? · [Skip onboarding ↗](contact)"。

### Step 1 — `/onboarding/create-org`

```
   ┌──────────────────────────────────────────┐
   │  Get started                             │
   │  Create a new team or join an existing  │
   │                                          │
   │  [ Create a team ]  [ Join a team ]    │
   │   ↑ tab selector                         │
   │                                          │
   │  ─── Create a team ───                  │
   │  Team name                               │
   │  [_______________________________]       │
   │  URL: firefly-mesh.com/app/<slug>        │
   │                                          │
   │                                          │
   │  [ Continue ▸ ]                          │
   └──────────────────────────────────────────┘

「Join a team」分支:
   ┌──────────────────────────────────────────┐
   │  [ Create a team ]  ●[ Join a team ]    │
   │                                          │
   │  Invite link or code                     │
   │  [______________________________________]│
   │  Paste the link from your invitation email│
   │                                          │
   │                                          │
   │  [ Join team ▸ ]                         │
   └──────────────────────────────────────────┘
```

- 默认显示 Create 分支(80% 用户的路径);Join 分支次要
- Team name 输入实时显示 URL preview,debounce 校验 slug 可用性

### Step 2 — `/onboarding/import` (optional)

```
   ┌──────────────────────────────────────────┐
   │  Import your data (optional)             │
   │  Bring your existing tools into Firefly  │
   │                                          │
   │  Connect existing tools                  │
   │  ┌──────────────────────────────────┐    │
   │  │ 📓 Notion          [Coming soon] │    │
   │  └──────────────────────────────────┘    │
   │  ┌──────────────────────────────────┐    │
   │  │ 💬 Slack           [Coming soon] │    │
   │  └──────────────────────────────────┘    │
   │  ┌──────────────────────────────────┐    │
   │  │ 📋 Linear          [Coming soon] │    │
   │  └──────────────────────────────────┘    │
   │                                          │
   │  ─── or ───                              │
   │                                          │
   │  Upload CSV                              │
   │  [ Choose file ]                         │
   │  Employees / Departments / Projects      │
   │                                          │
   │  [ ← Back ]            [ Skip ▸ ]   ✗    │
   │                                          │
   │  After choosing file: [ Continue ▸ ]     │
   └──────────────────────────────────────────┘
```

- 三 connector 卡片显示 emoji + name + Coming soon badge(灰显,但不被禁用 click — 点击弹 popover 解释"coming in a future update")
- CSV 上传是兜底入口,可以真上传但 endpoint 返 501(诚实告知)

### Step 3 — `/onboarding/tokens`

```
   ┌──────────────────────────────────────────────┐
   │  Connect your first agent                    │
   │  Your agent will be able to send/receive msgs│
   │                                              │
   │  Pick a runtime:                             │
   │   ◉ OpenClaw / Claude Code                   │
   │   ◯ Claude Desktop / Cursor (MCP)            │
   │   ◯ Anywhere else (HTTP)                     │
   │                                              │
   │  Run this in your terminal:                  │
   │  ┌────────────────────────────────────────┐  │
   │  │  openclaw skill install firefly-mesh  │  │
   │  │                                [Copy] │  │
   │  └────────────────────────────────────────┘  │
   │                                              │
   │  ⏳ Waiting for your first device…           │
   │                                              │
   │  [ ← Back ]            [ Skip ▸ ]   ✗        │
   └──────────────────────────────────────────────┘
```

绑定完成(WS push `agent.bound`)后:

```
   ┌──────────────────────────────────────────────┐
   │  Connect your first agent                    │
   │                                              │
   │  ✅  alice-claude-laptop connected           │
   │      (claude-code · MacBook)                 │
   │                                              │
   │  [ ← Back ]            [ Continue ▸ ]   ●    │
   └──────────────────────────────────────────────┘
```

Continue 按钮自动激活,可选 [Add another device](保持 step 3)或 Continue 进 step 4。

### Step 4 — `/onboarding/done`

```
                          ┌───────────────────────────────┐
                          │                               │
                          │         🎉                    │
                          │                               │
                          │   You're ready                │
                          │                               │
                          │   Your agent has a phone      │
                          │   number. Try sending it      │
                          │   a message.                  │
                          │                               │
                          │   [ Go to inbox ]             │
                          │                               │
                          └───────────────────────────────┘
```

满屏居中,emoji + 标题 + 一句产品诗意 + 单一行动入口。**不啰嗦,不多按钮**。

### `/onboarding/accept?invite=<token>` (邀请 shortcut)

```
                          ┌────────────────────────────────────┐
                          │  You've been invited                │
                          │                                    │
                          │  Alice K invited you to join       │
                          │  Acme Inc as Member.               │
                          │                                    │
                          │  alice@acme.com                    │
                          │  Invited 2 hours ago               │
                          │  Expires in 6 days                 │
                          │                                    │
                          │  [ Accept invitation ]             │
                          │  [ Decline ]                       │
                          └────────────────────────────────────┘
```

接受后:
- 写 onboarding_state.completed=1(若是 user 第一个 tenant)
- 直接跳 `/inbox`,**不走 4-step**

---

## 4. 状态机

| 状态 | 触发 | UI |
|---|---|---|
| **Loading initial** | 进任意 onboarding 页 | 顶部进度条加载 + 主区 spinner |
| **Step 1 default** | 默认 Create 分支 | Create form 可填 |
| **Step 1 slug 校验中** | 输 team name | input 右侧小 spinner |
| **Step 1 slug 可用** | 后端 OK | input 右侧 ✓ 绿 + URL preview 黑色 |
| **Step 1 slug 占用** | 后端 409 | input 红框 + "Name taken, try another" |
| **Step 1 submitting** | 点 Continue | 按钮 spinner "Creating…" |
| **Step 1 创建成功** | 后端 201 | router push `/onboarding/import` |
| **Step 1 join submitting** | 点 Join team | 按钮 spinner "Joining…" |
| **Step 1 invite expired/used/invalid** | 后端报错 | input 红框 + 具体文案 |
| **Step 2 default** | 进 import 页 | 3 connector 灰卡片 + CSV 上传区 |
| **Step 2 connector click** | 点 Notion/Slack/Linear | popover "Coming soon · For now, use [Skip] to continue" |
| **Step 2 CSV file selected** | 选文件 | 显示文件名 + "Continue" 按钮激活 |
| **Step 2 CSV upload** | 点 Continue 后 | 进度条;后端返 501 → toast "Coming soon. Skipped." → 跳 step 3 |
| **Step 2 skip** | 点 Skip | 写 onboarding_state.skipped_import=1 + 跳 step 3 |
| **Step 3 idle** | 进 tokens 页 | spinner + "Waiting for your first device…" |
| **Step 3 bound** | WS push `agent.bound` | spinner 换 ✓ + 设备名,Continue 激活 |
| **Step 3 skip** | 点 Skip | 写 onboarding_state.skipped_pair=1 + 跳 step 4 |
| **Step 4 done** | 进 done 页 | 满屏 celebrate + Go to inbox |
| **Step 4 → inbox** | 点 Go | 写 onboarding_state.completed=1 + router push `/inbox` |
| **Resume** | middleware 检测 partial state | 自动跳到 next unfinished step |
| **Already completed accessing onboarding** | completed=1 user 访问 `/onboarding/*` | 重定向 `/inbox` + toast "Onboarding completed" |
| **Invite valid** | `/onboarding/accept` + valid token | 显示 invite info + Accept 按钮 |
| **Invite expired / used / invalid** | 同上但 token 异常 | 红条 + 简洁错误页 |
| **Accept invite** | 点 Accept | 按钮 spinner → 后端写 member 行 + onboarding_state.completed=1 → 跳 inbox |
| **Concurrent (other tab finished)** | 当前 tab 触发动作时检测 completed=true | toast "Onboarding completed in another tab · Redirecting…" + 跳 inbox |

---

## 5. 杀手锏功能 ⭐

### 5.1 中断 + 恢复(Resume checkpoints)

新用户经常被打断 — 看完 step 1 突然有事关浏览器、被同事拉去开会。
我们的设计:
- 每个 step 完成后**立即**写 onboarding_state 到 server(不是攒到最后才提交)
- 关浏览器后再次登录 → middleware 检测 last unfinished step → 直接跳那里
- 用户体感:**Firefly 记得我**

对比常见竞品做法(整个 wizard 是单页 form,关掉全丢)— 这是巨大体验差距。

### 5.2 Skip 是 first-class(不强制配 agent)

很多产品 onboarding 强制走完所有步骤,理由是"为了保证用户激活"。
我们反着来:**Skip 永远是平等的次要按钮,不灰显、不藏深**。
为什么:
- 强制只能逼用户假装完成("我先随便填个,等会再改")—— 真实激活反而下降
- 跳过 step 3 的用户后续在 `/settings/devices` 自然会配,onboarding 只是引导,不是仪式
- 用户感受到"产品尊重我的节奏"

skip 后,onboarding_state 标 `skipped_pair=1`(不是 `paired_agent=1`)—— 这两者数据上区分,helps 后续 analytics 区分"主动跳过" vs "完成"。

### 5.3 邀请 Shortcut(不走 4-step)

被邀请的用户**不应该被强迫走 onboarding** —— 他已经"接入了一个组织",没必要再创建一个。
`/onboarding/accept?invite=<token>` 是专用入口:
- Accept 后写 `onboarding_state.completed=1` 直接跳 inbox
- 跳过 step 1-4,体验"邀请 → 接受 → 立即开工"的最短路径
- 邀请邮件中的链接默认带这个 path,不是 generic `/signup`

### 5.4 WS 实时反馈 step 3(不是轮询)

step 3 需要"等"agent 第一次绑定。
- 常见做法:每 2-5 秒轮询一次 agent list — 体验是"我已经做完了,UI 还显示 Waiting,我开始焦虑"
- 我们做法:WS 订阅 user-channel `agent.bound` 事件 — 绑定瞬间(<200ms)UI 自动激活
- 用户体感:"我点完终端的命令,几秒后浏览器自己亮了" → 产品像有灵性

技术上和 feature 02 的 `/settings/devices` 共用同一个 WS 监听器(全局 user channel)。

### 5.5 进度可视化(4-dot stepper)

进度条不只是装饰。**4 圆点 + 当前步高亮 + 已完成打 ✓** 三个状态:
- 让用户知道"我在哪、走了多远、还有几步"
- 跳过的步骤也显示 ✓(不区分 done vs skipped — 视觉上等价,数据上区分)
- 进度可点击 backwards("回到 step 1 改个名"),但不可点 forwards(强制顺序)

设计上的拒绝:不显示百分比、不显示时间预估("还剩 2 分钟" 这种容易翻车)。

### 5.6 诚实标 "Coming soon"(connector)

step 2 的 3 个 connector(Notion / Slack / Linear)都标 "Coming soon" 灰显。
为什么:
- 标得清清楚楚,用户不会去尝试连接然后发现连不上
- 比"按钮可点但点了出错"信任值高
- 同时显示我们的 roadmap("这些是我们要做的"),反而是产品深度信号

连接器真正落地时,直接拿掉 "Coming soon" badge 即可,layout 不变。

---

## 6. 交互细节

- **键盘**:
  - `↵` = Continue(默认主按钮)
  - `Esc` = Back(虚拟键盘友好)
  - Step 3 spinner 期间 `Esc` 触发 Skip(快速跳过)
- **Slug 校验**:实时(400ms debounce)+ 显式 ✓ / ✗ 视觉反馈
- **URL preview**:用户输 "My Team" → preview 显示 `firefly-mesh.com/app/my-team`(自动 lowercase + 替换空格)
- **进度条动画**:step 切换时,圆点之间的连线从灰→蓝填充,0.5s 缓动
- **Copy 按钮**(step 3 命令)→ "✓ Copied" 反馈
- **Done page emoji**:🎉 不是必须用 emoji,但**这里是 i18n 文案值的一部分,允许**(不违反 emoji-禁用规则)
- **Back 行为**:回到 step N 时,保留输入(不重置 form)
- **Skip 不需要 confirm**:直接 skip,降低决策疲劳;后悔了去 `/settings/devices` 配
- **Step 3 [Add another device]**:已绑定一个后,可以原地再绑一个(用于"我同时配 laptop + work computer")
- **多 tenant 用户**:user_menu 里有 "Switch org"(详见 03-organization),但 onboarding 期间 user_menu 隐藏(避免 user 切走)
- **响应式**:移动端 4-step layout 100% 宽度,步骤指示器水平占满

---

## 7. 边界与异常路径

- **未登录访问 /onboarding/***:除 `/onboarding/accept` → 重定向 `/login?next=...`
- **已完成访问 /onboarding/***:重定向 `/inbox`(除 `/onboarding/accept` 仍可处理新邀请)
- **Slug 占用**:实时校验 + Save 时再校验一次(防 race condition)
- **Slug 含特殊字符**:input 自动转小写 + replace 空格为 `-`;不允许的字符(`/`、`?`、emoji)在输入时被静默过滤
- **创建 tenant 后立即丢 connection**:onboarding_state.created_org 已写,resume 时直接到 step 2
- **CSV 上传 endpoint 返 501**:UI 显示 toast "Coming soon. Skip for now." + 自动跳 step 3
- **Step 3 配对 5 分钟未完成**:页面无任何变化(因为 spinner 还在转),柔和提示 "Pair code expired · Restart pairing or Skip"
- **Step 3 同时多 device bound**:UI 只显示第一个绑定的 device 名 + "[1 more device]" 折叠;真的需要查全部去 `/settings/devices`
- **Accept invite 但已加入该 tenant**:后端检测,UI "You're already a member of Acme Inc · [Go to inbox]"
- **Accept invite 但 user 邮箱与邀请邮箱不匹配**:后端检测,UI "This invitation is for dave@acme.com · Sign in as that user"
- **网络断开**:任何 step 操作时,顶部 sticky toast "Offline · changes will sync when back" + 按钮灰显
- **2 tab 并发完成**:tab A 触发动作时检测 completed=true → toast + 跳 inbox

---

## 8. 开放问题

- **Connector 哪个先落地**:Notion / Slack / Linear 三选 1?**决策**:看 design partner 反馈;V1 不预判。
- **CSV 真支持时的 schema**:V1 = 501;后续设计 employees/departments/projects 三类 import schema。
- **多 tenant 用户第二次创建 tenant**:不走 4-step? **决策**:不走 — 已经熟悉产品的人创建第二个 tenant 直接进 inbox。
- **OnLeave / placeholder 状态**:V1 没有"暂时挂起 onboarding"概念。**决策**:接受。
- **Step 3 Skip 后的 follow-up 引导**:Skip 用户后续在 `/settings/devices` 看到柔和 banner?**决策**:不;Empty state 三 runtime 卡片已经足够引导。
- **回到 step 1 改 slug**:V1 = Back 不允许跨已完成 step;先在 `/settings/team` 改。
- **Mobile-only edge cases**:onboarding 全程移动端可走通?**决策**:是;响应式设计已经支持,但 step 3 跑终端命令在手机端不现实,提示用户"open this page on your laptop"。
- **Auto-skip 已知用户类型**:CLI 开发者直接 ⌘+Tab 终端 — 能不能 detect 然后默认聚焦 step 3?**决策**:V1 不做。
