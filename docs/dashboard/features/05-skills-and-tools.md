# Feature 05 — 技能与工具

> 本文档**只描述功能**。数据 / 接口 / 实现 / 迁移见 `_archive/05-tech-draft.md`。

---

## 1. 是什么

Skills 是 Firefly Mesh 的**能力侧大脑** — 让 admin 定义"agent 能做什么、什么时候做、用什么模型做、能调哪些外部工具"。

3 个抽象:
- **Tool** — 一个 agent 可调用的"外部能力":HTTP API / MCP server / native(平台内置)。每个 tool 有 endpoint + JSON Schema(描述参数)+ auth(token 加密存储)。例:`notion_search` / `hubspot_create_lead` / `slack_send`。
- **Skill** — 一组 tool + 一段 system prompt + 一组 boundary + 触发器(triggers),组成一个"任务 preset"。例:**"Customer support triage"** skill = `notion_search` + `hubspot_lookup` + 客服话术 system prompt + Boundary "Public only" + 触发器 "subject contains 'support'"。
- **Router** — LLM 路由规则。按关键词 / agent_id / message kind 决定用哪个模型(claude-sonnet / claude-haiku / 第三方等),priority 决定生效顺序。

**V1 范围限定**:**只做管理面板,不做执行引擎**。Skill 配好之后,agent 还不会自己跑——执行引擎是下一阶段的事。
这一条**必须在 UI 上诚实告知**(顶部 banner),避免用户误以为"配好就跑了"。

**谁会用**:
- **Owner / Admin** 全部读写
- **Member** 只读(避免配置被随便改;一旦配错 agent 行为偏离)

---

## 2. 用户故事

### 典型场景

| # | 角色 | 故事 |
|---|---|---|
| 1 | Sales lead | 我想配一个 "outreach triage" skill 让 agent 自动审找上门的潜在客户。`/skills` → [+ New skill] → 选模板 "Sales outreach"(预填 system prompt + tools)→ 我改了几句 prompt → 选 boundary "Sales access" → 加 trigger "keyword: 'partnership'" → Save → skill 出现在列表,标 "Active" — 顶部 banner 提醒我"Saved · execution engine coming later"。 |
| 2 | Engineering manager | 我想注册 Notion 搜索作为 tool。Tools tab → [+ Tool] → type=HTTP,endpoint `https://api.notion.com/v1/search`,粘 JSON Schema(参数 query / page_size),auth=Bearer + 输入 token → [Test connection] → 返回 ✓ 200 OK → Save → token 立即加密,UI 显示 `••••••12ab [Replace]`。 |
| 3 | Admin | 我要让代码相关任务都走 sonnet,总结类走 haiku。Router tab → [+ Rule] → pattern `rx:\b(code|debug|refactor)\b` + model `claude-sonnet-4-6` + priority 10 → Save → 再加 `rx:\b(summarize|tldr)\b` + model `claude-haiku-4-5` + priority 20 → 列表顶部出现两行,**可拖拽改顺序**(改 priority)。 |
| 4 | Admin | 我想暂停一个 skill,但保留配置。Skills tab → 找到 "Q3 sales outreach" → Sheet 内 Status 改 Disabled → Save → 卡片立即灰显,顶部加 [Disabled] 徽标 → 列表过滤 "Active only" 时不出现。 |
| 5 | New admin | 我对这套抽象一头雾水。Skills tab 空态显示 3 个**预设模板卡**:Customer support triage / Sales outreach / Research helper → 点 Customer support triage → 进入 Sheet,字段全部预填(prompt 例子+tools+boundary)→ 我看着改改 → Save → 体感"会用了"。 |
| 6 | Admin | 注册的 Slack tool 突然失败。Tools tab 列表中 slack_send 行 Status 列变红色 "Error" → 点行 Sheet 头部红条 "Last test: 401 Unauthorized · 2h ago" + [Re-test] / [Re-auth] 按钮 → 我点 [Replace token] → 输入新 token → [Test] → ✓ → 状态回 Active。 |
| 7 | Admin | 我想看 skill 历史触发记录(V1 表是空的)。Sheet 内 Recent runs tab → 显示空态"No execution data yet · The execution engine is in development" + 灰色说明,不假装有数据。 |

