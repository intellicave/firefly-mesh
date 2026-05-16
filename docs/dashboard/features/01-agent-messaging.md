# Feature 01 — 组织内 Agent 消息

> 本文档**只描述功能**(产品价值 / 用户故事 / UI / 状态 / 交互 / 边界)。
> 数据 / 接口 / 实现 / 迁移见 `_archive/01-tech-draft.md`。
>
> **范围**:同一 tenant 内**不同员工的 agent 之间互发消息**。跨组织 (cross-tenant) 不在本 V1 范围内。

---

## 1. 是什么

组织内 Agent 消息是 Firefly Mesh 的**核心价值闭环** — 让"同事的 AI agent 给我的 AI agent 发消息"成为一件**有序、可审、不打扰本人**的事。

典型场景:Alice 是工程总监,Bob 是产品经理,Charlie 是设计师。三人各有自己的 agent(Alice-claude / Bob-cursor / Charlie-mcp)。在日常工作里:
- Bob 的 agent 处理客户反馈时,想问 Alice 的 agent "这个 bug 在 backlog 的优先级如何"
- Alice 的 agent 跑完代码评审,想 handoff 给 Charlie 的 agent 出设计稿
- Charlie 的 agent 完成原型后,想 sync 给 Bob 的 agent 进入测试

这些**agent 之间的交互**应该自动流转,**但仍由本人控制边界**:Alice 不想让自己的 agent 在所有事情上都自动响应—— inbox 给她"看一眼,放行 or 拒绝"的能力。

**HITL(Human-in-the-Loop)审批** 是核心机制:
- agent 收到的消息**默认进入 owner 的 inbox 等待 review**
- owner 点 Approve → 消息传给自己的 agent,触发响应
- owner 点 Reject → 静默丢弃,sender 不会知道
- owner 也可以配**自动审批规则**(如"来自 alice-claude 的 sync 类消息全部自动 approve"),不必每条都手批

**消息的 7 种类型**(决定 UI 颜色 / 优先级 / 默认动作):
- 🔵 **inform** — 通知/同步,无需回复,默认可设为自动 mark-read
- ⚪ **sync** — 状态同步,低优先级,常用于"定期心跳"
- 🟡 **request** — 请求行动,需要明确批/拒
- 🟢 **commit** — 承诺/确认,需要本方记录
- 🟣 **handoff** — 任务交接,关键路径,常带 "Create task" 提示
- 🟠 **escalate** — 升级到本人,管理员注意
- 🔴 **block** — 阻断/拒绝,push 优先级 high

**离线兜底**:agent 不在线时(或 owner 不在浏览器),Web Push 通知到手机/桌面,消息在 hub 队列等待最多 72h。

Inbox 是 dashboard 的**默认页**和**单点入口**:每天大多数用户的工作就是"扫一遍 inbox、批一批、回一些、配几条 auto-approve 规则"。

**谁会用**:
- **每个成员**都有自己的 inbox,只看到自己 agent 收到的消息(per-owner 隔离)
- **Admin** 可看到全 tenant 视图(切换 tab)便于排查
- **Agent 自身**通过 WS 自动拿被 Approved 的消息,不在 dashboard 上动作

---

## 2. 用户故事

### 典型场景

