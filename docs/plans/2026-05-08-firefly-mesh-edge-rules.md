# firefly-mesh edge — 编码规则（autodev pipeline 末端）

> 开发阶段必须遵守的所有规则。任何违反都是 PR 级别的 blocker。
> 部分继承 classic [rules.md](2026-04-28-firefly-mesh-rules.md)，但根据 edge 架构有重大调整。
> CI 自动检查的红线在每条末尾标 **[CI]**。

---

## 1. 质量红线（继承 classic，不可违反）

### 1.1 R1 禁占位
- 禁 `TODO` / `FIXME` / `HACK` / `XXX` 注释 **[CI]**
- 禁空函数体 / `pass` / `return undefined`（除非 void）
- 禁 `throw new Error('not implemented')` **[CI]**
- 禁注释掉的代码留在提交里

### 1.2 R2 禁 Mock
- 禁 mock / dummy / fake 数据替代真实调用
- 测试 mock 必须放 `__tests__/` 或 `*.test.ts`
- 文件名包含 `mock` / `fake` 的非测试文件 **= blocker** **[CI]**

### 1.3 R3 禁降阶
- 必须按 [`design.md`](2026-05-08-firefly-mesh-edge-design.md) 指定方案实现
- 必须按 `api.md` 指定端点 + zod schema 实现（待出）
- 必须按 `ui.md` 指定配色 + 布局实现（待出）
- 不可行 → 停下 escalate 给 tech lead，**禁止**自己写"先用简单替代"

### 1.4 R4 禁过时版本
- 所有依赖 `pnpm add <pkg>@latest`
- 引用 API 不能用 deprecated 签名
- 不确定 → WebSearch 查最新文档

### 1.5 R5 自研需 design 论证
- 任何"自己写一份"必须在 design.md 有"自研理由"章节
- 优先用成熟库（Better Auth / Drizzle / @noble/curves / @noble/ciphers / web-push 等）

### 1.6 R6 UI 禁 emoji
- 严禁 JSX text 节点 / template string 写 emoji **[CI]**
- 唯一图标库 `lucide-react`，strokeWidth=1.75（空态 1.5）
- 白名单：i18n JSON 值 / 代码注释 / UGC 内容渲染 / Markdown 文档

---

## 2. edge 特有红线（新增，不可违反）

### 2.1 R7 BYO-agent 不可破坏（继承 classic）
- server 端**永远不**跑 ToolLoopAgent / agent loop
- LLM 调用仅 `generateText` / `generateObject` / `embedMany` / `streamText`（在 `services/hub/src/llm/helper.ts`）
- 试图引入 agent runtime SDK（OpenAI Agents SDK / Mastra / LangGraph）= blocker
- CI grep `ToolLoopAgent` 命中 = fail **[CI]**

### 2.2 R8 多租户硬边界（继承 classic）
- 所有 D1 查询必须包含 `tenant_id = ?` 在 WHERE 子句
- 跨 tenant 查询：404 Not Found（不暴露资源存在）
- 即便管理员也不能跨 tenant
- CI grep `select.*from` 配合 schema 表名 → 没有 tenant_id 过滤的 = fail **[CI]**

### 2.3 R9 HITL 不可在客户端（继承 classic）
- HITL 状态机是 server 端真值
- 客户端 agent 不能"自报已完成 HITL"
- 状态切换必须 server 端事务 + audit_log 写入
- 状态变更只能由 `services/hub/src/hitl/engine.ts` 的函数发起 **[CI grep]**

### 2.4 R10 端到端加密（edge 新增，硬约束）
- **hub 永远不存明文** `body` / `structured` 字段
- 在 `messages_meta` 表 schema 中,这两个字段**类型必须是** `encrypted_blob`(自定义类型,Drizzle 层禁止任何明文 string 写入)
- 所有 `INSERT INTO messages_meta` 语句必须带 `encrypted_payload` + `nonce` + `ephemeral_pk` 字段
- CI grep `INSERT.*messages_meta` 配合是否带这三字段 **[CI]**
- 违反 = blocker（隐私底线）

### 2.5 R11 不引入 P2P / mesh VPN
- 不允许在 codebase 引入 `tailscale` / `wireguard` / `wgctrl` / `webrtc` / `simple-peer` 包
- 任何"客户端互相直连"的代码 = blocker
- CI grep `package.json` 依赖列表 **[CI]**
- 例外：自部署版的 docker-compose 允许配置 Tailscale Sidecar（运维侧）

### 2.6 R12 ed25519 签名不可绕
- 所有 A2A 消息进入 hub 之前**必须**通过签名验证
- 验证函数只有一个：`packages/proto/src/signing.ts#verifySignature`
- 任何绕过验签的"开发模式"路径 = blocker
- CI grep WebSocket message handler，必须先调 `verifySignature` 再做任何业务逻辑