### 边缘场景

| # | 故事 |
|---|---|
| E1 | 我在 Tool dialog 粘了一个非法 JSON Schema(语法错)→ schema editor 实时 lint,行号红色波浪线,Save 灰显;hover 出 tooltip "Invalid: missing required property 'type'"。 |
| E2 | 我配了 skill A 引用了 tool X,然后我去 tools 删 X → 弹 confirm "Tool 'notion_search' is used by 2 skills: Customer support triage, Research helper. Delete anyway? They will have a broken tool reference."—— 让我清楚后果。删除后回 skill 列表,affected skills 行加红色 ⚠ "broken tool reference"。 |
| E3 | Router 规则一个都没配 → agent 默认用 hub 的全局默认 model。UI 顶部柔和提示 "No router rules · agents will use default model (claude-sonnet-4-6)"。 |
| E4 | 两个 admin 同时拖拽改 router priority → 后操作者收到 "Charlie reordered rules 4s ago · [Refresh] [Override]"。 |
| E5 | 在 skill 编辑器,system prompt 长度超过 16KB → 字数计数器变红 "16,341 / 16,000 — too long, please shorten",Save 灰显。 |

---

## 3. UI 入口与界面

### 路由

- `/skills` — 默认 Skills tab
- `/skills?tab=tools` — Tools tab
- `/skills?tab=router` — Router tab

### 主视图 — Skills tab

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Skills                                              ⌘K Search…  中/EN      │
│  [Skills 5]  [Tools 8]  [Router 2]                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│  ℹ Skill execution is coming — configs are saved but not triggered yet      │
│                                                                              │
│  [+ New skill ▾]  ◯ Active   ◯ Disabled              Filter: [All depts ▾] │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 🔧 Q3 sales outreach                                  [Active]          │ │
│  │    Triggers: keyword "partnership"                                      │ │
│  │    3 tools · 2 boundaries · model: auto                                 │ │
│  │    Last edited 2d ago by Alice K                                        │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 🔧 Customer support triage                            [Active]          │ │
│  │    Triggers: keyword "support" OR sender=external                       │ │
│  │    2 tools · 1 boundary · model: claude-haiku-4-5                       │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 🔧 Research helper                                    [Disabled]        │ │
│  │    (grayed) 4 tools · 3 boundaries · model: auto                        │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **顶部"execution coming" 提示条**永远在,提醒用户"配好不等于在跑"(诚实交付)
- 列表卡片紧凑信息密度:名称 + 状态 + 触发器 + 数量信息 + last edited
- [+ New skill ▾] 下拉菜单:`Blank` / `From template ▸ Customer support / Sales outreach / Research helper`

### Skills 空态 — 3 个预设模板

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                Start with a template or create from scratch                  │
│                                                                              │
│   ┌──────────────────────────────────┐  ┌──────────────────────────────────┐│
│   │ 🎧 Customer support triage       │  │ 💼 Sales outreach                ││
│   │                                  │  │                                  ││
│   │ Filter, summarize, and route     │  │ Find similar customers in CRM,   ││
│   │ inbound customer questions.      │  │ draft personalized follow-ups.   ││
│   │                                  │  │                                  ││
│   │ Tools: notion_search, ticket_get │  │ Tools: hubspot_lookup, slack_send││
│   │                                  │  │                                  ││
│   │ [Use this template]              │  │ [Use this template]              ││
│   └──────────────────────────────────┘  └──────────────────────────────────┘│
│                                                                              │
│   ┌──────────────────────────────────┐  ┌──────────────────────────────────┐│
│   │ 🔬 Research helper               │  │ ✨ Start blank                   ││
│   │                                  │  │                                  ││
│   │ Search internal docs + web,      │  │ Empty skill — you control every  ││
│   │ summarize findings, cite sources │  │ field.                           ││
│   │                                  │  │                                  ││
│   │ Tools: web_search, knowledge_get │  │ [Create]                         ││
│   │                                  │  │                                  ││
│   │ [Use this template]              │  │                                  ││
│   └──────────────────────────────────┘  └──────────────────────────────────┘│
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Sheet — Skill editor