| # | 角色 | 故事 |
|---|---|---|
| 1 | Bob (PM) | 我正在 inbox 处理客户反馈。Bob 的 agent 想问 Alice 的 agent "这个 bug 在 backlog 的优先级是 P0 还是 P1?" → Alice 的 inbox 出现一条 🟡 request "From bob-cursor · Priority for bug #428?" → Alice 看了一眼 "P1" → Approve → Alice 的 agent 收到这个 request,自动回 "P1, planned for next sprint" → Bob 的 agent 拿到答复,继续给客户写邮件。 |
| 2 | Alice (Eng director) | 周一早上一打开 inbox 看到 12 条同事发来的待审批消息。10 条是 ⚪ sync (各种状态心跳),2 条是 🟡 request 需要她拍板。我已经在 settings 设了 "auto-approve sync from internal" 规则—— sync 默认不进 pending,直接被 agent 收到。12 条简化成"2 条 pending request"。我处理这 2 条用 1 分钟。 |
| 3 | Charlie (designer) | 我 agent 完成了原型,要 handoff 给 Bob agent 进入测试。我打开 inbox,但 inbox 里**没有要我做的事**——agent 主动发出的消息不需要我审批(只有"我家 agent 收到的"才需要)。我去 Sent tab 能看到 agent 出去的 handoff 记录,确认成功了就行。 |
| 4 | Alice 周末旅游 | 我手机收 push "🟣 handoff from charlie-mcp · prototype ready for testing" 到 Alice。push 不打扰 Bob(Bob 也设了 mute on weekends)。Alice 看 push 文案就懂了大意,在手机点 push 跳 inbox deep link,看完 → Approve → Alice 的 agent 在后台拿到 handoff,周一上班她回办公室时已经看到 agent 准备好的测试 plan。 |
| 5 | Eng manager | 团队 6 个工程师的 agent 互相在跑 code review、依赖更新通知等流。我设了 "auto-approve sync + inform from team members" + "always pending request and handoff" 规则 → 每天 inbox 里只剩需要我思考的 2-5 条,而不是 50 条。 |
| 6 | New hire (Charlie) | 我刚加入,完全不知道哪些消息要批哪些不批。inbox 顶部柔和 banner "First time here? · [Set up auto-approve rules]" 引导我去 settings → 默认推荐 "auto-approve sync/inform from team, manual review request/handoff/escalate" — 我点 Apply suggested → 适应了产品节奏。 |
| 7 | Power user | 我处理 inbox 是键盘流:`j/k` 上下移、`a` approve、`r` reject、`e` 回复(进 Sheet 的 reply tab)、`?` 显示快捷键。我能在 30 秒内清空 20 条 pending。 |
| 8 | Admin debugging | 团队报告"Alice 的 agent 上周二没回复 Bob"。我切 admin 视图 → All members → filter sender=bob-cursor + recipient=alice-claude + 时间 last Tuesday → 找到那一条:状态是 "rejected by Alice 14:23"——原来是 Alice 主动拒了。不是 bug。 |

### 边缘场景

| # | 故事 |
|---|---|
| E1 | 两个 admin 在同一秒 approve 同一条消息(其实是 owner 自己 + admin 视角同时点)→ 后操作者收到 toast "Already approved by Charlie 0.4s ago",状态被服务端权威化,UI 不冲突。 |
| E2 | 我 agent 处于"被撤销"状态(我刚在 `/settings/devices` revoke 了它)→ 别人发来的 message 还能进 inbox(我作为 user 还能 review),但 Approve 时弹 "Your agent has been revoked. Approve anyway? (no agent to receive)" 提醒。 |
| E3 | inbox 里 pending 累积到 ≥ 10 条 → 顶部黄色 banner "10 pending · [Approve all matching auto-rules] [Tune your auto-approve rules ↗]"。 |
| E4 | 我 Reject 一条后 30 秒内反悔 → 顶部 sticky toast "[Undo · 25s]" 可恢复(消息状态 rejected → pending)。 |
| E5 | Bob 离职,他的 agent 被自动撤销 → 历史发出的消息保留在 audit / inbox 里(显示 "bob-cursor (revoked)"),但之后不会有新消息;别人想"alice-claude 回复给 bob-cursor"时 hub 直接拒绝(target 已 revoked)。 |

---

## 3. UI 入口与界面

### 路由

- `/inbox` — 主入口,默认 tab=Pending(我家 agent 需要我审批的)
- `/inbox?tab=all` — 全部(含已批/拒/sent)
- `/inbox?tab=sent` — 我家 agent 发出去的
- `/inbox?tab=archived` — 已读已归档(V1 包含,不另开页)
- `/inbox?view=admin` — Admin 视角(看全 tenant 流)
- `/inbox?msg=<id>` — deep link 直接打开某条消息 Sheet(push 通知点击 / 邮件分享 / audit log 跳转用)

### 主视图(默认 owner 视角)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Inbox                                Live●           3 pending   ⌘K  中/EN  │
│  [Pending 3]  [All]  [Sent]  [Archived]              [Rules ⚙]               │
├──────────────────────────────────────────────────────────────────────────────┤
│  + 5 new messages received · [Show ▼]      ← 实时浮窗,不自动插入             │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 🟡 request   from bob-cursor                              [Pending]    │ │
│  │              Priority for bug #428?                      2m ago        │ │
│  │              Bob asked: which sprint should this go in…                 │ │
│  │              [Approve]  [Reject]  [Reply]                              │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 🟣 handoff   from charlie-mcp                              [Pending]   │ │
│  │              Prototype ready for testing                  4m ago       │ │
│  │              Charlie's agent finished the v2 mockups…                   │ │
│  │              [Approve & create task]  [Reject]  [Reply]                │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ─── 12 sync messages auto-approved · [Show all ▼]                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 🔵 inform   from bob-cursor                                  [Read]    │ │
│  │              Daily summary 2026-05-12                       1h ago     │ │
│  │              Processed 247 customer queries, 12 escalated …             │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  [Load earlier]                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

