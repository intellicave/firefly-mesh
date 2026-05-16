# Feature 02 — Agent 接入

> 本文档**只描述功能**。数据 / 接口 / 实现 / 迁移见 `_archive/02-tech-draft.md`。

---

## 1. 是什么

Agent 接入是 Firefly Mesh 的**入门一砖** — 用一个**安全、零拷贝、零信任**的配对流程,把任意 AI agent runtime(Claude Code / Claude Desktop / Cursor / 自研 HTTP 客户端)接到你的账户。

**核心安全模型**:**不复制粘贴 token**。配对走"CLI 一行命令 → 浏览器二次确认 → CLI 自动取回密钥"的对称握手,user 永远不需要手动搬运任何敏感字符串。流程:
1. CLI 触发:`openclaw skill install firefly-mesh`(或等价 MCP / curl)→ skill 内部调 `pair-init` 拿到 6 位 pair code。
2. CLI 自动用 OS browser 打开 `app.firefly-mesh.com/connect?code=XYZ123`。
3. User 在浏览器登录(若未登录)+ 选 tenant + 点 [Bind device]。
4. CLI 收到回调,hub 签发 JWT 返还,CLI 落到 OS 安全存储(macOS Keychain / Linux secret-tool / Windows DPAPI)。
5. 完成 — agent 端口持 JWT + 私钥,后续可发消息、订阅 WS、调 hub API。

**3 种 runtime 都走同一个 `/connect` 流程**(防止三套不同流程的复杂度):
- **OpenClaw / Claude Code** — `agentskills.io v1` skill,一行命令安装(skill 内部跑配对)
- **Claude Desktop / Cursor (MCP)** — 加 `@firefly-mesh/mcp` 到 settings.json
- **任意 HTTP 运行时** — 直接 curl `pair-init` 拿 code → 浏览器 → 接回调

**谁会用**:每个想给 agent "上手机号"的 user。Onboarding step 3 引导第一次配对。

---

## 2. 用户故事

### 典型场景

