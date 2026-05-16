# Feature 06 — 审计日志

> 本文档**只描述功能**。数据 / 接口 / 实现 / 迁移见 `_archive/06-tech-draft.md`。

---

## 1. 是什么

审计日志是 Firefly Mesh 的**回放镜** — 让 admin "看到 agent 做了什么、谁触发的、用了哪些 tool、为什么这么做"。
每一次 关键动作都被服务端权威写入 `audit_log`,UI 提供按时间倒序的时间线 + 多维过滤 + 详情 drawer + CSV 导出。

**为什么这是核心 feature**:AI agent **自主**做事时,信任的唯一办法是**事后可查**。一笔异常 outreach、一次客户信息泄漏、一个看起来很奇怪的工具调用 — 必须可以问出"上周二下午 3 点,Alice 的 agent 发出那条消息的当时,它收到了什么、调了哪些 tool、用了什么 prompt"。

记录的事件类型(部分):
- `message.sent` / `message.received` / `message.approved` / `message.rejected`
- `agent.bound` / `agent.revoked` / `agent.token_regenerated`
- `member.invited` / `member.joined` / `member.role_changed` / `member.suspended`
- `employee.created` / `employee.updated` / `department.created`
- `folder.created` / `document.created` / `document.updated` / `document.deleted`
- `boundary.created` / `boundary.updated` / `boundary.applied`
- `skill.created` / `tool.created` / `tool.tested` / `router_rule.reordered`
- `cron.cleanup` / `cron.audit_truncate`
- `auth.login` / `auth.logout` / `auth.password_changed`

**谁会用**:
- **Owner / Admin** — 全部 audit 可见
- **Member** — V1 默认看不到 audit(sidebar 不显示;访问 `/audit` 重定向)
- **Compliance / Security 角色** — V1 暂归类到 admin

---

## 2. 用户故事

### 典型场景

| # | 角色 | 故事 |
|---|---|---|
| 1 | Compliance officer | 周一例行审查上周 outreach。`/audit` → filter kind=`message.sent` + date range "last 7 days" + actor "Sales department" → 列表 47 行 → 我抽看几条详情(Sheet)看 tool 调用 + system prompt + 收件人 → 都符合规范,标记审查完成。 |
| 2 | Security | 上周二有用户报告"客户数据泄漏"。我从用户名查起 → filter actor=`user:dave@acme.com` + from=Tue → 列表 28 行,我按 kind 二级过滤"document.read" → 4 行 → 我点详情看到 dave 当时调了 `notion_search` tool,tool 的输出含敏感字段 → 我顺着"Related" 链接跳到该 message 的 Sheet → 完整还原现场。 |
| 3 | Admin curious | 我想看上个月 agent 触发了多少 skill。filter kind contains "skill" + from=last month → 列表 200+ 行 → 顶部右侧 [Export CSV] → 下载 → Excel 打开做透视表。 |
| 4 | Owner | Charlie 上周突然被升 admin,我想确认是谁干的。filter kind=`member.role_changed` + actor=Charlie 或 subject=Charlie → 列出 1 行 → Sheet 显示 actor=Alice(我自己),时间,old_role=member, new_role=admin → 没问题。 |
| 5 | Developer (looking for own actions) | V1 暂不允许 member 看 audit。但我"member"角色能看 `/audit/me?`(预留路径)只看自己相关的 — V1 不实现,但留位以便 V1.5 启用。 |
| 6 | Admin investigating odd behavior | inbox 里 Sheet 内底部有 [Open in audit log ↗] 链接 → 跳 `/audit?msg=<id>` → 自动 filter subject=msg_xxx → 列出该消息的完整生命周期(received → pending → approved → forwarded to agent → agent ack)6 行 → 一目了然。 |
| 7 | Admin overload (too many events) | 我们 org 每天 1000+ events 太多看不过来。顶部 [Saved filters] 下拉,选 "Pending approvals only" → 应用预存的复杂过滤(kind=`message.received` + status=pending)→ 列表立刻精炼到当天 20 条。 |