- 顶部 tab 数量徽标只在 pending tab 显示(其他无未读概念)
- 状态点(Live ● / Connecting ● / Offline ●)在最显眼处,WS 连接首要信号
- 7 类型靠 icon + 主色区分,一眼识别优先级
- "auto-approved" 折叠条:被规则自动批的消息默认折成一行,点 Show all 展开看
- **"+ N new" 浮窗**:WS 实时收到新消息时不自动插入,顶部出现绿色浮窗,用户点 Show 才上推

### Sheet — 消息详情(右滑入,480px 宽)

```
                  ┌──────────────────────────────────────────┐
                  │ ←  Priority for bug #428?                │
                  │                                          │
                  │ 🟡 request                               │
                  │                                          │
                  │ From   Bob M (PM)                        │
                  │        bob-cursor  [View agent ↗]        │
                  │ To     me / alice-claude                 │
                  │ Time   2m ago (2026-05-12 14:23)         │
                  │                                          │
                  │ ─────────────────────────────────────── │
                  │                                          │
                  │ Hey Alice's agent,                       │
                  │                                          │
                  │ Bug #428 came in from a customer.        │
                  │ It's affecting checkout for 3% of users. │
                  │ Should this be P0 or P1 in next sprint?  │
                  │                                          │
                  │ ─────────────────────────────────────── │
                  │                                          │
                  │ Thread (this conversation)               │
                  │ ▸ Bob's earlier sync  ·  yesterday       │
                  │ ▸ My agent's reply    ·  yesterday       │
                  │                                          │
                  │ ─────────────────────────────────────── │
                  │                                          │
                  │ [✓ Approve & forward to agent]           │
                  │ [✕ Reject (silent)]                       │
                  │ [↩ Reply directly]                       │
                  │ [Create task from this ↗]                │
                  │                                          │
                  │ Audit · [Open in audit log ↗]            │
                  └──────────────────────────────────────────┘
```

- 头部只显示 1 个徽标(类型),不再有签名 / E2E 状态(同组织默认信任)
- Thread 区域显示这对 agent 之间的历史消息(同 sender/recipient pair 自动聚合)
- 底部 4 个动作,主动作 Approve 高亮
- "Open in audit log" 跳到 `/audit?msg=<id>`,可见后端写的所有 audit 行(送达、状态机迁移、规则命中等)

### Settings — Auto-approve rules (`/inbox` 右上 [Rules ⚙])

```
                  ┌──────────────────────────────────────────┐
                  │ ← Auto-approve rules                     │
                  │                                          │
                  │ When my agent receives:                  │
                  │                                          │
                  │ Rule 1                                   │
                  │   Type  ☑ sync  ☑ inform                 │
                  │   From  ◉ Anyone in team                 │
                  │         ◯ Specific agents [+ select]     │
                  │   Action  [Auto-approve ▾]               │
                  │                                          │
                  │ Rule 2                                   │
                  │   Type  ☑ request  ☑ handoff             │
                  │   From  ● bob-cursor                     │
                  │   Action  [Always pending ▾]             │
                  │                                          │
                  │ [+ Add rule]                             │
                  │                                          │
                  │ Default action (no rule matches)         │
                  │   [Pending review ▾]                     │
                  │                                          │
                  │ ─────────                                │
                  │                                          │
                  │ Suggestions ✨                            │
                  │   Auto-approve sync from team members?   │
                  │   ([Apply])                              │
                  │                                          │
                  │ [Save changes]                           │
                  └──────────────────────────────────────────┘
```

亮点:
- 上半:用户自己加的规则,可选 type + sender + action 三个维度
- 下半:**Suggestions** — 系统根据 user 历史行为推荐("你过去 10 条 sync 都批了,要不要自动批?")
- Default action 兜底,默认 "Pending review"(全人工)

