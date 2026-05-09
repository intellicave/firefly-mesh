# firefly-mesh edge — 系统设计（design）

> **输入**：[meta.md](2026-05-08-firefly-mesh-edge-meta.md) + [ideation.md](2026-05-08-firefly-mesh-edge-ideation.md)
> **输出**：5 层架构、数据模型、关键流程、部署 topology
> **下游**：[rules.md](2026-05-08-firefly-mesh-edge-rules.md) / [plan.md](2026-05-08-firefly-mesh-edge-plan.md) / `api.md`（下次会话）/ `ui.md`（下次会话）

---

## 1. 5 层架构总览

```
┌────────────────────────────────────────────────────────────────────┐
│ ⑤ 体验层  Experience                                              │
│    PWA Dashboard(Astro+React) + Web Push + Email digest          │
│    部署:Cloudflare Pages                                          │
├────────────────────────────────────────────────────────────────────┤
│ ④ 身份层  Identity                                                │
│    Better Auth(邮箱密码 + Google + GitHub + Apple OAuth)         │
│    + Device Pairing(skill 配对,OAuth Device Authorization 风)     │
│    部署:Cloudflare Workers + D1                                   │
├────────────────────────────────────────────────────────────────────┤
│ ③ 协议层  Protocol                                                │
│    Google A2A v1.0 wire format 完整实现                           │
│    + ed25519 签名 (@noble/ed25519, RFC 8785 canonicalize)         │
│    + skill→hub: HTTP 主路径（所有 runtime 含 MCP）+ WebSocket 可选│
│    + pwa→hub:   WebSocket 长连接（主路径）                        │
│    + 标准 A2A HTTP endpoint（兼容路径，给 enterprise / 调试）      │
├────────────────────────────────────────────────────────────────────┤
│ ② 投递层  Delivery                                                │
│    Durable Object（per-tenant hub）+ WebSocket（pwa 主路径）      │
│    + 端到端加密(X3DH 派生会话密钥 + AES-256-GCM)                  │
│    + store-and-forward(对方离线时持久化加密 blob)                 │
│    + Web Push 触发(hub → 接收方设备)                              │
│    部署:Cloudflare Durable Objects + D1                          │
├────────────────────────────────────────────────────────────────────┤
│ ① 基础层  Infrastructure                                          │
│    Cloudflare Workers / Durable Objects / D1 / R2 / Pages / Queues│
│    自部署版:Hono + Postgres + ws + Caddy(Docker Compose)         │
└────────────────────────────────────────────────────────────────────┘
```

### 1.1 跟 classic 的对应关系

| classic 的层 | edge 对应层 |
|---|---|
| packages/web Next.js dashboard | ⑤ 体验层 PWA |
| packages/web/api/auth | ④ 身份层 |
| packages/core/a2a/protocol.ts | ③ 协议层（保留 wire format zod schema） |
| packages/core/a2a/broker.ts (Postgres) | ② 投递层 (Durable Object) |
| Postgres + Drizzle | ① 基础层 D1 + Drizzle |

---

## 2. ② 投递层 —— 这是 edge 最大的架构创新

### 2.1 两类客户端，两种连接方式

edge 有两类客户端，连接方式不同，职责不同：

**Skill（packages/client）— 主路径是 HTTP**

skill 是被 LLM 按需调用的工具（`firefly.a2a.send`、`firefly.a2a.inbox`）。每次工具调用是一次无状态 HTTP 请求，做完即返回。这样做的理由：

1. **兼容所有 runtime**：MCP 客户端（Cursor、Claude Desktop）本身是无状态工具调用，没有持久进程能维持 WebSocket。HTTP 是唯一通用路径。
2. **无需常驻**：skill 不需要一直活着，hub 的 store-and-forward + Web Push 负责"用户不在时消息怎么到达"。
3. **简单可靠**：无状态 HTTP 天然幂等，重试逻辑简单，无连接生命周期管理。