### 边缘场景

| # | 故事 |
|---|---|
| E1 | 某个 actor 是已离职员工 → 列表显示 "Bob M (former employee)" 灰色;Sheet 详情显示 actor_label 是原始 name 冗余存储,不依赖 employees 表 join。 |
| E2 | 某条 audit 的 details JSON 超过 8KB 上限 → details 字段被服务端截断 + 显示 "[truncated · 12.3KB original]" 提示。Sheet 详情显示截断前部 + 完整下载链接(V1 不实现)。 |
| E3 | 我 export CSV 但 filter 后结果 > 10k 行 → 提示 "Too many rows (12,341 / 10,000 max). Narrow your filter and try again." |
| E4 | 90 天前的 audit 已被 cron 清理 → 我 date range 选 100 天前 → 列表空 + 顶部提示 "Audit logs older than 90 days are pruned by retention policy." |
| E5 | 我点详情 [Open in audit log ↗] 但那条 audit 已被清(超 90 天) → audit 详情页 404 + "This entry has been pruned." |

---

## 3. UI 入口与界面

### 路由

- `/audit` — 主入口,timeline view
- `/audit?kind=...&actor=...&from=...&to=...` — deep link 自定义过滤
- `/audit?msg=<id>` — deep link 一条消息的完整 audit 链路
- `/audit/:id` — 单条 audit 详情(deep link 用)

### 主视图 — Timeline view

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Audit log                                            ⌘K Search…  中/EN    │
│                                                                              │
│  Filters:                                                                    │
│    Kind  [All ▾]    Actor  [All ▾]    Date  [Last 7 days ▾]    [Reset]      │
│                                                                              │
│  Saved filters:  [Pending approvals]  [Member changes]  [Rule changes]  [+] │
│                                                                              │
│  213 events · Page 1 of 5                                  [Export CSV]      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ─── Today (May 12) ─────────────────────────────────────────────────────── │
│                                                                              │
│  │ 14:23  Alice K (user) ─→ message.approved          subject: msg_abc      │
│  │        Approved a priority request from bob-cursor (PM)                  │
│  │                                                                          │
│  │ 14:20  bob-cursor (agent) ─→ message.received      subject: msg_abc     │
│  │        Bob's agent asked about bug #428 priority                         │
│  │                                                                          │
│  │ 13:45  Alice K (user) ─→ member.invited            subject: dave@acme    │
│  │        Invited as member                                                 │
│  │                                                                          │
│  ─── Yesterday (May 11) ─────────────────────────────────────────────────── │
│                                                                              │
│  │ 18:30  System ─→ cron.audit_truncate              subject: audit_log    │
│  │        Pruned 1,432 entries older than 90 days                           │
│  │                                                                          │
│  │ 11:15  Bob M (user) ─→ document.created            subject: doc_xyz      │
│  │        Created "Q3-planning" in folder Q3                                │
│  │                                                                          │
│  ─── Last week ────────────────────────────────────────────────────────────  │
│                                                                              │
│  ...                                                                         │
│                                                                              │
│                          [Load earlier 50 events]                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

亮点:
- 按"今天 / 昨天 / 上周 / 更早"自动**时间分组**,符合人对时间的认知粒度
- 每行左侧有垂直的"timeline 竖条",视觉强调"事件流"
- actor 类型用前缀标注(user / agent / system / external agent ⚠)
- subject 自动渲染成简洁文案("Approved a priority request from bob-cursor")— 而不是原始 JSON

### Sheet — 单条 audit 详情