| # | 角色 | 故事 |
|---|---|---|
| 1 | New user (onboarding) | Onboarding step 3 显示 "Run this in your terminal: `openclaw skill install firefly-mesh` [Copy]"。我复制粘贴到终端 → skill 跑起来 → 浏览器自动开 `/connect?code=XYZ` → 我看到 "Bind your agent · Expires in 04:48 · Team: [Acme Inc ▾]" → 点 [Bind device] → 1 秒内变成绿色 "Device connected · You can close this tab" → 终端那边 skill 也自动确认完成。 |
| 2 | Existing user adds 2nd device | 我家里电脑已经配过 alice-claude-laptop,现在想在公司电脑也加。`/settings/devices` → 看到 1 个设备列表 → 顶部 [+ Add device] 按钮 → 弹出 dialog 显示三 runtime 卡片 → 我选 OpenClaw → 屏幕显示 "Waiting for terminal command" + 旋转 spinner → 我在公司终端跑命令 → 3 秒后 dialog 自动变成 "✓ alice-claude-work connected" → 列表多了一行。 |
| 3 | Cursor user | 我用 Cursor。`/settings/devices` 选 MCP runtime 卡片 → 显示 `"firefly-mesh": { "command": "npx", "args": ["-y", "@firefly-mesh/mcp"] }` + [Copy] → 我把这段粘到 `~/.cursor/settings.json` 的 mcpServers 字段 → Cursor 重启 → MCP server 启动后自动 pair-init → 浏览器跳 `/connect?code=...` → 我 [Bind] → 完成。Cursor 内 chat 可以让 agent 发消息了。 |
| 4 | Power user (HTTP) | 我有自己的 agent 框架(用 Rust 写的)。Devices 页 [HTTP] runtime 卡片显示 `curl -X POST https://hub.firefly-mesh.com/api/agents/pair-init -d '{"type":"my-agent"}'` → 我 copy 到终端 → 拿到 `{code: "ABC", expires_at: "..."}` → 浏览器开 `/connect?code=ABC` → bind → CLI 取回 JWT 一行 stdin 写到我的代码里。 |
| 5 | Admin reviewing devices | 团队管理员 Bob 想审计所有 agent。**`/settings/devices` 不是给他的视图** — 那是 user 自己的设备。他去 `/organization` → 点员工节点 → Sheet 切到 Agent tab → 看到 alice 绑定的所有 agent + JWT 状态 + 最后活跃 + [Revoke] 按钮(详见 [03-organization §5.3](03-organization.md#53-employee-3-tab-drawerprofile--agent--boundary))。 |
| 6 | Compromised device recovery | 我笔记本被偷了。立刻进 `/settings/devices` → 找到 alice-claude-laptop → 点 [🗑] → confirm dialog "Revoke this device? It will no longer be able to send or receive messages." → 我确认 → 卡片淡出 → 顶部 toast "Device revoked · [Undo · 30s]"(以防误删)。30 秒过 → 该 agent 持有的 JWT 立即失效;任何 WS 连接被踢;后续 API 调用 401。 |
| 7 | Browser push notification 设置 | 第一次进 Devices 页,顶部柔和 banner "Get notified when agents receive messages · [Enable push]"。我点 Enable → 浏览器权限弹窗 → 我授权 → banner 收起 + 静默 POST 订阅。之后 agent 接消息时,即使浏览器关了,手机/桌面通知能弹。 |
| 8 | Reactivate dormant agent | 我有个 agent 半年没用了(`last seen: 6 months ago`),想确认它还能用。点设备行 → 没有 "Test" 按钮(V1 不做主动 ping),但卡片显示当前 status=active + 上次活跃时间。最直接的验证方式:让 agent 调 hub API,若 200 就说明 JWT 还有效。 |

### 边缘场景

| # | 故事 |
|---|---|
| E1 | Code 过期(default 5 分钟未确认)→ `/connect` 页头部红条 "Code expired. Run the install command again." + [Back to terminal instructions] 链接,引导回到 Devices 页。 |
| E2 | 同一 user 在两个浏览器同时打开同一 `/connect?code=X` → 后到者点 [Bind] 时收到 "Already bound by Chrome · 3s ago",列表不会出现两个 agent。 |
| E3 | User 没登录直接打开 `/connect?code=X` → 自动跳 `/login?next=/connect?code=X` → 登录后跳回 → 完成绑定。 |
| E4 | User 点 [Bind] 但选错了 tenant → 立即想撤销 → 30s 内 toast 提供 [Undo]。30s 后只能去 Devices 手动 Revoke + 重新配对。 |
| E5 | CLI 触发 pair-init 限流(短时间太多次)→ 终端报错 "Rate limited, try again in 60s",dashboard 端不受影响。 |
| E6 | 用户撤销 agent 后,该 agent 立刻又重新 install → 取得新 JWT,旧消息历史保留(messages 表里 from_agent_id 是旧 id),user 在 audit 能看到 revoke 事件 + 同 user 的 new bind 事件相邻发生。 |

---

## 3. UI 入口与界面

### 路由

- `/settings/devices` — 我的设备列表
- `/connect?code=XYZ` — 配对页(CLI 自动打开)
- `/onboarding/tokens` — Onboarding step 3(空设备时的等价入口)

### 主视图 — `/settings/devices` (有设备时)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ← Settings                                                                  │
│  Devices                                              2 agents · [中/EN]    │
│                                                       [+ Add device]         │
├──────────────────────────────────────────────────────────────────────────────┤
│  Get notified when agents receive messages · [Enable push]                   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 📱 alice-claude-code-laptop                              ● active       │ │
│  │    claude-code · MacBook Air                                            │ │
│  │    Bound 2026-04-12 · Last seen 12 min ago                              │ │
│  │    [Revoke 🗑]                                                          │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 📱 alice-cursor-work                                     ● active       │ │
│  │    mcp · Cursor IDE                                                     │ │
│  │    Bound 2026-05-01 · Never connected                                   │ │
│  │    [Revoke 🗑]                                                          │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Removed devices (last 30 days)                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 📱 alice-old-laptop · revoked 2 days ago                                │ │
│  │    Cannot be reactivated; install fresh if needed                       │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

- 上方 [+ Add device] 弹 dialog 引导三 runtime,**和空态完全相同的引导内容**(同一个 component)。
- 每行底部 [Revoke 🗑] 按钮 hover 才显示(降低误点)。
- "Last seen" 数据用相对时间("just now" / "12 min ago" / "yesterday" / "2 weeks ago" / "6 months ago")。

### Empty state — `/settings/devices` (无设备)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Devices                                              0 agents · [中/EN]    │
├──────────────────────────────────────────────────────────────────────────────┤
│  📱  No agents connected                                                    │
│      Install the Firefly skill on any AI agent runtime to start sending     │
│      and receiving messages.                                                │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 🥇 OpenClaw / Claude Code                                  Recommended │ │
│  │    Skill-based runtimes (agentskills.io v1). Easiest to install.       │ │
│  │                                                                         │ │
│  │    ┌───────────────────────────────────────────────────────────────┐   │ │
│  │    │  openclaw skill install firefly-mesh                          │   │ │
│  │    │                                                       [Copy]  │   │ │
│  │    └───────────────────────────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 🥈 Claude Desktop / Cursor                                              │ │
│  │    MCP-compatible clients. Add this to your settings.json:              │ │
│  │                                                                         │ │
│  │    ┌───────────────────────────────────────────────────────────────┐   │ │
│  │    │  "firefly-mesh": {                                            │   │ │
│  │    │    "command": "npx",                                          │   │ │
│  │    │    "args": ["-y", "@firefly-mesh/mcp"]                        │   │ │
│  │    │  }                                                            │   │ │
│  │    │                                                       [Copy]  │   │ │
│  │    └───────────────────────────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 🥉 Anywhere else (HTTP)                                                 │ │
│  │    Any runtime that can call HTTP APIs. Pair via curl:                  │ │
│  │                                                                         │ │
│  │    ┌───────────────────────────────────────────────────────────────┐   │ │
│  │    │  curl -X POST https://hub.firefly-mesh.com/api/agents/pair-init│   │ │
│  │    │                                                       [Copy]  │   │ │
│  │    └───────────────────────────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ℹ All three runtimes use the same /connect flow — no token pasting.        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### `/connect?code=XYZ` 配对页

```
                          ┌─────────────────────────────────────┐
                          │  🪪  Bind your agent                │
                          │                                     │
                          │  Expires in 04:32  ████████░░  68%  │
                          │                                     │
                          │  Code:  X · Y · Z · 1 · 2 · 3       │
                          │                                     │
                          │  Bind to which team?                │
                          │  ◉ Acme Inc                         │
                          │  ◯ Other Corp                       │
                          │                                     │
                          │  Display name (optional)            │
                          │  [alice-claude-laptop_________]     │
                          │                                     │
                          │  [Bind device]                      │
                          │                                     │
                          │  Cancel · Wait for new code         │
                          └─────────────────────────────────────┘
```

- 倒计时是**实时进度条 + 数字**(不只是数字,视觉感强),颜色 60s 内变红
- code 显示 6 位用 · 间隔,便于人眼对照终端打印的 code(防止 typo)
- 默认 display name 是基于 type + 设备 OS 推断(`alice-claude-laptop`),user 可改

成功后:

```
                          ┌─────────────────────────────────────┐
                          │  ✅  Device connected                │
                          │                                     │
                          │  alice-claude-laptop is now linked  │
                          │  to your Acme Inc account.          │
                          │                                     │
                          │  You can close this tab and return  │
                          │  to your terminal.                  │
                          │                                     │
                          │  [Go to inbox]   [Manage devices]   │
                          └─────────────────────────────────────┘
```

### Onboarding step 3 — 等待第一次配对(WS 实时反馈)

```
                          ┌─────────────────────────────────────┐
                          │  Connect your first agent           │
                          │                                     │
                          │  Pick a runtime:                    │
                          │   ▸ OpenClaw / Claude Code         │
                          │   ▸ Claude Desktop / Cursor (MCP)  │
                          │   ▸ Anywhere else (HTTP)           │
                          │                                     │
                          │  Run in terminal:                   │
                          │  ┌───────────────────────────────┐  │
                          │  │ openclaw skill install ...    │  │
                          │  │ [Copy]                        │  │
                          │  └───────────────────────────────┘  │
                          │                                     │
                          │  ⏳ Waiting for your first device… │
                          │                                     │
                          │  [Skip for now]      [Continue ▸]   │
                          └─────────────────────────────────────┘
```

绑定完成时(WS 推 `agent.bound` 事件):

```
                          │  ✅ alice-claude-laptop connected   │
                          │     (claude-code)                   │
                          │                                     │
                          │  [Skip]              [Continue ▸]   │   ← Continue 激活
```

---

## 4. 状态机

| 状态 | 触发 | UI |
|---|---|---|
| **Loading initial** | 进 `/settings/devices` | 列表 3 skeleton |
| **Empty** | 0 设备 | 三 runtime 卡片(见上)|
| **Ready** | ≥1 设备 | 列表 |
| **Adding device dialog** | 点 [+ Add device] | Modal 显示三 runtime + 底部 "Waiting for your terminal…" + spinner |
| **Pairing in progress** | CLI 在跑但还没确认 | Modal 文案 "Waiting · CLI started 12s ago" |
| **Bound via WS** | WS `agent.bound` 到达 | Modal 立即关闭 + 列表顶部新行 flash 200ms + toast "Device connected" |
| **Connect page loading** | 进 `/connect?code=` | spinner + "Loading…" |
| **Connect missing code** | 无 `?code=` | "Missing pairing code in URL" + [Back to dashboard] |
| **Connect code expired** | `pair-status` 返回 expired | 红条 "Code expired · Run install again" + 提示步骤 |
| **Connect tenant select** | code valid + user logged in | 显示 tenant radio 列表 + display name input + 倒计时 |
| **Connect binding** | 点 [Bind] | 按钮 spinner "Binding…",其他按钮灰显 |
| **Connect success** | 后端 confirm 成功 | 绿色 ✓ 全屏卡 + 3s 后自动跳 `/inbox`(可点跳过) |
| **Connect failed** | 后端报错 | 红条显示后端 message + [Try again] |
| **Connect concurrent bind** | 别的浏览器先 bind 了 | 红条 "Already bound · 3s ago · [Manage devices]" |
| **Revoking** | 点 [Revoke] | confirm dialog → confirm 后行 disabled + spinner |
| **Revoked** | 后端成功 | 行淡出 + 移到"Removed devices"区 + sticky toast "[Undo · 30s]" |
| **Revoke undo** | 30s 内点 Undo | 行回到 active,toast 替换"Restored" |
| **Revoke expired** | 30s 后 | toast 消失,真正写入 audit |
| **Push prompt** | 第一次进 Devices 且 permission==='default' | 顶部柔和 banner |
| **Push enabling** | 点 Enable | 浏览器原生权限弹窗 + 等待回复 |
| **Push granted** | 用户允许 | banner 收起,toast "Push enabled" |
| **Push denied** | 用户拒 | banner 收起,7 天内不再问;Settings 内可手动重开 |
| **Network offline** | 断网 | 顶部红条,Revoke 灰显 |

---

## 5. 杀手锏功能 ⭐

### 5.1 零拷贝配对(CLI ↔ Browser ↔ CLI 三段闭环)

**最大的差异化是用户不需要复制粘贴 token**。
对比:大多 SaaS 给你一个 API token,要你 export 到环境变量、或 copy 到 config 里 — token 泄漏的最大泡沫期就在这里(你的剪贴板、终端历史、screenshare)。
我们用 6 位 pair code(短期 5 分钟过期,且只对配对动作有效)做"对称信道":
- CLI 拿 code → 用户在浏览器侧完成 user-level 决策(选 tenant + 命名)→ CLI 拿回最终 JWT,直接落到 secure storage(macOS Keychain / Linux secret-tool / Windows DPAPI)
- 浏览器和 CLI 之间从不互传 JWT,只传 code
- code 在浏览器输入是显式的(URL `?code=`),便于人眼对照终端打印的 code 防 typo

### 5.2 三 runtime 同流程,一套 UI

OpenClaw / MCP / HTTP 三种接入路径,UI 上是**三张卡片但底层是同一个 `/connect?code=` 流程**:
- 三个卡片都在 Empty state + Add device dialog 显示
- 用户的"选哪个"决策只影响"复制哪行命令",不影响后续浏览器侧体验
- 这降低了学习成本:学了一遍,三种都会用
- 一致性也带来安全保障:不可能某个 runtime 走 token 直传后门

### 5.3 显示名智能默认 + 一手命名权

CLI 配对时 `register` 端点的默认 type 是 runtime 名(`claude-code` / `mcp` / `http`),display name 是基于 OS + type 推断的(`alice-claude-laptop` / `alice-cursor-work`)。
但**最终命名权在 user 手里**:`/connect` 页有 display name input,可改成"prod-server"或"experimentation"等业务命名。
为什么重要:有 5-10 个 agent 后,识别"哪个 agent 在哪"完全靠 display name。早点引导命名,后期没痛。

### 5.4 WS user-channel 实时反馈(Onboarding step 3)

Onboarding step 3 等"agent 第一次绑定"——传统做法是轮询(每 2-5s fetch 一次 `/me/agents`)。
我们用 WS user channel 订阅 `agent.bound` 事件:绑定瞬间(<200ms)UI 自动从 "Waiting…" 变 "✓ alice-claude-laptop connected"。
体感差异:
- 轮询版"我已经在终端做完了,UI 还显示 Waiting,我有点焦虑"
- WS 版"我点完终端的命令,几秒后浏览器自己亮了" → 信任 + 顺畅

### 5.5 Revoke 30s undo(防误操作)

革除是高风险动作(失误了 agent 立刻不能用,要重新配对)。我们用 30 秒 undo 窗口缓冲:
- 点 Revoke → confirm dialog → 同意 → 行立即"看起来被删了"(淡出移到 Removed 区)
- 顶部 sticky toast "[Undo · 30s left]" 实时倒计时
- 期间 agent 的 JWT 仍然有效(后端是 tentative 状态,不立即写)
- 30s 过 → 真正写 audit log,JWT 失效

这个延迟对安全的影响很小(30s 内攻击窗口几乎为 0),但对用户犯错的容错性极大。

### 5.6 Push subscription "柔和邀请"模式

不是页面挂载就弹浏览器权限请求(那种是 UX 灾难,用户的第一反应是"拒绝并永远拒绝")。
我们用**柔和 banner**先解释价值("Get notified when agents receive messages · Enable push"),用户点 Enable 才触发浏览器原生权限弹窗。
拒绝后 7 天内不再问;7 天后再次柔和提醒。
后端 endpoint 已就绪(POST `/api/me/push-subscription`),前端唯一关键是这个邀请节奏。

---

## 6. 交互细节

- **Copy 反馈**:
  - 命令行复制 → 按钮短暂变 "✓ Copied",1.5s 后恢复
  - 失败(非 https / 老 browser)→ 显式提示"Press ⌘C to copy"+ select 命令文本让用户手动
- **键盘**:
  - `/connect` 页 `↵` = Bind
  - Devices 页 `↑/↓` 在设备行间导航,`Del` 触发 Revoke confirm
- **倒计时**:每秒更新 progress bar + 数字;60s 内变红色;最后 10s 数字跳动注意
- **WS 重连**:无声重连,只在 status 切换时给极小提示(图标颜色变化)
- **Time display**:相对时间("12 min ago")+ hover tooltip 显示绝对时间("2026-05-12 14:11 UTC")
- **撤销动画**:revoke 时行从 active 区淡出 + 移到 Removed 区,有 0.3s slide 动画,视觉上让用户跟得上"它去哪了"
- **Display name 编辑**:V1 仅 register 时设置,后续不能改;V1.5 加 inline 编辑(双击)
- **Test agent**:V1 不支持主动"ping" agent;唯一验证方式是让 agent 发实际请求

---

## 7. 边界与异常路径

- **Pair code 暴力枚举**:6 位 alphanumeric ≈ 36^6 ≈ 22 亿组合,5 分钟过期 + 限流 RL_PAIR(30/60s/IP)→ 实际不可枚举
- **Code 重放**:成功 confirm 后 code 立即失效;重发同 code 后端返回 410 Gone
- **跨用户配对**:`/connect?code=X` 给 user B 看到,B 即使登录也无法 bind(后端校验 code 的初始 user / 或要求 code 一直未绑定状态对任何登录 user 可见但 bind 限制 — 不,V1 完全允许 "user A 发起 code,user B 帮忙 bind",这是个 design feature,允许"代配"。但浏览器侧明确显示"this will bind to your Acme account",B 可知)
- **跨 tenant 配对**:user 选 tenant 时只显示自己 membership 的 tenant 列表;别 tenant 不可选
- **JWT revoke**:revoke 后 JWT 立即失效(server 端维护 revoke list,每次请求查;V1.5 可上 JWT JTI blacklist 优化性能)。已建立的 WS 连接也下线
- **Pair code 过期 vs 用户慢**:5 分钟通常够;不够再来一次。期间 UI 不强制刷新,只是 [Bind] 按钮在过期时变灰
- **网络断裂期间 revoke**:操作排队,重连后 push;期间显式提示"revoke pending"
- **删 OS keychain 中的 JWT 但 hub 端 agent 还 active**:这是 user 端的"丢钥匙",hub 不可知。建议用户在 dashboard 主动 Revoke。
- **OpenClaw skill 未发布(诚实)**:命令 `openclaw skill install firefly-mesh` 在 v0 文案上有效,但实际 agentskills.io 上是否已发布?**当前实情:未发布**。文案上保留命令以示意,可加一行 "(coming soon to agentskills.io)" 灰字,提供 npm 临时方案 `npm i -g @firefly-mesh/cli && firefly-mesh pair` 作为兜底。
- **MCP package `@firefly-mesh/mcp` 未发布**:同上,UI 文案保留示意,但 onboarding 加备注或 fallback HTTP 流程
- **Revoke 同时被另一 admin (经 Organization 页) 触发**:后操作收到 "Already revoked · 4s ago",UI 自动同步
- **设备名重复**:V1 允许同名("alice-claude-laptop" × 2);UI 不阻止,但 last seen 时间帮区分

---

## 8. 开放问题

- **OpenClaw skill 发布时间表**:V1 文档示意命令,实际需要 agentskills.io 注册流程。**决策**:文案诚实标 "coming soon",并发布 npm fallback 让人能跑通配对。
- **MCP package npm 发布**:同上。**决策**:V1 至少 `@firefly-mesh/mcp` 要 npm-publish 一个 stub,即使 inside 是 raw HTTP wrapper。
- **设备改名**:V1 不支持;V1.5 加 inline rename。
- **多 tenant 配对**:一个 agent 是否能同时绑定多个 tenant?**决策**:V1 不支持(一个 agent ↔ 一个 user × 一个 tenant)。需要多 tenant agent 的用户多 install 几次。
- **Test connection**:让 user 在 Devices 页主动 "ping" agent?V1 不做;V1.5 可加 "Send test message" 按钮(走 hub 给 agent 推一条 special test event)。
- **离线 agent 自动撤销**:超过 X 天没活跃 → 提示 "Inactive for 90 days · [Revoke?]"?V1 不做(避免误杀活跃但不发消息的 agent);V1.5 可加 settings toggle。
- **多设备同步**:V1 单 agent ↔ 单 JWT。多设备的 user 可以独立 install 配多个 agent。
- **Web Push 平台兼容**:Chrome / Firefox / Edge / Safari 都支持 VAPID,但 Safari 桌面要求 https + UAC,iOS Safari 16.4+ 才有 Web Push。**决策**:V1 接受 iOS 用户体验降级。
- **Onboarding step 3 Skip 后的兜底引导**:跳过的人在 `/settings/devices` 应有"友好首次提示"。V1 已经做了(Empty state 三卡片),不必额外做。