```
                ┌────────────────────────────────────────────┐
                │ ← Q3 sales outreach              [Active ▾]│
                │ [Overview] [Tools] [Boundaries] [Recent ↗] │
                ├────────────────────────────────────────────┤
                │ Overview                                   │
                │                                            │
                │ Name        [Q3 sales outreach__________]  │
                │ Description [Auto-respond to partnership ] │
                │                                            │
                │ System prompt                              │
                │ ┌──────────────────────────────────────┐   │
                │ │ You are a sales outreach agent for   │   │
                │ │ Acme Corp. When a new partnership    │   │
                │ │ inquiry arrives, ...                 │   │
                │ │ (12,400 / 16,000 chars)              │   │
                │ └──────────────────────────────────────┘   │
                │                                            │
                │ Triggers                                   │
                │   + keyword "partnership"           [✕]    │
                │   + sender domain ".com" (not gmail)[✕]    │
                │   [+ Add trigger ▾]                        │
                │                                            │
                │ Model preference                           │
                │   ◉ auto (let router decide)               │
                │   ◯ claude-sonnet-4-6                      │
                │   ◯ claude-haiku-4-5                       │
                │                                            │
                │ [Save changes]                  [Delete]   │
                └────────────────────────────────────────────┘

Tools tab inside skill:
                │ Tools (3 selected of 8)                    │
                │   ☑ notion_search       (HTTP, active)     │
                │   ☑ hubspot_create_lead (HTTP, active)     │
                │   ☐ slack_send          (MCP, error ⚠)     │
                │   ☐ web_search          (native)           │
                │   ...                                      │
                │                                            │
                │ [Manage tools ↗]                           │
```

### Tools tab

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  [Skills] [Tools 8] [Router]                                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│  [+ New tool ▾]  Filter: [All types ▾] [Active ▾]                            │
│                                                                              │
│  Name             Type     Endpoint                  Status      Used by    │
│  ──────────────────────────────────────────────────────────────────────────  │
│  notion_search    HTTP     api.notion.com/v1/...    ● Active    3 skills   │
│  hubspot_lookup   HTTP     api.hubspot.com/...      ● Active    2 skills   │
│  slack_send       MCP      @slack/mcp               ⚠ Error     1 skill    │
│  web_search       native   (built-in)               ● Active    4 skills   │
│  ...                                                                         │
└──────────────────────────────────────────────────────────────────────────────┘

