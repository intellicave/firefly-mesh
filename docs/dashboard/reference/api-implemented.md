# Reference — Hub 已实现 API

> ⚠️ **本文档于 2026-05-18 大幅重写**。原版（2026-05-13）写的"31 端点"已严重过期；
> 经过 5 次 sleep run 完成 12/12 产品模块后，hub 现有 **16 个 mounted routers，~80 个 endpoints**。
> 真实端点定义见各 sprint 的 api.md（[2026-05-16](../../plans/2026-05-16-firefly-mesh-product-layer-api.md) ~ [2026-05-18](../../plans/2026-05-18-firefly-mesh-product-layer-m8-m9-api.md)）。

约定:
- 路径前缀 `hub.firefly-mesh.com`
- 大多数需登录端点靠 cookie session，跨域 cookie 域 `.firefly-mesh.com`
- 业务路由用 orgGuard 中间件，tenantId 通过 query `?tenantId=` 或 header `X-Tenant-Id` 传入
- 错误响应统一 `{ error: { code, message } }`
- agent JWT 路径（POST /api/messages, POST /api/a2a-messages, POST /api/agents/* 等）走 `requireAgentJwt`

---

## 1. Health & Auth（hub 现有，不动）

| Method | Path | 说明 |
|---|---|---|
| GET | `/` | `{ status: 'ok', version }` |
| GET/POST | `/api/auth/*` | Better Auth 所有 endpoint（sign-up, sign-in, OAuth callback, sessions...）|
| GET | `/ws` | WebSocket 接入（agent JWT 或 session）|

---

## 2. 原 6 个 router（edge sprint 已上线，2026-05-08 ~ 12）

### 2.1 Tenants（已扩展含 owner-employee bootstrap）

| Method | Path |
|---|---|
| GET | `/api/tenants` |
| POST | `/api/tenants` — **创建时自动 bootstrap owner employee**（M1 sprint 加） |
| GET | `/api/tenants/:id` |
| GET | `/api/tenants/:id/members` |
| POST | `/api/tenants/:id/invite` |
| GET | `/api/tenants/:id/messages` |
| GET | `/api/tenants/:id/invitations` |

### 2.2 Invitations

| Method | Path |
|---|---|
| GET | `/api/invite/:token` |
| POST | `/api/invite/:token/accept` |

### 2.3 Agents

| Method | Path |
|---|---|
| POST | `/api/agents/pair-init` |
| GET | `/api/agents/pair-status` |
| POST | `/api/agents/pair-confirm` |
| POST | `/api/agents/register` — **已扩展接受 runtimeKind / runtimeMeta**（M5）|
| GET | `/api/agents/:id/prekey-bundle` |
| DELETE | `/api/agents/:id` |
| PUT | `/api/agents/:id/prekeys` |

### 2.4 Messages（加密层，agent JWT）

| Method | Path |
|---|---|
| POST | `/api/messages` — 发送加密消息 |
| GET | `/api/messages/inbox` |
| POST | `/api/messages/:id/ack` |
| POST | `/api/messages/:id/accept` |
| POST | `/api/messages/:id/reject` |

### 2.5 A2A（原 wire 层，保留）

| Method | Path |
|---|---|
| GET | `/api/a2a/agent-card/:agentId` |
| POST | `/api/a2a/message` |

### 2.6 Me

| Method | Path |
|---|---|
| GET | `/api/me/agents` |
| POST | `/api/me/push-subscription` |
| DELETE | `/api/me/push-subscription` |

---

## 3. 产品层 M1-M12（10 个新 router，2026-05-16 ~ 18）

### 3.1 Organizations（M1）— 4 endpoints

| Method | Path |
|---|---|
| GET | `/api/organizations/me` |
| PATCH | `/api/organizations/me` |
| GET | `/api/organizations/me/stats` |
| GET | `/api/organizations/by-slug/:slug` |

### 3.2 Employees（M2）— 10 endpoints

`/api/employees` 含 list/CRUD + role/status PATCH + `/me` + `/:id/{departments,projects}`。详见 [2026-05-16 api.md §3.2](../../plans/2026-05-16-firefly-mesh-product-layer-api.md)。

### 3.3 Departments（M3）— 8 endpoints

`/api/departments` 含 list/CRUD + members 子资源（含父子嵌套 + cycle 检测）。

### 3.4 Projects（M4）— 10 endpoints

`/api/projects` 含 list/CRUD + status state machine + members 子资源。

### 3.5 Boundaries（M6）— 2 endpoints

| Method | Path |
|---|---|
| GET | `/api/boundaries/:agentId` |
| PUT | `/api/boundaries/:agentId` |

### 3.6 Agent Tokens（M7 半成品）— 4 endpoints

| Method | Path |
|---|---|
| POST | `/api/agent-tokens` |
| GET | `/api/agent-tokens` |
| POST | `/api/agent-tokens/:id/regenerate` |
| DELETE | `/api/agent-tokens/:id` |

### 3.7 A2A Messages 产品层（M11）— 6 endpoints

`/api/a2a-messages` 含 POST + GET inbox（tab=approve/action）+ 4 HITL CTA（`/:id/{approve,reject,accept,reject-receive}`）。详见 [2026-05-17 m11-m12 api.md](../../plans/2026-05-17-firefly-mesh-product-layer-m11-m12-api.md)。

### 3.8 Tasks（M10）— 6 endpoints

`/api/tasks` 含 list/detail/POST/start/submit（双 auth：session OR agent JWT）/review（防 self-review + reviewRound）。详见 [2026-05-17 m10 api.md](../../plans/2026-05-17-firefly-mesh-product-layer-m10-api.md)。

### 3.9 Knowledge（M8）— 7 endpoints

`/api/knowledge` 含 list（3-tier scope filter）/POST（inline md/txt）/`/search`（SQLite LIKE）/detail/PATCH/DELETE/`/:id/chunks`。详见 [2026-05-18 m8-m9 api.md](../../plans/2026-05-18-firefly-mesh-product-layer-m8-m9-api.md)。

### 3.10 Skills（M9）— 7 endpoints

`/api/skills` 含 list/POST（含 dup 409）/detail/PATCH/DELETE + `/:id/assign` + DELETE `/:id/agents/:agentId`。

---

## 4. M12 audit_log 扩展

无新端点（仅扩展 schema + lib/audit.ts helper + retrofit 11 处现有 audit 写入）。详见 [2026-05-17 m11-m12 design.md §5-6](../../plans/2026-05-17-firefly-mesh-product-layer-m11-m12-design.md)。

---

## 5. 待补（V1.1+）

| 模块 | 推迟原因 |
|---|---|
| GET /api/audit | M12 只动写入面；读端在 audit-read sprint |
| POST /api/agents/activate-by-token | M7 client 消费端，需配套 enterprise SSO 场景 |
| /api/knowledge `/search` Vectorize cosine | 当前 LIKE fallback；V1.1 接 Vectorize binding |
| /api/knowledge POST pdf/docx | 需要 R2 binding + 外部解析 lib |
| POST /api/agents/:id/skills/refresh-jwt | boundary 改后强制刷新 JWT |
| /api/billing/* | Stripe sprint |

---

## 6. 总数对比

| 时间点 | Routers | Endpoints |
|---|---|---|
| 2026-05-13 文档（旧版本）| 6 + auth + ws | 31 |
| **2026-05-18 实际** | **16** | **~80** |

增长来源：5 次 sleep run 跑完 12 个产品层模块。每个 sprint 的实际增量见 [`../../PROGRESS.md`](../../PROGRESS.md) §"hub 后端模块矩阵"。