WebSocket 是 skill 的**可选优化**：OpenClaw 等支持持久进程的 runtime 可以升级到 WebSocket，获得亚秒级双向推送。降级回 HTTP 时完全透明。

**PWA（浏览器）— 主路径是 WebSocket**

浏览器 dashboard 是长期打开的页面，WebSocket 用于实时 inbox 刷新。理由：

1. **NAT 友好**：客户端发起 outbound 连接，NAT 完全无影响。
2. **双向推送**：消息从 server 直接 push 到 PWA，不需要 polling。
3. **断线检测便宜**：TCP keepalive + WebSocket ping。

### 2.2 Durable Object 的角色

每个 **tenant**（团队）一个 Durable Object 实例：

- 持有该 tenant 内所有在线 agent 的 WebSocket 句柄（Map<agentId, WebSocket>）
- 路由 A2A 消息（接收方在线 → 直接 forward；离线 → 写 D1 持久化）
- 触发 Web Push（接收方离线时）
- 维护 thread / message metadata（不存内容）

**为什么 per-tenant 而不是 global**：
- 自动横向扩展（不同 tenant 的负载互不干扰）
- 单 DO 的状态机简单（只关心自己 tenant 的连接）
- 物理隔离（一个 tenant DO 出问题不影响别人）

### 2.3 DO Hibernation —— 成本关键

Cloudflare Durable Objects 支持 **Hibernation API**：当没有事件（消息、新连接）时，DO **冻结**，不计 GB-seconds。

收到事件 → 自动唤醒 → 处理 → 再冻结。