点击行 → Sheet (Tool editor):
                  │ ← notion_search                          │
                  │                                          │
                  │ Display name [Notion search____________] │
                  │ Type         [HTTP ▾]                    │
                  │ Endpoint     [https://api.notion.com/...]│
                  │                                          │
                  │ Authentication                           │
                  │   Kind  [Bearer token ▾]                 │
                  │   Token ••••••12ab          [Replace]    │
                  │                                          │
                  │ JSON Schema (parameters)                 │
                  │ ┌──────────────────────────────────────┐ │
                  │ │ { "type": "object", "properties":    │ │
                  │ │   { "query": { "type": "string" },   │ │
                  │ │     "page_size": { "type": "number" }│ │
                  │ │   }, "required": ["query"] }         │ │
                  │ └──────────────────────────────────────┘ │
                  │ ↑ Monaco editor, real-time lint          │
                  │                                          │
                  │ [Test connection]   Last tested: ✓ 2h ago│
                  │                                          │
                  │ Used by: Customer triage, Sales outreach │
                  │                                          │
                  │ [Save]   [Disable]   [Delete]            │
```

### Router tab

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  [Skills] [Tools] [Router 4]                                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│  [+ Rule]   Tip: drag rows to reorder priority                               │
│                                                                              │
│  ⠿ Priority  Pattern                              Model                      │
│  ──────────────────────────────────────────────────────────────────────────  │
│  ⠿ 10       rx: \b(code|debug|refactor)\b        claude-sonnet-4-6   [✏][✕] │
│  ⠿ 20       kw: summarize                         claude-haiku-4-5    [✏][✕]│
│  ⠿ 30       agent_id: alice-claude                claude-opus-4-7     [✏][✕]│
│  ⠿ 99       (fallback — all messages)             claude-sonnet-4-6   [✏][✕]│
│                                                                              │
│  When a message arrives, rules are matched top-down. First match wins.       │
└──────────────────────────────────────────────────────────────────────────────┘
```

- ⠿ 拖动手柄,鼠标放上变 cursor: grab
- pattern 前缀 `rx:` 是 regex,`kw:` 是 case-insensitive substring,`agent_id:` 是直接匹配 sender agent ID
- 最低 priority(99)行加 "(fallback)" 灰色提示,让用户知道这条是兜底

---

## 4. 状态机

| 状态 | 触发 | UI |
|---|---|---|
| **Loading** | 进 `/skills` | 列表 4 skeleton 行 |
| **Empty** | 0 skills | 4 预设模板卡(见上)|
| **Ready** | 有 skills | 列表,Active 排前,Disabled 后 |
| **Skill active** | status=active | 卡片白底,左侧绿点 |
| **Skill disabled** | status=disabled | 卡片灰底,左侧灰点,标签 [Disabled] |
| **Skill 编辑** | 点卡片 | Sheet 滑入,Overview tab 默认 |
| **Skill 保存中** | Save | 按钮 spinner,Sheet 内字段灰显 |
| **Skill 保存成功** | Save 完成 | 卡片闪绿色 "Saved" 1s + Sheet 关闭(或保留) |
| **Skill 验证错误** | system_prompt 超长 / 必填空 / trigger 空 | 字段下红字提示,Save 灰显 |
| **Tool active** | 健康 | 列表 Status=● Active |
| **Tool error** | 最近 test 失败 / 上次调用错 | Status=⚠ Error 红色,卡片 Sheet 头部红条 |
| **Tool test in progress** | Test connection | 按钮 spinner,"Testing…" |
| **Tool test passed** | 200/204/404 | ✓ 绿色 + 时间戳 |
| **Tool test failed** | 4xx/5xx/timeout | ⚠ 红色 + 错误码 + Retry |
| **Tool replace token** | Replace 流程 | 老 token 末 4 位显示,输入新 token,Test 通过后 Save 才生效 |
| **Tool delete with refs** | 删被引用的 tool | Confirm 列出 affected skills + Delete anyway |
| **Router 拖拽中** | 抓 ⠿ 手柄 | 整行半透明跟随鼠标,其他行让位 |
| **Router 拖完保存** | 放下 | 立即写后端,priority 重排;失败时回滚原顺序 + 红 toast |
| **Router concurrent reorder** | 别人也在改 | toast "Charlie reordered 4s ago · [Refresh]" |
| **Schema editor lint** | Monaco | 行号波浪线,hover tooltip |
| **Permission denied (member)** | member 进页 | 整个 [+ New / Delete / Replace token] 按钮不渲染;仅可看 |
| **Network offline** | 网络断 | 顶部红条,Save 灰显 |
| **WS update (跨 admin)** | 别人改了同条 | 列表对应行 flash 黄色 200ms 提示"someone updated this" |

---

## 5. 杀手锏功能 ⭐

### 5.1 3 个预设模板(降低首次配置门槛)

新 admin 看到空 Skills 页常常不知"该建什么"。**3 预设模板覆盖最高频场景**:
- 🎧 Customer support triage(客服) — system prompt 已写好"友善 + 三步流程 + 必转人工的边界"
- 💼 Sales outreach — 含"自我介绍 + 不夸大 + cite 来源"
- 🔬 Research helper — "搜内部 + 验证 + 引用"

点 [Use this template] → Sheet 字段全预填 → admin 改 1-2 个字段即用。
**预设模板存前端硬编码**(不依赖后端),保证空 tenant 也能看到。后续可扩展为社区模板库。

### 5.2 Tool 一键测试 + 错误诊断

注册 tool 最大痛点是"配的对不对"。**Test connection** 给 admin 一个零成本验证途径:
- type=HTTP:发 HEAD 5s 超时;200/204 = ✓,401 = ⚠ "Token may be expired",404 = ⚠ "Endpoint not found",timeout = ⚠ "Endpoint did not respond"
- type=MCP:V1 不能 runtime 测,显示提示 "Cannot test MCP servers at design time. Will validate at execution."
- type=native:总是 ✓,native 内置

**Status 列 = 信任快照**:Tool 上次自动测的结果以 Active / Error 持久显示,让 admin 一眼看到哪些 tool 出问题。

### 5.3 Token 加密 + Replace 流程

Tool 经常需要 API token,**安全存储 + 友好操作**是关键:
- token 输入后立即客户端加密发送,服务端用 AES-256-GCM 二次加密落库
- UI 后续显示 `••••••12ab`(只显示后 4 位,便于 admin 与外部对照)
- 不允许直接读回明文 token(防止 admin 自查 = 攻击者攻破后可查)
- 改 token 走"Replace"流程:先 Test 新 token 通过,再 Save 写入(防止"改了一半把现状改坏")

### 5.4 拖拽改 Router 优先级(直觉建模)

Router 是"if-else 链"的可视化版。**拖拽 = 物理直觉**:把更紧急的 rule 拖到顶,自然就是优先级高。
比"输入 priority 数字"更易理解(数字小 = 优先?还是大 = 优先?容易记反)。
拖完立即持久化,失败时回滚原顺序,无中间态。

### 5.5 顶部诚实 banner: "Execution engine is coming"

很多 SaaS 产品避谈"还没完成的事"。我们反其道:**顶部永远显示提示 banner**,提醒"配好不等于在跑"。
为什么:
- 用户不会以为 "我配了 skill,agent 应该自动开始处理 inbox 了"
- 当用户问"为什么我的 skill 没触发?"时,我们有明确说明
- 信任源于诚实,小细节累积大信任

执行引擎落地后这条 banner 摘掉,不影响布局。

### 5.6 "Used by" 反向引用列

Tools tab 的最后一列显示"Used by: 3 skills"。点击数字 → 弹出 Popover 列出具体 skill,链接可点。
解决"我想删 X tool,但不知道有几个 skill 在用它"的常见焦虑。
同理 Skills tab 也可以反向显示"应用到几个 boundary",形成相互可追溯的图。

---

## 6. 交互细节

- **键盘**:
  - `⌘K` 全 page 搜索(skill 名 / tool 名 / 触发器 / model 名)
  - `n` 新建(skill / tool / rule)— 取决于当前 tab
  - `↑/↓` 列表导航,`↵` 进 Sheet,`Esc` 退出
  - Sheet 内 `⌘S` 保存,`Esc` 取消未保存的编辑(若有改动会 confirm)
- **拖拽**:
  - Router 行 ⠿ 手柄拖拽改顺序
  - Tool 列表 → 任意 skill 卡片:多选 tool 后,拖到 skill 卡片 → 弹"Add 3 tools to Q3 sales outreach? [Confirm]"
  - 暂未支持 skill 拖拽换序(skill 默认按 created_at)
- **Monaco editor**:
  - JSON Schema 编辑器实时 lint(用 ajv schema-for-schemas)
  - System prompt 编辑器字符计数 + soft limit 警告
  - `⌘/` 切注释 / 缩进等标准 IDE 快捷键
- **视觉反馈**:
  - Skill / Tool 状态切换时(active ↔ disabled)卡片 0.3s 渐变到对应底色
  - Test connection 成功后 ✓ 闪绿 0.5s,失败 ⚠ 闪红 0.5s
  - Router 拖动 reorder 完成后行短暂高亮 1s
- **复制**:
  - Skill 详情 ⋯ 菜单 "Copy as JSON"(把 system_prompt + tool_ids + triggers 导出 — 方便迁移 / 备份 / share)
  - Tool 配置 "Copy as cURL"(把 endpoint + headers 拼成 cURL 字符串,用户终端调试)
  - Router 规则 "Copy as YAML"
- **批量操作**:
  - Skills tab 多选(checkbox hover 显示)→ Bulk [Disable] / [Delete] / [Export]
  - Tools tab 同样

---

## 7. 边界与异常路径

- **跨 tenant**: URL 改 `tenantId` → 403,UI "Not found or no access"
- **Member 隐藏写动作**: 所有 [+] / [Edit] / [Delete] / [Replace token] 整体不渲染
- **删除被引用的 tool**: confirm 列出 affected skills + 删除后这些 skills 行加 ⚠ "broken tool reference",但 skill 本身保留(允许 admin 手动修)
- **System prompt 超长** (>16KB): 字符计数变红,Save 灰显;尝试粘贴超长内容也实时截断 + tooltip 提示
- **JSON Schema 非法**: Monaco editor 红色波浪线 + Save 灰显;非空但格式错时不允许 Save
- **Tool token 输入但 Test 失败**: Save 灰显 + 红条"Test must pass before saving"
- **Router 规则全部 disabled / 空**: 顶部柔和提示 "Using default model (claude-sonnet-4-6) for all messages"
- **并发改 Router 优先级**: 后者收到 toast,UI 自动 refresh
- **删 Skill 时引用的 Tool 还在**: 不联动删 Tool(Tool 独立资源)
- **Tool endpoint 失效**: 后端会定期 background test(V1 暂未做 — V1 仅手动 test),发现失败 → status=error,列表显示 ⚠
- **Test connection 频率限制**: 单个 tool 每分钟最多 10 次 test,防止 admin 反复点击触发 endpoint 限流
- **MCP type 无法测试**: V1 接受这个缺口,UI 文案 "Cannot test MCP at design time"
- **预设模板用了不存在的 tool**: 模板列表的 tools 都是建议名,新建 skill 时如果对应 tool 不存在,行变灰 + "Tool not registered yet · [Register now ↗]" 链接

---

## 8. 开放问题

- **"Execution coming" banner 何时摘掉**:执行引擎落地后。**决策**:不在本 V1 范围内决定。
- **预设模板能不能自定义**:V1 = 前端硬编码 3 个。**决策**:V1 不让用户保存模板;V1.5 可在 skill 列表加 [Save as template] 按钮。
- **Tool 的 Status 自动检测频率**:V1 仅手动 Test。**决策**:V1 不引入 cron 自动 health check;V1.5 加(每天 1 次)。
- **Router pattern DSL 扩展**:V1 = `rx:` / `kw:` / `agent_id:`。**决策**:V1 不加更多前缀(如 `domain:`、`time_window:`),够用即可。
- **Skill triggers AND vs OR**:V1 = OR(任一匹配即生效)。**决策**:V1 保持简单,V1.5 加 group with AND 操作符。
- **Skills 是否能被 tagged + filtered**:V1 = 只能 Active/Disabled + dept filter。**决策**:V1 不加 tag 系统,降低首次心智。
- **Recent runs tab 现在显示什么**: V1 = 显示空态 + 诚实说明。**决策**:不假装有数据(违反诚实 banner 原则)。
- **Tool secret 失效后的告警**:V1 仅在 Test 时报。**决策**:V1.5 可加 push 通知"Tool X failed last 5 calls"。
- **System prompt 多语言**:目前一份 prompt 写一种语言。**决策**:V1 admin 自行决定(prompt 内用中或英)。