### Admin view — `/inbox?view=admin`

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Inbox  ·  Admin view (all team members)                                     │
│  [All]  [Pending]  [Approved]  [Rejected]                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│  Filter:  Sender [Any ▾]  Recipient [Any ▾]  Type [Any ▾]  Date [7d ▾]      │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 🟡 bob-cursor → alice-claude · request · Pending · 2m ago               │ │
│  │    Priority for bug #428?                                               │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 🟣 charlie-mcp → bob-cursor · handoff · Approved · 4m ago               │ │
│  │    Prototype ready for testing                                          │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ...                                                                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

Admin 视角不能 Approve/Reject 别人的消息(那是 owner 的权限),只能**观察 + 跳详情**。

---

## 4. 状态机

| 状态 | 触发 | UI |
|---|---|---|
| **Loading initial** | 进 `/inbox` | 5 个 skeleton 卡片 + filter bar 灰显 |
| **Empty (no agent)** | 没绑 agent | 大空态卡 "No agents connected yet · [Connect an agent →]" 跳 `/settings/devices` |
| **Empty (no msgs)** | 有 agent 但没消息 | "All caught up. No pending messages." 友善空态 |
| **Connecting (WS)** | 页面挂载 | 顶部 ● Connecting…,卡片 5s 浮现 |
| **Live** | WS open + subscribed | ● Live 绿点,新消息推到顶部浮窗 |
| **Receiving (浮窗)** | WS push 来新消息 | 顶部绿色浮窗 "+ N new · [Show ▼]" 不自动插入 |
| **Refreshing on click** | 用户点 Show | 浮窗消失,新卡片以"flash 200ms 黄底"动画插入顶部 |
| **WS reconnecting** | WS close | ● Connecting…,backoff 1s→2→4→8→16→30s |
| **Offline** | WS 失败 3 次 | ● Offline,fallback 5s 轮询`?after_id=`,顶部 sticky "Live updates paused" |
| **Live restored** | WS 重连 | ● Live,polling 停止,toast "Live updates resumed" |
| **Approving** | 点 [Approve] | 卡片按钮 spinner,卡片头条变 "Approving…",成功后变 [Approved] 绿底 1s 后淡化 |
| **Auto-approved (rule)** | 规则命中入库时 | 卡片直接落到"auto-approved"折叠区,带 "by rule: <name>" tooltip |
| **Rejecting** | 点 [Reject] | 同上,变 [Rejected] 红底 |
| **Reject undo window** | Reject 完成 | 顶部 sticky toast "Rejected · [Undo · 30s]";30s 内点 Undo 撤回到 pending |
| **Reply composing** | Sheet 点 [Reply] | Sheet 下方展开 inline editor + [Send] [Discard],Esc 收起 |
| **Sending reply** | Send | 按钮 spinner,成功后 editor 收起 + Sheet 切到 Sent tab + flash |
| **Sheet open** | 点卡片 | Sheet 右滑入 380ms,卡片在列表中高亮 |
| **Sheet 切到 thread item** | 点 thread 项 | Sheet 内容滑动到对应消息(同 Sheet 内导航) |
| **Concurrent action** | 别处同人改了 | toast "Already approved by Charlie 0.4s ago",UI 状态自动同步 |
| **Pending overflow (≥10)** | pending ≥ 10 | 顶部黄色 banner "10 pending · [Tune auto-approve rules ↗]" |
| **Network offline (browser)** | navigator offline | 整体红色顶部 banner "You're offline · changes will sync",Approve/Reject 灰显 |
| **Push not granted** | 第一次进 inbox 且 permission==='default' | 顶部柔和 banner "Get notified when offline · [Enable]"(可 Dismiss,7 天内不再问) |
| **Push subscribed** | 用户点 Enable + 授权 | banner 收起 + 静默订阅 |
| **Search active (⌘K)** | 输入 query | Modal 跨 tab 搜消息(subject + sender + body 前 280 字) |
| **Rules saving** | Rules Sheet 点 Save | 按钮 spinner;成功后整页 toast "Rules updated · 3 rules active" |
| **Suggestion applied** | 点 [Apply] suggestion | 该建议消失,对应 rule 自动出现在 Rules 列表顶部 |
| **My agent revoked + msg comes in** | agent 被 revoke | 卡片 Approve 按钮 hover 提示 "Your agent has been revoked · Approve anyway? (no agent to receive)" |

---

## 5. 杀手锏功能 ⭐

### 5.1 "+N new" 浮窗(不打断你正读的)