### 2.7 R13 device pairing 是唯一激活路径
- skill 不允许接受"复制粘贴 token"作为激活方式
- 所有 agent JWT 必须经由 `pair-init → pair-confirm → register` 流程获得
- skill 的 SKILL.md `inputs.token` 字段 **不允许**让用户填 token

### 2.8 R14 Durable Object Hibernation 必须正确使用
- 所有 DO class 必须用 `WebSocketServer` API（自动 hibernation），不用 `accept()` API
- DO state 不要在内存常驻大对象（hibernation 后会丢）
- 任何"在 DO 里跑定时器"的代码 = blocker（用 Cron Worker 替代）

### 2.9 R15 Cloudflare 全栈（生产路径）
- 生产部署仅用 Cloudflare Workers / DO / D1 / Pages / R2 / KV / Queues
- 不允许引入 AWS / GCP / Azure SDK 到 `services/` 路径
- 第三方 SaaS 仅允许：Resend（邮件）、Sentry（监控）、Stripe（支付）
- 例外：`services/hub-selfhost/`（自部署版）允许 Postgres + Hono + ws

### 2.10 R16 audit_log append-only
- D1 表 `audit_log` 必须配置 SQLite trigger 阻止 UPDATE / DELETE
- 任何 `update.*audit_log` / `delete.*audit_log` SQL = blocker **[CI]**
- 例外：cron 清理 90 天以上记录（必须有专门的 truncate trigger 路径）

---

## 3. 架构约束（edge 特有）

### 3.1 A1 仓库结构

```
firefly-mesh/
├── services/
│   ├── hub/             Cloudflare Workers + DO（SaaS 生产）
│   ├── hub-selfhost/    Hono + ws + Postgres（self-host 版）
│   └── pwa/             Astro + React 岛屿
├── packages/
│   ├── client/          OpenClaw skill（agentskills.io v1）
│   ├── proto/           A2A wire format + zod + signing
│   ├── crypto/          X3DH + AES-GCM 算法层
│   └── shared/          常量、类型、错误码
├── docs/
│   └── plans/           autodev 文档系列
└── legacy/
    └── v0/              classic 代码归档
```

**禁止**：在 `services/` 之间共享代码。所有共享逻辑放 `packages/`。**[CI]**

### 3.2 A2 客户端永远不直连数据库

- skill / pwa 不能直连 D1 / Postgres
- 所有数据访问通过 Workers HTTP / WebSocket API
- 例外：PWA 的 IndexedDB（本地缓存自己消息）

### 3.3 A3 加密永远在客户端

- AES-GCM 加密/解密只在 `packages/crypto/`，被 skill + pwa 调用
- hub 代码不允许 import `packages/crypto/encrypt` 或 `decrypt` 函数 **[CI]**
- hub 只能 import canonicalize / verifySignature

### 3.4 A4 通信协议白名单

- skill ↔ hub: **HTTP（主路径，所有 runtime 必须支持）**+ WebSocket（可选，OpenClaw 等持久 runtime 实时优化）
- pwa ↔ hub: WebSocket（实时 inbox 刷新）+ HTTP（pages 加载）
- a2a 客户端 ↔ hub: HTTP A2A v1.0 endpoint（兼容路径）
- MCP runtime（Cursor / Claude Desktop）: HTTP only，与 skill HTTP 路径共用同一套 API
- **不允许**：长轮询 / Server-Sent Events / gRPC（保持栈纯净）
- **禁止**：把 WebSocket 作为 skill 的唯一连接方式——MCP runtime 无持久进程，强依赖 WebSocket = 把 MCP 客户端排除在外

---

## 4. 性能约束

### 4.1 P1 端到端延迟 SLO

| 场景 | p50 | p99 |
|---|---|---|
| WebSocket 消息送达（双方在线） | < 200ms | < 1s |
| Web Push 触达（接收方离线） | < 5s | < 30s |
| 邀请邮件送达 | < 30s | < 5min |
| Pairing code 生效 | < 200ms | < 1s |

P0 达到 p50；V1 达到 p99。

### 4.2 P2 Worker CPU 时间

- 单 request 处理时间 < 10ms（Cloudflare 免费档限制）
- 加密签名（Worker 端只验签不加密）< 5ms
- 重操作（embed / vector search）走 Vectorize，不在 Workers 跑

### 4.3 P3 D1 query

- 单查询 < 100ms
- 批量操作 batch size 50 以内
- 大查询（成员列表）用 cursor pagination，不 OFFSET

### 4.4 P4 客户端 bundle

- skill 包 unpacked < 5MB
- PWA gzip < 200KB（首屏）
- 加密相关 lib（@noble）lazy load

---

## 5. 安全约束

### 5.1 S1 密钥存储