```
                  ┌────────────────────────────────────────────┐
                  │ ← message.approved                         │
                  │                                            │
                  │ Time      2026-05-12 14:23:33 UTC          │
                  │           (just now · in your timezone)    │
                  │                                            │
                  │ Actor     Alice K (user)  alice@acme.com   │
                  │ Tenant    Acme Inc                         │
                  │ Subject   message msg_abc123 [Open ↗]      │
                  │                                            │
                  │ Summary                                    │
                  │   Alice approved a priority request from   │
                  │   bob-cursor (PM, same org).               │
                  │                                            │
                  │ ────────────────────────────────────────── │
                  │ Details (raw)                              │
                  │ ┌────────────────────────────────────────┐ │
                  │ │ {                                      │ │
                  │ │   "message_id": "msg_abc123",          │ │
                  │ │   "from_agent": "bob-cursor",          │ │
                  │ │   "to_agent": "alice-claude",          │ │
                  │ │   "kind": "request",                   │ │
                  │ │   "decision_latency_ms": 12345,        │ │
                  │ │   "approved_by": "user_alice",         │ │
                  │ │   "matched_rule": null                 │ │
                  │ │ }                                      │ │
                  │ └────────────────────────────────────────┘ │
                  │ ↑ syntax-highlighted JSON                  │
                  │                                            │
                  │ ────────────────────────────────────────── │
                  │ Related                                    │
                  │   → message msg_abc123 [Open in inbox ↗]   │
                  │   → message.received (14:20)               │
                  │   → message.delivered (14:23, +0.4s)       │
                  │                                            │
                  │ ─── Copy ⋯                                 │
                  │   [Copy ID]  [Copy as JSON]  [Copy URL]    │
                  └────────────────────────────────────────────┘
```

### Filter bar(展开后)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Filters                                                              [✕]    │
│                                                                              │
│  Kind                                                                        │
│    ◯ All  ◉ message.*  ◯ member.*  ◯ document.*  ◯ skill.*  [Custom...]      │
│                                                                              │
│  Actor                                                                       │
│    ◯ Any                                                                     │
│    ● user / agent / system                                                   │
│    Specific:  [Alice K ▾]  ✕ [bob-claude ▾]                                  │
│                                                                              │
│  Date range                                                                  │
│    ◉ Last 7 days  ◯ Last 30 days  ◯ Last 90 days  ◯ Custom                  │
│    Custom: [2026-05-01] to [2026-05-12]                                      │
│                                                                              │
│  Subject (advanced)                                                          │
│    [contains ▾]  [msg_____]                                                  │
│                                                                              │
│                                            [Reset]   [Save filter]   [Apply]│
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 状态机

| 状态 | 触发 | UI |
|---|---|---|
| **Loading initial** | 进 `/audit` | timeline skeleton(10 行)+ filter bar 灰显 |
| **Empty (filter result)** | filter 命中 0 行 | "No events match your filters · [Reset filters]" |
| **Empty (true)** | tenant 完全没 events(新建)| "Audit log is empty · Activity will appear as you use the dashboard" |
| **Ready** | 数据加载完 | 时间分组 timeline + load earlier |
| **Filtering** | filter bar 改任一项 | 顶部计数 spinner + 列表淡化 |
| **Filter applied** | 应用完 | 列表更新 + "213 events" 计数刷新 |
| **Pagination loading** | 点 Load earlier | 底部 spinner "Loading 50 more…" → 平滑追加 |
| **Pagination end** | 后端无更多 | 底部灰色"End of audit history" |
| **Sheet open** | 点行 | Sheet 右滑入,行高亮 |
| **JSON parse fail** | details 不是合法 JSON(异常)| Sheet 内显示 raw text + 灰条 "Could not parse as JSON" |
| **Export preparing** | 点 Export CSV | 按钮变 "Preparing… 0%" + spinner,后端流式生成 |
| **Export done** | CSV 准备完毕 | 按钮变 "Download (4,213 rows)" → 点击下载 |
| **Export too large** | 行数 > 10k | toast "Too many rows (12,341 / 10,000) · Narrow filter" |
| **Real-time append** | WS push 新 event(V1.5)| 列表顶部 flash 黄底 200ms;V1 不实现 |
| **Saved filter clicked** | 点 saved 标签 | filter bar 立即应用,列表刷新 |
| **Save current filter** | 点 [+ Save current] | popover 输入名 → Save → 加到 saved filters bar |
| **Member access denied** | member 直接访问 `/audit` | sidebar 不显示该入口;若手动输 URL → 重定向 `/inbox` + toast "Admin only" |
| **Deep link missing event** | `/audit/:id` 但已被 prune | 404 页 "This entry has been pruned (older than 90 days)" |
| **Time zone toggle** | 用户改语言 / 时区 | 列表行的相对时间立即重渲染,Sheet 内绝对 UTC 不变 |

