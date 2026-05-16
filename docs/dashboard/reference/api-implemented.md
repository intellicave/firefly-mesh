# Reference — Hub 已实现 API (31 端点)

> 当前 `services/hub/` 已部署到 `hub.firefly-mesh.com`。本表按 feature 分组,列出每个端点的契约。
> 待补充端点见 [`api-needed.md`](api-needed.md)。

约定:
- 所有路径前缀 `hub.firefly-mesh.com`
- 所有需登录端点都靠 cookie `firefly-mesh.session-token`(详见 [`auth-cookie.md`](auth-cookie.md))
- 错误响应统一 `{ error: { code: string, message: string } }`
- 限流 binding 失败时 fail-open(不阻断)

---

## 1. Health

| Method | Path | 说明 |
|---|---|---|
| GET | `/` | 返回 `{ ok: true, service: 'firefly-mesh-hub', version: ... }` |

---

## 2. Auth (Better Auth) — feature 07

由 Better Auth 自动注入,路径前缀 `/api/auth/*`,限流走 `RL_AUTH`(10/60s per IP)。

| Method | Path | 说明 |
|---|---|---|
| POST | `/api/auth/sign-up/email` | 邮箱密码注册 |
| POST | `/api/auth/sign-in/email` | 邮箱密码登录 |
| GET | `/api/auth/sign-in/social?provider=google\|github` | OAuth 启动 |
| GET | `/api/auth/callback/:provider` | OAuth callback |
| GET | `/api/auth/session` | 当前 session |
| POST | `/api/auth/sign-out` | 登出 |
| POST | `/api/auth/change-password` | 改密码 (Better Auth) |
| GET | `/api/auth/list-sessions` | 列出所有 active session |
| POST | `/api/auth/revoke-session` | 撤销单个 session |

---

## 3. Tenants + Members + Invitations — feature 03

| Method | Path | Auth | 说明 |
|---|---|---|---|
| GET | `/api/tenants` | session | 我加入的所有 tenant |
| POST | `/api/tenants` | session | 创建 tenant body `{ name, slug }` |
| GET | `/api/tenants/:id` | session + member | tenant 详情 |
| GET | `/api/tenants/:id/members` | session + member | 成员列表(user 信息) |
| POST | `/api/tenants/:id/invite` | session + owner/admin | 发邀请 body `{ email, role }` |
| GET | `/api/tenants/:id/invitations` | session + owner/admin | 该 tenant 所有 pending 邀请 |
| GET | `/api/invitations/:token` | (public) | 邀请详情(给受邀人看) |
| POST | `/api/invitations/:token/accept` | session | 接受邀请(email check + CAS + db.batch,P0-2 已加固) |

---

## 4. Agents + Pairing + Push — feature 02

| Method | Path | Auth | 说明 |
|---|---|---|---|
| POST | `/api/agents/pair-init` | (public) | CLI 启动配对,返回 `{ code, expires_at }`,限流 `RL_PAIR` |
| GET | `/api/agents/pair-status?code=...` | (public) | 浏览器/CLI 查 code 状态 |
| POST | `/api/agents/pair-confirm` | session | 浏览器选 tenant 后确认 body `{ code, tenantId }` |
| POST | `/api/agents/register` | (pair code) | CLI 注册 agent body `{ code, ik_pub, spk_pub, spk_sig, opks, displayName, type }` → 返回 JWT |
| GET | `/api/me/agents` | session | 我的所有 agent |
| DELETE | `/api/agents/:agentId` | session + owner agent | 撤销 agent(清 prekey + 标记 status=revoked) |
| PUT | `/api/agents/:agentId/prekeys` | agent JWT | agent 自己 rotate prekey |
| GET | `/api/agents/:agentId/prekey-bundle` | (public) | 发消息时拉对方 prekey bundle |
| POST | `/api/me/push-subscription` | session | 注册 Web Push 订阅 |
| DELETE | `/api/me/push-subscription` | session | 取消订阅 |

---

## 5. Messages + Inbox — feature 01

| Method | Path | Auth | 说明 |
|---|---|---|---|
| POST | `/api/messages` | session 或 agent JWT | 发消息,body `{ to_agent_id, body_ciphertext, subject }`,限流 `RL_MESSAGE` |
| GET | `/api/inbox` | session | 当前 user 默认 tenant 的 inbox |
| GET | `/api/tenants/:tenantId/messages?status=&cursor=` | session + member | 该 tenant 的 inbox |
| POST | `/api/messages/:id/accept` | session + owner/admin | 批准消息(→ 状态 approved + WS push agent) |
| POST | `/api/messages/:id/reject` | session + owner/admin | 拒绝消息(→ status rejected,agent 静默) |
| POST | `/api/messages/:id/ack` | session | 标记已读 |

---

## 6. A2A (跨 tenant) — ⚠️ V1 不使用

> **状态**:V1 不含跨 tenant feature(见 [`../features/01-agent-messaging.md`](../features/01-agent-messaging.md) §1)。
> 以下端点在 hub 代码中存在(P0-3 GAN 加固过),但 dashboard 不调用,**功能层不再引用**。
> 若后续完全确定不做跨 tenant,这些端点可在 hub 中删除。