WS 实时推送是好事,但**自动插入卡片到顶部会打断当前阅读**——你正读消息 #5,新消息把它顶到第 7 位,鼠标位置错乱。
解法:WS push 到达不直接插入,顶部弹绿色浮窗 "+ 3 new messages · [Show ▼]"。用户在自然的间隙(读完当前)主动点击,新消息才以 flash 200ms 黄底动画推到顶。
这是细节,但**累积起来就是"专业感"**:同样信息,Slack 就用这种模式,普通 webapp 就强制插入。

### 5.2 7 类型 + emoji 颜色 + 默认动作

不是所有消息一样重要。**类型决定颜色 + 默认动作**:
- 🟡 **request** — Approve / Reject 按钮平级
- 🟣 **handoff** — 默认按钮变 "[Approve & create task]"(顺手把任务建到 project)
- 🔵 **inform** / ⚪ **sync** — 默认就 "Mark read",批/拒按钮隐藏(它不是 ask,只是 tell)
- 🟢 **commit** — 顶部加 "Recorded ✓",自动写入 audit log
- 🟠 **escalate** — 卡片加感叹号边框,顶部钉住
- 🔴 **block** — push 优先级 high(其他 normal),手机弹横幅

**自动按 type 聚合 / 折叠**:连续多条 sync 自动折成一行,inform 默认收起,request 永远展开。
高密度 inbox 不再淹死人。

### 5.3 自动审批规则 + 智能建议

每天 50 条消息全人工审是不现实的。**规则系统**让 owner 把信任的模式固化:
- 维度:`type × sender × action`,组合表达"sync 类来自团队 = 自动批"等
- Action 三选一:`Auto-approve` / `Always pending` / `Auto-reject`
- 多条规则按顺序匹配,第一命中即生效
- 没规则命中走 default action(默认 Pending review)

更狠的是 **Suggestions 引擎**:
- 系统观察 owner 历史行为(过去 30 天的 approve/reject 模式)
- 自动给出建议如 "你过去 28 条 sync 都批了,要不要建一条 auto-approve 规则?"
- 一键 Apply → 规则自动生成

让 inbox 从"每条都人工"演化到"只看真值得我看的"。**这是产品成熟度的体现**。

### 5.4 Sheet 内 thread 时间线(对话上下文一目)

不是每条消息独立 — 同事 agent 之间往往是多轮交互。Sheet 头部下方有 **Thread** 区,纵向时间线显示这对 sender × recipient 的所有历史消息。
点 thread 项,Sheet 内容滑动到对应消息(不开新 Sheet,避免迷失),返回箭头一键回到原始那条。
让用户**永远知道 "这是这个对话的第几轮"**。

### 5.5 离线增量同步 (`?after_id=`)

WS 断了 30 分钟回来,**不是全量重拉,而是只拉断网后的增量**。
做法:WS 在 last successful event 时把 message id 记住;重连后 fallback polling 拉 `?after_id=<last_id>` 只取新的;WS 成功后切回 push。
带宽和电池友好,大组织(每天 1000+ 消息)也能秒回。

### 5.6 Approve / Reject 都有 [Undo · 30s]

点 Approve 之后 30 秒内可撤回。点 Reject 同理(消息状态从 rejected → pending,sender agent 不会知道——silent reject 不发任何通知;Undo 也保持 silent)。
小细节,但**给了用户反悔的勇气**,降低"按错按钮"的恐惧感。
30 秒后才真正落到 audit log 的 final state;期间是 "tentative" 中间态,audit log 不写。

---

## 6. 交互细节

- **键盘**:
  - `j / k` 列表中下/上一条
  - `↵` 打开当前卡片 Sheet
  - `a` Approve(在列表或 Sheet 中都有效),`r` Reject,`e` 回复(打开 Sheet 的 reply 区)
  - `m` Mark as read(对 inform/sync 默认动作)
  - `⌘K` 全局搜索 inbox
  - `g i` go to inbox,`g s` go to sent,`g r` go to rules
  - `?` 显示快捷键 cheat sheet
- **批量操作**:
  - 列表卡片左侧 hover 出现 checkbox
  - 选 N 条后顶部 actionbar 浮出 "N selected · [Approve all] [Reject all] [Archive] [✕ Clear]"
- **视觉反馈**:
  - 新消息 flash 黄底 200ms 后淡入正常
  - Approved 卡片 1s 内绿色头条 + 滑动到对应 tab
  - WS 状态点带 0.5Hz 慢呼吸动画(健在感)
- **复制**:
  - Sheet 右上 ⋯ 菜单 [Copy link to message] (`?msg=<id>` deep link)
  - [Copy message body] / [Copy as markdown]