---

## 5. 杀手锏功能 ⭐

### 5.1 Timeline 视图(不是表格,是时间流)

大多数 audit log 工具用表格 — 每行一个事件,平铺。Firefly 选择 timeline:
- 按 "今天 / 昨天 / 上周 / 更早" 自然分组(日历直觉)
- 每行左侧有竖条像"事件流",视觉强调"这些是 持续发生的"
- actor 用 emoji 前缀(👤 user / 🤖 agent / ⚙ system / ⚠ external),0.5 秒识别
- subject 自动生成人类可读 summary("Alice approved a priority request from bob-cursor")— 不是原始 JSON

体验差异:**表格让人想"算账",timeline 让人想"理解时间"**。审计本质是后者。

### 5.2 多维过滤 + Saved Filters(常用查询固化)

filter bar 不仅支持 kind/actor/date,还有:
- subject 子串模糊匹配
- multiple actor 同时筛(取 OR)
- "Specific kind hierarchy":选 `message.*` 自动包括 sent/received/approved/rejected 四子类
- date range 包含 last 7d / last 30d / last 90d 快选 + custom

更杀手的是 **Saved Filters**:
- admin 常做"待审批消息盘点"——可保存为 "Pending approvals" 一键过滤
- "成员变更"——`kind=member.*`
- "我自己的动作"——`actor=me`
- saved filter 显示在 filter bar 之上,一键应用

公司大了 audit 量大,**搜索能力 = 工具竞争力**。

### 5.3 Related 跨链跳转(把 audit 还原成"故事")

每条 audit 详情 Sheet 都有 "Related" 区块,列出 **相关事件**:
- 同一 message 的完整生命周期(received → pending → approved → delivered)
- 同 thread 的所有消息事件
- 同 actor 同分钟的其他操作(看是不是连贯动作)

点 Related 项 → Sheet 内容滑到对应事件(不开新 Sheet,避免迷失)。
让"散点事件"还原成"叙事链"。**审计的本质是讲故事,Related 区让故事浮出来。**

### 5.4 CSV Export(给法务 / 合规 / 财务)

合规审查通常不能"在 dashboard 上点 → 点 → 点",而是需要"把上 quarter 所有 agent 消息 / 成员变更给我"——表格 + Excel 是他们的母语。
**Export CSV** 端点:filter 完毕后一键导出:
- 列:`id, created_at, actor_kind, actor_label, kind, subject_kind, subject_id, details_json`
- UTF-8 with BOM(Excel 友好)
- V1 同步,上限 10k 行;超过提示 narrow filter
- 文件名 `audit_2026-05-12_to_2026-05-12.csv`(自动按 filter 命名)

### 5.5 actor_label 冗余 — 历史名永久可查

设计巧妙处:audit_log 表里 `actor_label` 是冗余字段(不依赖 `user` / `employees` 表 join)。
后果:**即使你删了 user,删了 employee,他过去的 audit 行里还能看到原始 name**("Bob M (former employee)")。
没有这条冗余,删 user 时会留下"Bob (id deleted)"这种诡异的孤儿状态。
对合规来说这是关键 — 已离职员工的历史动作必须可追溯。

---

## 6. 交互细节

- **键盘**:
  - `⌘K` cross-audit 搜索(subject + summary 模糊)
  - `j/k` 行间导航,`↵` 进 Sheet,`Esc` 退出
  - `f` 聚焦 filter bar 第一个 input(用于一键 narrow)
  - `e` 在 Sheet 内 → [Open in inbox](或对应 feature)