| Method | Path | Auth | 说明 |
|---|---|---|---|
| GET | `/api/a2a/agent-card/:agentId` | (public) | (V1 未使用)Agent 公开信息 |
| POST | `/api/a2a/message` | ed25519 signature | (V1 未使用)跨 tenant 入口,含验签 / 时戳 / replay 防御 / `RL_A2A` 限流 |

---

## 7. WebSocket — feature 01, 02, 03

| Method | Path | Auth | 说明 |
|---|---|---|---|
| GET (Upgrade) | `/ws` | session 或 agent JWT | WebSocket 连接,Durable Object `TenantHub` 处理。订阅 payload `{ type: 'subscribe', topic: 'tenant'\|'user', id: string }` |

**事件**(server → client):
- `message.new` — 新消息进 inbox
- `message.approved` — 消息被批准
- `message.rejected` — 消息被拒
- `agent.bound` — 新 agent 配对成功 (user channel)
- `agent.revoked` — agent 被撤销 (user channel)

**安全**(P0-1 GAN 已加固):
- WS handshake 跨域 cookie 通过 ALLOWED_ORIGIN allow-list
- `webSocketMessage` 全包 try/catch:JSON.parse 失败 + shape 校验失败 + body > 64KB → 优雅关闭,DO 不崩
- TextDecoder 用 `fatal: true, ignoreBOM: false`,非法 UTF-8 抛出而非静默替换

---

## 8. Cron

| Schedule | 任务 | 文件 |
|---|---|---|
| `0 * * * *` (每小时) | 清 pair_codes / a2a_seen | `services/hub/src/cron/cleanup.ts` |
| `0 3 * * *` (每天 03:00 UTC) | audit_log truncate(>90 天) | 同上 (P0-4 GAN 已加固,CAS lease + db.batch atomic) |

详见 `services/hub/wrangler.toml` 的 `[triggers]` 节。

---

## 9. Rate limit bindings

定义在 `wrangler.toml`:

| Binding | Limit | 用途 |
|---|---|---|
| `RL_AUTH` | 10 req / 60s / IP | `/api/auth/*` |
| `RL_PAIR` | 30 req / 60s / IP | `pair-init / pair-status` |
| `RL_MESSAGE` | 60 req / 60s / agent | `POST /api/messages` |
| `RL_A2A` | 120 req / 60s / IP | `/api/a2a/message` |

每个 binding 在响应头加 `Retry-After: <seconds>`,详见 `services/hub/src/middleware/rateLimit.ts` 的 `RETRY_AFTER_SECONDS` 常量。Binding 不存在时 fail-open。

---

## 10. CORS allow-list

`wrangler.toml` 中 `ALLOWED_ORIGINS`:
```
https://firefly-mesh.com
https://app.firefly-mesh.com
```

预检请求自动加 `Access-Control-Allow-Credentials: true`,`Access-Control-Allow-Origin: <origin>`(精确匹配,不用 `*`)。

---

## 11. 错误码索引

| Code | HTTP | 含义 |
|---|---|---|
| `unauthorized` | 401 | 未登录或 session 过期 |
| `forbidden` | 403 | 已登录但权限不足 / 跨 tenant 访问 |
| `not_found` | 404 | 资源不存在,或 cross-tenant 隐藏 |
| `validation_error` | 422 | body 字段缺失/格式错误 |
| `rate_limited` | 429 | 限流触发 |
| `payload_too_large` | 413 | 文档 > 256KB |
| `replay` | 202 + `{replay: true}` | A2A 消息重发(非错误,但提示客户端) |
| `internal_error` | 500 | 兜底 |
| `not_implemented` | 501 | 待实现 endpoint(如 V1 的 CSV 导入) |

---

## 12. 文件索引

实现位置:

- `services/hub/src/index.ts` — Hono app 装配
- `services/hub/src/routes/auth.ts` — Better Auth 路由挂载
- `services/hub/src/routes/tenants.ts` — tenant CRUD + members + invitations
- `services/hub/src/routes/agents.ts` — pair 流程 + 注册 + 撤销 + prekey
- `services/hub/src/routes/messages.ts` — 收发 + accept/reject/ack
- `services/hub/src/routes/a2a.ts` — A2A 入口(P0-3 GAN 加固)
- `services/hub/src/routes/inbox.ts` — `/api/inbox` 别名
- `services/hub/src/routes/push.ts` — push subscription
- `services/hub/src/routes/me.ts` — 我的 agent 等(待补 `/api/me`,见 needed)
- `services/hub/src/durable-objects/TenantHub.ts` — WS hub(P0-1 GAN 加固)
- `services/hub/src/middleware/rateLimit.ts` — 限流工厂(P0-3 GAN 加固)
- `services/hub/src/middleware/auth.ts` — `requireSession` / `requireAgent` / `requireTenant` / `requireRole`
- `services/hub/src/cron/cleanup.ts` — cron 任务(P0-4 GAN 加固)
- `services/hub/migrations/0001-0004_*.sql` — 已应用 migration
- `services/hub/wrangler.toml` — 部署配置(database_id / RL bindings / triggers / CORS)