| 密钥 | 存哪 | 不允许在哪 |
|---|---|---|
| Agent 私钥（ed25519, X25519） | OpenClaw OS keychain | hub / D1 / 任何远端 |
| OPK 私钥 | OpenClaw OS keychain | 同上 |
| Agent JWT | OpenClaw OS keychain | 同上 |
| 用户密码 | bcrypt hash 存 D1 | 任何明文位置 |
| Web 会话 cookie | HttpOnly + Secure cookie | localStorage |
| VAPID 私钥 | Cloudflare Workers Secrets | git / 代码 |
| JWT secret | Cloudflare Workers Secrets | git / 代码 |
| Resend API key | Cloudflare Workers Secrets | git / 代码 |

### 5.2 S2 加密参数

- ed25519: standard ed25519（不用变种）
- X25519: standard X25519（不用 Curve448）
- AES: 256-GCM with 12-byte random nonce per message
- nonce 复用 = blocker（必须 random，不能 counter）
- HKDF: SHA-256

### 5.3 S3 OPK 管理

- 客户端预生成 100 个 OPK（每个 32 字节）
- 客户端定期 poll: GET /api/agents/me/opk-count
- 余量 < 20 → 自动补齐到 100
- hub 给一个 OPK = 标该 OPK used，**永不重复给**

### 5.4 S4 跨域

- API CORS：仅允许 `firefly-mesh.com` 子域名 + 开发期 localhost
- WebSocket origin check: 同上
- PWA Service Worker scope: 限制到 `/app`

---

## 6. 数据约束

### 6.1 D1 schema 不可漂移

- schema 定义只在 `packages/shared/src/db/schema/`
- migrations 用 `drizzle-kit`,`migrations/` 目录提交到 git
- 生产环境用 `wrangler d1 migrations apply`,**不允许**手工改 schema

### 6.2 D2 字段命名

- snake_case 列名
- 主键 `id`(UUID, 不用 INTEGER)
- 外键 `<table>_id`
- 时间戳 INTEGER(unix epoch ms),**不**用 TEXT 'ISO8601'(D1 性能)
- soft delete 用 `deleted_at` 字段,**不**物理删除业务数据

### 6.3 D3 测试数据

- seed 数据真实可用（Cyberautonomy demo team）
- 不允许 `test_user_1` 这种占位名字

---

## 7. 客户端约束

### 7.1 C1 skill 必须实现 agentskills.io v1

- SKILL.md frontmatter 严格按 v1 schema
- CI 跑官方 lint：`npx @anthropics/skills lint @firefly-mesh/skill`

### 7.2 C2 skill 必须实现 MCP 兼容

- 同时暴露 MCP server（`packages/client/src/mcp.ts`）
- 给 Cursor / Claude Desktop 用

### 7.3 C3 skill 不能 require Cloudflare-only API

- skill 必须能跑在标准 Node.js（self-host 用户的 OpenClaw 连 self-host hub）
- skill 不 import Cloudflare Workers 类型

---

## 8. 文档约束

### 8.1 DOC1 PR 必须更新文档

- 改 schema → 更新 design.md §7
- 加 endpoint → 更新 api.md
- 改 UI → 更新 ui.md

### 8.2 DOC2 决策必须有 rationale

- 每个新做的设计选择必须在对应文档里写"为什么这么选"
- 不允许 "because we said so"

### 8.3 DOC3 acceptance criteria 不可降阶

- plan.md 里的 acceptance criteria 必须**完全满足**才能标 `[x]`
- 部分满足标 `[~]` 配脚注说明
- 删除条目 = blocker（必须改方案而不是降需求）

---

## 9. CI 检查清单

每个 PR 自动跑：

| 检查 | 工具 | 失败行为 |
|---|---|---|
| TypeScript 全包 typecheck | tsc | block merge |
| lint（eslint + biome） | eslint, biome | block merge |
| R1-R6 grep（占位 / 注释代码 / emoji） | 自定义 grep | block merge |
| R7-R16 架构约束 | 自定义 grep | block merge |
| skillfile lint | @anthropics/skills | block merge |
| schema migration 检查 | drizzle-kit check | block merge |
| 单元测试覆盖率 ≥ 70% | vitest | warn（不 block） |
| E2E 测试（Playwright） | playwright | block merge（P1 之后） |
| Bundle size | size-limit | block merge if > 限制 |

---

## 10. 例外申请流程

任何想绕过红线的 PR：

1. 在 PR 描述里开 `## Rule Exception` 章节
2. 引用具体红线 ID（如 R10）
3. 给出 3 段：why（为什么绕）/ alt（评估过哪些替代）/ scope（影响范围）
4. tech lead approve 才能 merge
5. 例外记录到 `docs/exceptions.md`，季度 review

红线 R7 / R10 / R8 **不允许例外**（架构和合规底线）。