- **时间显示**:列表行用相对时间(`12 min ago` / `Yesterday 18:30` / `May 10`),Sheet 内显示绝对 UTC + 用户本地时区(双显)
- **JSON 渲染**:Monaco read-only mode 显示 details,带语法高亮 + 折叠 + 复制按钮
- **复制**:Sheet ⋯ 菜单 `Copy ID` / `Copy as JSON` / `Copy URL`(deep link)
- **Saved filter 管理**:每个 saved filter 旁悬浮 [✕] 可删除
- **批量动作**:V1 audit 是只读的,不支持批量操作(不允许 delete/edit audit)
- **细分类别 select**:filter bar 的 Kind 是层次的,选 `message` 自动含 4 子类;若想只看 `message.approved`,展开层级选 leaf
- **Real-time append (V1.5)**:V1 不做 WS 实时;V1.5 可加 — admin 进入 audit 页时打开 SSE,新事件 flash 黄底 200ms 插入顶部

---

## 7. 边界与异常路径

- **跨 tenant**:URL 改 `tenantId` 拉别 tenant audit → 403
- **Member 访问 `/audit`**:sidebar 不渲染入口;手动输 URL → 重定向 `/inbox` + toast "Admin only"
- **details 超过 8KB**:服务端截断 + 标记 "[truncated]";Sheet 内显示截断前部
- **JSON parse fail**(异常 details)→ Sheet 内显示 raw text + 灰条提示
- **Export filter 命中 > 10k**:提示 "Too many rows · Narrow filter and retry"
- **deep link 指向 pruned**:404 + "This entry has been pruned (older than 90 days)"
- **filter date range > 90 days**:UI 允许选,但提示 "Audit logs older than 90 days are pruned by retention policy. Earliest available: 2026-02-12."
- **Concurrent edit on saved filter**:V1 saved filters 是 per-user 的(不是 tenant 共享),无冲突
- **export 中网络断开**:下载失败,UI 显示 "Export interrupted · [Retry]"
- **deleted user 在 audit 中**:actor_label 冗余字段保留显示名;Sheet "Actor"行显示"(former)"标签
- **deleted agent 在 audit 中**:同上 — agent_label 冗余;Sheet 显示 "(revoked agent)"
- **Cron 自身的 audit**:`cron.cleanup` / `cron.audit_truncate` 等系统事件正常显示;actor=System
- **WS 实时(V1.5)的优雅降级**:V1 不开 SSE,所有 audit 看到的是首屏快照;refresh 可拿最新

---

## 8. 开放问题

- **保留期 90 天**:够吗?V1 = 90 天。合规严格的 tenant 可能要 1 年。**决策**:V1 = 90 天硬编码;V1.5 加 admin 配置(30 / 90 / 365 / forever),计费时区分。
- **Real-time append**:V1 暂不做,V1.5 加 SSE。
- **Member 可见 own events?** V1 = 不可见,V1.5 = admin 可 toggle "Members can see own actions".
- **完整性保护**:V1 不防 admin 改 audit 表。**决策**:V1 接受这个风险(audit 表通过 admin 删除不便利);V1.5 上 append-only + 链式 hash。
- **CSV row 上限**:V1 = 10k。**决策**:够审查用;更大场景用 V1.5 异步 export(POST → job_id → download)。
- **审查 agent 的"思考过程"**:不只看 message 结果,也想看 agent 当时的 chain-of-thought。**决策**:V1 audit_log 不存 prompt + completion(隐私 + 大小)。skill_runs 表(V1 空)预留;后续随 skill execution engine 一起落地。
- **deep link 长度**:`/audit?kind=...&actor=...&from=...` 可能超 URL 长度限制(2K)。**决策**:V1 接受;V1.5 用 saved filter id 替代长 URL。
- **CSV 字符串内的逗号 / 换行**:RFC 4180 standard escaping。**决策**:V1 按标准实现。
