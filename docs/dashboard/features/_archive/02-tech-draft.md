# [归档] Feature 02 — Agent 接入 · 技术层草稿

> 状态: 草稿,等 layer-by-layer 迭代。

---

## 数据模型

参见 [`../../reference/data-models.md`](../../reference/data-models.md) §agents。
表:`agents` (id, user_id, tenant_id, display_name, type, jwt_kid, status, last_seen_at) + `pair_codes` (code → bound_user_id / bound_tenant_id / agent_id, status, expires_at) + `push_subscriptions`。

**说明**:V1 不做 E2E,因此 agent 无需 ed25519 私钥 / prekey bundle / X3DH 协商;agent 身份由 hub 签发的 JWT 承载。

---

## API 契约

已实现:
- `POST /api/agents/pair-init` → `{code, expires_at}` (public, RL_PAIR)
- `GET /api/agents/pair-status?code=`
- `POST /api/agents/pair-confirm` body `{code, tenantId}` (session)
- `POST /api/agents/register` body `{code, displayName, type}` → 返回 JWT
- `GET /api/me/agents`
- `DELETE /api/agents/:agentId`
- `POST/DELETE /api/me/push-subscription`

**已废弃 / 移除**(原 E2E 设计):
- ~~`PUT /api/agents/:agentId/prekeys`~~ OTK rotation
- ~~`GET /api/agents/:agentId/prekey-bundle`~~ 公开 prekey 获取
- WS event `agent.bound` / `agent.revoked` 在 user channel

待补:
- WS user-channel `online` 状态聚合(V1.5)
- `PATCH /api/agents/:agentId` 改 display_name (V1.5)

详见 [`../../reference/api-needed.md`](../../reference/api-needed.md)。

---

## 实现状态

| 层 | 状态 |
|---|---|
| Hub 配对流程 (pair-init/status/confirm/register) | ✅ |
| Hub JWT 签发 | ✅ |
| Hub 撤销 + prekey 清理 | ✅ |
| Dashboard `/settings/devices` 页 | ⚠️ 待还原 |
| Dashboard `/connect` 页 | ⚠️ PWA `ConnectPage.tsx` 可参考 |
| Onboarding step 3 WS 实时反馈 | ⚠️ 替换轮询为 WS |
| Web Push 订阅 UI | ⚠️ 待还原 |

---

## 迁移步骤

1. 还原 / 重写设备页 (参考 PWA 现有 DevicesPage)
2. `/connect` 页移植到 Next.js,`process.env.NEXT_PUBLIC_HUB_URL`
3. 三 runtime 接入卡片(OpenClaw / MCP / HTTP),Copy 按钮 + toast
4. WS user-channel 全局订阅 `agent.bound` / `agent.revoked`
5. Push subscription:`Notification.permission` 检查 + `POST /api/me/push-subscription`
6. 撤销 confirm 用 shadcn `<AlertDialog>`

---

## 技术验收清单

- [ ] OpenClaw / MCP / HTTP 三种 runtime 都走同一 `/connect?code=` 流程
- [ ] WS 收到 `agent.bound` 实时刷新设备列表
- [ ] Revoke 后 agent 调 API → 401
- [ ] 跨 tenant 拉 agent → 403
- [ ] Push subscription 注册成功(`Notification.permission==='granted'`)