**这是 edge 能用免费档撑 ~2000 用户的根本原因**。详细计费在 [meta.md §3](2026-05-08-firefly-mesh-edge-meta.md#23-部署模型重了) + [plan.md §6](2026-05-08-firefly-mesh-edge-plan.md#6-免费档容量计算) 已算过。

### 2.4 投递语义

| 场景 | 行为 |
|---|---|
| 接收方在线（WebSocket 已连） | DO 直接 push 给接收方 socket。送达 ack 后从 buffer 删 |
| 接收方离线（无 WebSocket） | 写 D1 `pending_messages` 表，触发 Web Push。接收方上线时 fetch + ack + 删 |
| 接收方长期不上线 | 14 天 TTL，cron 扫描过期，删除 + 通知发送方 |
| 重复消息 | 客户端按 messageId 去重 |
| 消息顺序 | thread 内按 sequence number 严格保序，跨 thread 不保序 |
| WebSocket 断线 | 客户端重连 + resume from last seq；DO 重放 buffer |

**投递保证**：at-least-once（hub 不丢消息，但客户端要做去重）。

---

## 3. ③ 协议层 —— A2A v1.0 + 自定义 binding

### 3.1 wire format 不变（继承 classic + Google A2A 规范）

完整 A2A v1.0 信封（zod schema 在 `packages/proto/a2a-wire.ts`）：

```ts
{
  messageId:        UUID,
  threadId:         UUID,
  protocolVersion:  "1.2",  // 沿用 A2A v1.2 wire（Google 规范）
  timestamp:        ISO8601,
  sender:           { agentId, employeeId, employeeName, ... },
  receiver:         { agentId, employeeId },
  type:             "inform"|"sync"|"request"|"commit"|"handoff"|"escalate"|"block",
  content: {
    summary:    string,
    body?:      string,             // 端加密时 body=null,encrypted_payload 在外层
    structured?: Record<string, unknown>
  },
  approval:         { senderApproval... },
  action:           { receiverAction... },
  links:            { relatedTaskId?, relatedSopNodeId? },
  audit:            { confidenceScore? },
  signature:        base64,         // ed25519 over canonical body
}
```

### 3.2 端到端加密层（edge 新增）

`content.summary` 是**短摘要**（≤ 500 字符），可以**明文**让 hub 看到（用于 routing 和 push 通知预览）。

`content.body` + `content.structured` 是**详细内容**，必须**端加密**，wire 上的字段被替换为：

```ts
{
  ...
  content: {
    summary: "Alice asked you to add a webhook",  // 明文,hub 看得见
    encrypted: {
      ciphertext: base64,           // AES-256-GCM 加密 {body, structured}
      nonce:      base64,           // 12 字节
      ephemeral_pk: base64,         // 发送方临时 X25519 公钥
    }
  }
}
```

### 3.3 transport binding

A2A v1.0 spec 默认描述 HTTP POST binding。edge 按客户端类型选 transport：

#### HTTP binding（skill 主路径，所有 runtime 必须支持）

```
POST /api/messages
Body: <A2A envelope（JSON）>
Response: { messageId, status }
```

```
GET /api/messages/inbox?after=<lastSeq>
Response: { messages: [<A2A envelope>, ...], nextSeq }
```

幂等、无状态、天然兼容 MCP 工具调用模型。

#### WebSocket binding（PWA 主路径 + skill 可选优化）

**outbound（client → hub）**：
```
{ "op": "send", "envelope": <A2A envelope> }
```

**inbound（hub → client）**：
```
{ "op": "deliver", "envelope": <A2A envelope> }
```

**ack（client → hub）**：
```
{ "op": "ack", "messageId": "...", "lastSeq": 42 }
```

**心跳**：WebSocket ping/pong（30 秒一次）

**降级规则**：skill 首选 WebSocket（如果 runtime 支持持久进程）；不支持时自动降级到 HTTP。两种路径消息格式完全一致，hub 端无差别处理。

详细 endpoint 列表延后到 `api.md`。

### 3.4 兼容路径：标准 A2A HTTP endpoint

edge 同时暴露标准 A2A v1.0 HTTP endpoint：
- `POST /a2a/v1/sendMessage`
- `GET /.well-known/agent-card.json`（每个 user 一份）
- `POST /a2a/v1/sendMessageStream`（SSE）

**用途**：
1. 让标准 A2A 工具（如 Google ADK 调试器）能直连 edge
2. enterprise 自部署时,如果 admin 关闭 WebSocket 路径,所有流量走 HTTP
3. 内部测试不需要起 WebSocket 也能验签

**注意**:HTTP 路径**也走 hub 中转 + E2E 加密**(只是 transport 不同),不是 P2P。

---

## 4. ② 加密层 —— X3DH + AES-GCM

### 4.1 密钥分类（每个 agent）

| 用途 | 算法 | 寿命 |
|---|---|---|
| **identity_key**（IK） | ed25519 | 长期，agent 生命周期 |
| **identity_key_x**（IK_x） | X25519 | 长期，跟 IK 绑定 |
| **signed_prekey**（SPK） | X25519 | 中期（30 天轮换） |
| **one_time_prekeys**（OPK） | X25519 | 一次性（每个 OPK 用过即丢） |
| **session_key** | AES-256-GCM 派生 | 单条消息（MVP）/ 整个 thread（P1 用 Double Ratchet） |

**实现库**（`packages/crypto/` + `packages/proto/`）：
- `@noble/curves` — ed25519 签名、X25519 DH 计算（经过安全审计，纯 TS）
- `@noble/ciphers` — AES-256-GCM 加解密
- `canonicalize`（RFC 8785）— 发送 ed25519 签名前对 JSON 做确定性序列化

### 4.2 prekey bundle 上传

agent 激活时（`POST /api/agents/register`）上传 prekey bundle 到 hub：

```json
{
  "agent_id": "...",
  "identity_key":         "<base64 ed25519 SPKI>",
  "identity_key_x":       "<base64 X25519 SPKI>",
  "signed_prekey":        "<base64 X25519 SPKI>",
  "signed_prekey_sig":    "<base64 ed25519 sig of signed_prekey>",
  "signed_prekey_id":     1,
  "one_time_prekeys":     [
    { "id": 1, "key": "..." },
    { "id": 2, "key": "..." },
    ...100 个
  ]
}
```

hub 把 bundle 存 D1。当 OPK 用完时,客户端补充上传新的（client 主动 poll 自己的 OPK 余量）。

### 4.3 加密发送流程（X3DH 简化版）

Alice 给 Bob 发第一条消息：

```
1. Alice 拉 Bob 的 prekey bundle:
   GET /api/agents/{bob_id}/prekey-bundle
   → { IK_x, SPK, signed_prekey_sig, OPK_id_5, OPK_5 }
   (hub 给 Alice 一个 OPK,标该 OPK 已用)

2. Alice 验 SPK 签名(用 Bob 的 IK 验 signed_prekey_sig)
   → 防 hub 伪造 Bob 的 SPK

3. Alice 生成临时 X25519 keypair: (EK_priv, EK_pub)

4. Alice 计算 X3DH 共享密钥:
   DH1 = DH(IK_a_x_priv, SPK_b)
   DH2 = DH(EK_priv,     IK_b_x)
   DH3 = DH(EK_priv,     SPK_b)
   DH4 = DH(EK_priv,     OPK_b_5)  // OPK 可能为 null（客户端 OPK 用完时）
   shared = HKDF(DH1 || DH2 || DH3 || DH4)

5. Alice 用 shared 派生 AES-256-GCM 密钥,加密 message body
   nonce = 12 字节随机
   ciphertext = AES-256-GCM(key, nonce, plaintext={body, structured})

6. Alice 构造 A2A envelope:
   content.summary = "..."
   content.encrypted = { ciphertext, nonce, ephemeral_pk: EK_pub }
   附带 OPK_id（让 Bob 知道用哪个 OPK 解密）

7. ed25519 签整个信封,HTTP POST /api/messages 发给 hub（skill 主路径）
```

Bob 收到后反向算 X3DH，派生同一个 shared key，解密。

### 4.4 forward secrecy 取舍

MVP **不上 Double Ratchet**。理由：
- 单层 X3DH 已经满足"hub 看不到内容"
- Double Ratchet 工程量 = MVP 时间一半
- vibe coder 场景不是高威胁模型（不是政府监控级）

**P1 加 Double Ratchet**（每条消息都换 ephemeral key）。

### 4.5 hub 看到 vs 看不到

| hub 看得到 | hub 看不到 |
|---|---|
| sender_id, receiver_id, threadId | message body 内容 |
| timestamp, messageId | structured payload 详情 |
| message type（inform/request/...） | HITL 决策的具体 reason |
| content.summary（明文短摘要）| ed25519 sig（看得见但是验证用） |
| signature（验签需要） | E2E 加密 payload |

**为什么类型 + summary 必须明文**：
- 类型决定 routing 和 HITL 触发
- summary 用于推送通知预览（"Alice 给你发了个 request"）
- 否则 hub 无法做基本的工作

这是有意识的隐私 vs 可用性 tradeoff。如果用户对 summary 也敏感，他们可以填占位文本（"new message"），summary 不强制有意义。

---

## 5. ④ 身份层 —— Better Auth + Device Pairing

### 5.1 Better Auth on Workers

复用 Better Auth 库，换 D1 adapter。配置：

```ts
auth = betterAuth({
  database: d1Adapter(env.DB),
  emailAndPassword: { enabled: true },
  socialProviders: {
    google:  { clientId: ..., clientSecret: ... },
    github:  { clientId: ..., clientSecret: ... },
    apple:   { clientId: ..., clientSecret: ... },  // P1
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,  // 7 天
    cookieCache: { enabled: true },
  },
})
```

**重要**：sessions 表存在 D1，HTTP cookie 是 HttpOnly + SameSite=Lax + Secure。

### 5.2 Device Pairing 协议

跟 OAuth 2.0 Device Authorization Grant（RFC 8628）相似但更简：

```
[skill 端]
1. POST /api/agents/pair-init
   → { code, verify_url, expires_in:300 }
2. 自动打开浏览器到 verify_url
3. 同时开始 polling: GET /api/agents/pair-status?code=...
   每 2 秒一次,最长 5 分钟

[浏览器端,user 已登录]
4. 显示 "Bind device AB-9X42-K7 to Acme team?"
5. 用户点 [Bind]
   POST /api/agents/pair-confirm { code, tenant_id, device_name }
   → 服务器:
     - 校验 user ∈ tenant
     - device_pairing_codes.status = 'approved'
     - 生成 short-lived activation_token (5 分钟有效)

[skill 端]
6. polling 拿到 status=approved + activation_token
7. 生成 ed25519 + X25519 keypair（本地）
8. 生成 100 个 OPK（本地）
9. POST /api/agents/register
   { activation_token, identity_key, identity_key_x, signed_prekey,
     signed_prekey_sig, one_time_prekeys, push_subscription }
   → { agent_id, jwt }
10. 存 jwt 到 OS keychain；skill 后续通过 HTTP API 发消息
    （OpenClaw 等持久 runtime 可升级 WebSocket，获得实时推送）
```

### 5.3 Token / 会话策略

| 凭证 | 存哪 | 寿命 | 续期 |
|---|---|---|---|
| Web session cookie | 浏览器 | 7 天滑动 | 自动 |
| Agent JWT（HS256） | OpenClaw OS keychain | 90 天 | 失效后 device pairing 重做 |
| Activation token | 内存 | 5 分钟一次性 | 不续期 |
| Pairing code | D1（短期） | 5 分钟 | 不续期 |

**Agent JWT secret** 存 Cloudflare Workers Secrets（per-environment）。轮换时旧 JWT 失效，所有 agent 强制重新 pairing。

---

## 6. ⑤ 体验层 —— PWA + Web Push

### 6.1 前端栈

- **框架**：Astro 5（静态优先）+ React 岛屿（交互区域）
- **CSS**：Tailwind v4 + shadcn/ui
- **PWA**：`vite-plugin-pwa` + service worker
- **WebSocket**：直连 Durable Object（在 mesh 路径不存在时也能用）
- **状态**：Zustand（本地）+ TanStack Query（服务端缓存）
- **加密**：`@noble/curves`（ed25519/X25519）+ `@noble/ciphers`（AES-GCM）

### 6.2 关键页面

| Path | 用途 |
|---|---|
| `/` | 营销首页 |
| `/signup` `/login` | 注册登录 |
| `/onboarding` | 创建团队 / 接受邀请 |
| `/connect?code=X` | Device pairing 确认页（关键页） |
| `/invite/:token` | 邀请接受 |
| `/app` | Dashboard 入口（重定向到默认 tenant） |
| `/app/:tenant/inbox` | 收件箱 |
| `/app/:tenant/threads/:id` | 单 thread 视图 |
| `/app/:tenant/devices` | 我的设备列表 |
| `/app/:tenant/members` | 团队成员管理 |
| `/app/:tenant/settings` | 团队设置 |
| `/app/me` | 个人设置（推送、通知偏好） |

### 6.3 Web Push 流程

```
[Service Worker(PWA)]
- registration.pushManager.subscribe(VAPID public key)
- 拿到 PushSubscription { endpoint, keys: { p256dh, auth } }
- POST /api/push/subscribe { subscription }

[hub 端]
- 当 message 入站 + 接收方离线
- 用 web-push 库(用 VAPID 私钥签)POST 到 endpoint
- payload: { type, sender_name, summary, threadId }

[浏览器]
- Service Worker 'push' 事件
- self.registration.showNotification("...")
```

VAPID keys 存 Cloudflare Workers Secrets。

### 6.4 Email digest（兜底）

- 触发：用户离线 24 小时 + 有 ≥ 1 条未读消息
- 实现：Cloudflare Cron Worker 每小时扫一次
- 模板：未读数量 + thread 摘要 + "open in firefly-mesh" 链接
- 服务：Resend（免费档 3000/月）

---

## 7. 数据模型

D1（SQLite）schema，9 张核心表 + 1 张临时表。详细字段在 `api.md` 出来。这里只列结构。

```
身份核心
├── users                  注册用户(uuid, email, password_hash?, ...)
├── oauth_accounts         OAuth 账号绑定(user × provider × provider_uid)
└── sessions               会话(由 Better Auth 管)

团队
├── tenants                团队(uuid, name, slug, plan)
├── memberships            user × tenant × role
└── invitations            邀请 token

设备 + 加密
├── agents                 OpenClaw agent(public_keys, push_sub, status)
└── device_pairing_codes   临时配对码(5 分钟 TTL)

消息(metadata only,内容加密)
├── threads                A2A thread(tenant, topic, related_task_id)
├── messages_meta          metadata(messageId, sender, receiver, type, summary,
│                                    timestamp, hitl_state, encrypted=true)
└── pending_messages       离线 buffer(encrypted blob,14 天 TTL)

审计
└── audit_log              metadata 审计(append-only;用 SQLite trigger 防改)
```

**数据隔离**：每条 SQL 查询都带 `tenant_id` 过滤（继承 classic 多租户硬约束）。

---

## 8. ① 基础层 —— 部署 topology

### 8.1 SaaS（默认）

```
firefly-mesh.io
├── Cloudflare Pages              营销页 + PWA(静态)
├── Cloudflare Workers            API 路由(/api/*)
│   ├── auth handler
│   ├── pairing handler
│   ├── tenant management
│   └── push relay
├── Durable Objects               per-tenant hub(WebSocket + state)
├── D1                            users / tenants / messages_meta / ...
├── KV                            session cache + agent_card cache
├── R2                            附件(未来)
└── Queues                        push relay + email digest 任务
```

### 8.2 Self-host（Enterprise tier）

```
firefly-mesh-hub container        Hono on Node.js + ws server
firefly-mesh-postgres container   Postgres 17(替代 D1)
firefly-mesh-pwa container        Caddy serving static PWA
docker-compose.yml                3 个 container 一起跑
```

**关键约束**：self-host 版**不**复用 Cloudflare 路径。它走标准 Node.js 栈,API 接口跟 SaaS 一致(客户端配置 `BASE_URL` 指向自己 hub 即可)。

### 8.3 客户端兼容矩阵

| 客户端 | 走 SaaS hub | 走 self-host hub | transport |
|---|---|---|---|
| OpenClaw + skill | ✓ | ✓ | HTTP（主）+ WebSocket（可选） |
| Claude Code + skill | ✓ | ✓ | HTTP（主）+ WebSocket（可选） |
| Cursor + MCP | ✓ | ✓ | HTTP only |
| Claude Desktop + MCP | ✓ | ✓ | HTTP only |
| 浏览器 PWA | ✓ | ✓ | WebSocket（主）|
| 标准 A2A 客户端 | ✓ | ✓ | HTTP |

> MCP runtime 从 P2 提前到 P0：skill 主路径改为 HTTP 后，MCP 客户端与 OpenClaw 客户端使用同一套 HTTP API，无需额外适配层。

---

## 9. 关键流程（端到端）

### 9.1 skill 发送消息 — HTTP 主路径（所有 runtime 通用）

```
Alice OpenClaw/MCP                Cloudflare Workers+DO            Bob OpenClaw/MCP
     │                                  │                              │
     │ 1. firefly.a2a.send             │                              │
     │ ─ canonicalize + sign            │                              │
     │ ─ encrypt(content)               │                              │
     │ ─ POST /api/messages             │                              │
     │ ───────────────────────────────► │                              │
     │ ◄─ 202 { messageId, accepted } ─ │ 2. 验签 + 写 messages_meta   │
     │                                  │    (encrypted blob)          │
     │                                  │ 3. receiver WebSocket 在线?  │
     │                                  │ ─ ws.send({op:deliver,...})  │
     │                                  │ ───────────────────────────► │ 4. 验签 + 解密
     │                                  │ ◄─── ws({ op:ack, seq:N }) ─ │ 5. 发回 ack
     │                                  │ 6. UPDATE status=delivered   │
```

> **注**：202 表示 hub 已接受，不表示 Bob 已读。
> 若 Bob 未在线，消息进 `pending_messages`（见 §9.2）。
> OpenClaw 等持久 runtime 可升级 WebSocket，直接收到 delivered 回调而无需轮询。

### 9.2 接收方离线 — store-and-forward + Web Push

```
Alice OpenClaw                    Cloudflare Workers+DO            Bob's devices
     │                                  │                              │
     │ 1. POST /api/messages            │                              │
     │ ───────────────────────────────► │                              │
     │ ◄─ 202 accepted ──────────────── │                              │
     │                                  │ 2. 写 messages_meta          │
     │                                  │ 3. receiver 无 socket        │
     │                                  │ ─ INSERT pending_messages    │
     │                                  │ ─ web-push.send(ALL Bob's    │
     │                                  │   devices push_subs)         │
     │                                  │ ───────────────────────────► │ Service Worker:
     │                                  │                              │ "Alice asked you..."
     │                                  │                              │ [user 点 click]
     │                                  │                              │
     │                                  │ ◄─── PWA opens ─────────────│
     │                                  │ 4. ws connect + auth         │
     │                                  │ 5. ws.send({op:resume,       │
     │                                  │            lastSeq:N})       │
     │                                  │ ─ replay pending_messages    │
     │                                  │ ───────────────────────────► │ 6. 验签 + 解密
     │                                  │ ◄────── ws({op:ack}) ─────── │
     │                                  │ 7. DELETE pending row        │
```

### 9.3 双方都离线 — pending 持久化 + 14 天 TTL

```
Alice 离线发消息（先写本地 outbox）
└── outbox 有内容 → 重连 hub 时上传

Hub 持久化加密 blob 到 pending_messages
├── expires_at = now + 14d
└── 等任一方上线 → trigger delivery

每小时 cron:
└── DELETE FROM pending_messages WHERE expires_at < now
    └── 写 audit_log: "message expired, sender=alice, receiver=bob"
    └── push to Alice: "your message to bob expired"
```

---

## 10. 安全模型

### 10.1 信任域

| 主体 | 信任 |
|---|---|
| 用户 | 信任自己的浏览器 + OS keychain |
| OpenClaw skill | 信任本地 keypair |
| hub server | **半信任**——可信传输+持久化,**不可信内容**(假设 hub 可能被 dump) |
| Cloudflare 平台 | 信任 TLS、KV、D1 的隔离;不信任内存里的密钥 |

### 10.2 攻击模型

| 攻击 | edge 的防御 |
|---|---|
| hub 被 dump | E2E 加密 → 攻击者拿到的是密文 blob |
| 中间人改消息 | ed25519 签名 → 验签失败 |
| 重放攻击 | messageId UUID + 客户端去重 |
| hub 伪造接收方 SPK | SPK 用 IK 签了，客户端验签 |
| OpenClaw 被入侵 | 私钥泄露——这台设备消息泄露,**其他设备不受影响**(每个设备独立 keypair) |
| user 账号被盗 | session 失效 + agent JWT revoke,但**已发出的加密消息无法收回**(端到端属性) |
| Cloudflare 被法律传票 | hub 只能交出 metadata + encrypted blob,无法解密 |

### 10.3 不防的（明确不做）

- **设备本地恶意软件**：如果用户的 OS 被入侵，私钥泄露，无解。这是平台 OS 的责任。
- **社工攻击**：用户自己截屏发出去的内容，加密保护不了。
- **量子计算**：MVP 不用 post-quantum 算法（现在还不需要；P2 跟随 industry 标准升级）。

---

## 11. 跟 classic 的迁移路径

**用户层面**：classic 用户**不**自动迁移到 edge。两者数据模型差太多，自动迁移成本高于让用户重新 onboard。

策略：
1. classic 部署冻结，但继续运行（已部署的 instance 不主动停止）
2. edge 上线后，classic 的 dashboard 加横幅："edge 是我们的下一代产品，[迁移指南]"
3. 提供 export 工具：把 classic 的 employees / threads metadata 导出 JSON
4. 用户手动在 edge 重建团队，import metadata

**代码层面**：classic 的 `packages/` 整个搬到 `legacy/v0/`（branch 或子目录），主分支替换为 edge 新结构（`services/` + `packages/`）。

详细迁移 milestone 在 [plan.md](2026-05-08-firefly-mesh-edge-plan.md) §M0.

---

## 12. 设计决策回顾

把所有"为什么这么选"的关键决策汇总，方便 review：

| 决策 | 选 | 弃 | rationale |
|---|---|---|---|
| skill 连接层 | HTTP 主路径（WebSocket 可选优化） | WebSocket 必须 / P2P | HTTP 兼容所有 runtime（含 MCP）；WebSocket 作为 OpenClaw 持久进程的实时升级路径 |
| PWA 连接层 | WebSocket 长连接 | HTTP polling / SSE | 浏览器持久页面，WebSocket 实时 inbox 刷新；NAT 友好 |
| 拓扑 | All-through-hub + E2E 加密 | P2P 直连 | Signal 模型；离线兜底 |
| 加密 | X3DH + AES-GCM | 无加密 / 完整 Signal Protocol | hub 不可信内容；MVP 工程量平衡 |
| Forward secrecy | MVP 不上,P1 加 | day-1 上 Double Ratchet | 工程量 / 威胁模型平衡 |
| 数据库 | D1 (SQLite) | Postgres / DynamoDB | Cloudflare 同栈 + 免费档 |
| 实时 | Durable Objects | Pusher / Ably / 自建 ws | DO Hibernation 成本最低 |
| Auth | Better Auth + 多 OAuth | 委托给 GitHub / Auth0 | 产品独立性 + 商业自由 |
| Device 配对 | OAuth Device Authorization 风 | invite token 粘贴 | UX 一等公民 |
| 协议 | A2A v1.0 wire；skill→hub HTTP binding；pwa→hub WebSocket binding | 自定义协议 / Slack-style API | 生态护城河 + MCP runtime P0 兼容 |
| 前端 | Astro + React 岛屿 | Next.js SSR | PWA 友好 + 部署简单 |
| 部署 | SaaS-first（Cloudflare） | self-host first | vibe coder 用户画像 |
| Self-host 路径 | Hono + Postgres + ws | 复用 Cloudflare（Cf 不开源） | 真正能 self-host |

每条决策的"如果反对怎么办"在 [meta.md §5](2026-05-08-firefly-mesh-edge-meta.md#5-关键决策记录不可重新讨论) 已经规定不可重新讨论的边界。

---

## 13. Open questions（留给 api.md / ui.md）

以下细节在本文档**有意省略**，留给后续 sub-skill：

- 具体 endpoint 路径 + 请求/响应 zod schema（→ `api.md`）
- 错误码表 + retry 策略（→ `api.md`）
- 页面具体 wireframe + 配色（→ `ui.md`）
- KB / Skill 这两个 classic 高级 feature 怎么在 edge 还原（→ V0.2 设计，不在 P0）
- HITL UI 具体长什么样（→ `ui.md`）
- A2A `escalate` / `block` 类型在 vibe coder 场景下的语义（→ `api.md` 讨论）

这些不影响架构决策，所以现在 high-level 文档不写。