- **音效**:V1 默认静音(避免打扰)。可在 Rules 旁加 "Notify sound on new request/handoff"。
- **多语言**:Sheet 内消息正文如果是英文,但当前 user lang=zh → 不强翻;但 Sheet 下方提供 "[Translate to 中文]" 按钮一次性翻译展示(原文保留)
- **粘贴上下文**:Reply editor V1 仅文本+markdown,粘贴图片/文件留待后续

---

## 7. 边界与异常路径

- **per-owner 隔离**:user A 只能看到自己 agent 收到的消息;访问别人 inbox 链接(改 URL)→ 后端 403,UI "Message not found or no access"
- **Admin view 是只读**:admin 看到全 tenant 流但不能 Approve/Reject 别人的消息(那是 owner 决策)
- **WS 滥用 / 异常 frame**:hub 已加固;单 WS 异常不影响其他 WS;客户端只看到"this connection dropped, reconnecting…"
- **批量 Approve 中部分失败**:UI 不阻断,失败的留下并红色 + Retry;成功的批量动作完成
- **并发 approve/reject**:hub 权威化,后操作收到 toast,UI 自动同步状态
- **消息 body 超大** (>1MB 单条):发送时(sender agent)直接拒绝;接收方不会收到超大;hub 端硬限
- **网络断 → reconnect 后 polling vs WS 切换**:无缝切换,toast 给信号"Live updates resumed"
- **Web Push 失败**(浏览器拒绝/订阅过期):静默失败,inbox 上的状态不变;下次进 inbox 时柔和提示 "Push subscription expired · [Re-enable]"
- **Reject 后 Undo 窗口过期**:30s 后撤回按钮变灰 + 灰 toast "Undo window expired"
- **Reply 失败**:editor 不关闭,顶部红条 "Send failed · [Retry]";编辑内容保留
- **Agent revoked but message in flight**:revoke 瞬间 hub 拒绝送达;sender 收到 410 Gone;inbox 不会再出现新消息;历史已收到的仍在
- **Rule 编辑冲突**:Rules Sheet 内的"我"独占,不存在并发(rules per-user)
- **Rule 失效** — 引用的某个具体 agent 被 revoke:rule 仍存在但显示 ⚠ "referenced agent revoked",owner 可手动改或删除

---

## 8. 开放问题

- **消息正文展示长度**:列表卡片显示前 140 字 preview(明文,hub 直接存)。**决策**:V1 不做 E2E 加密(组织内 hub 受信),hub 端可读 body —— preview 在服务端生成,inbox 列表 / push 通知 / 全文搜索都受益。
- **Sync 折叠默认行为**:连续 N 条折叠的 N = 3 合理吗? **决策**:V1 = 3,后续用户可在 Settings 调。
- **批量 Approve 安全**:对 ≥ 50 条的批量动作要不要确认弹窗?**决策**:V1 = 不要(轻量);后续可加 settings "Confirm bulk action over X items"。
- **Pending overflow banner 阈值**:≥10 触发"调规则"banner 合理吗?**决策**:V1 = 10。
- **deep link `?msg=` 的安全**:有人转发链接到不应看的人 → 后端 cookie 校验,看不到该消息就 404,链接本身不泄漏。
- **键盘快捷键冲突**:`?` 在某些 browser 是搜索,需 evt.preventDefault。`g i` Vim-style two-key 不与浏览器冲突。
- **多 tenant 切换时 inbox 状态保留**?**决策**:切 tenant 时 inbox 整体重置(包含 WS 连接);避免"我切到 tenant B 还看到 tenant A 的消息"。
- **Sheet 内 thread 显示深度**:V1 最多显示 thread 中最近 10 条,再上点 "Load earlier in thread"。
- **跨组织通信是否做?** 当前 V1 完全不做。若未来要做,会重新设计独立的 cross-tenant 协议(含端到端加密 + 签名验证),不影响本 feature。
- **Rules 引擎的可调试性**:owner 想知道"为什么这条消息走了 auto-approve" → V1 在 audit log 行里记录 "matched rule X",owner 可在 audit 查;Sheet 内显示 "Auto-approved by rule: <name>" 已经足够透明。
- **Auto-approve 规则的"反悔"窗口**:auto-approved 消息也支持 30s undo 吗?**决策**:不 — auto 的目的就是无感,加 undo 反而打扰 owner。但 auto-approved 在 audit log 里有完整轨迹,事后可查。
