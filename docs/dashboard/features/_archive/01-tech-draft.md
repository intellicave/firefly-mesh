# [归档] Feature 01 — 组织内 Agent 消息 · 技术层草稿

> 状态: 草稿,等 layer-by-layer 迭代。
> **范围**: 同 tenant 内 agent-to-agent 消息;不含跨组织 / E2E / 签名。

---

## 数据模型

参见 [`../../reference/data-models.md`](../../reference/data-models.md) §messages。
表:
- `messages` (id, tenant_id, from_agent_id, to_agent_id, kind, subject, body, status, owner_id, created_at, approved_at, approved_by, matched_rule_id)
- `push_subscriptions` (user_id, endpoint, keys, created_at)
- `inbox_rules` (id, owner_user_id, tenant_id, type_mask, sender_agent_ids JSON, action, priority, created_at)

索引:
- `(tenant_id, to_agent_id, status, created_at DESC)` 默认 inbox 列表
- `(owner_user_id, status, created_at DESC)` per-owner 视图

**说明**:body 明文存储(同 tenant 信任域,不做 E2E)。

---

## API 契约

已实现(部分):
- `GET /api/inbox?cursor=&after_id=` per-user 默认 inbox
- `GET /api/tenants/:tenantId/messages?status=&kind=&cursor=` 全 tenant(admin view)
- `POST /api/messages` 发送(同 tenant 内 agent 调用)
- `POST /api/messages/:id/accept` Approve
- `POST /api/messages/:id/reject` Reject
- `POST /api/messages/:id/ack` 已读
- `GET /ws` WebSocket (DO TenantHub),subscribe `{topic:'user',userId}` 收 owner 视角事件
- 事件:`message.new` / `message.approved` / `message.rejected` / `message.auto_approved`
- `POST/DELETE /api/me/push-subscription` Web Push

待补:
- `GET /api/me/inbox-rules` 列规则
- `POST/PATCH/DELETE /api/me/inbox-rules/:id?` 规则 CRUD
- `GET /api/me/inbox-rules/suggestions` 系统建议
- `POST /api/inbox/mark-read` 批量已读
- `GET /api/messages/:id` 单条详情(完整 body)

**已废弃 / 移除**(原跨组织设计):
- ~~`POST /api/a2a/message`~~ 外部 agent 入口
- ~~`GET /api/a2a/agent-card/:agentId`~~ 公开 agent card
- ~~ed25519 签名验证 / X3DH 协商 / a2a_seen replay 表~~

详见 [`../../reference/api-needed.md`](../../reference/api-needed.md) §Messaging。

---

## 实现状态

| 层 | 状态 |
|---|---|
| Hub 路由 (内部) | ✅ 主流程已实现 |
| Hub 限流 RL_MESSAGE | ✅ |
| Hub 审计触发器 | ✅ migration 0004 |
| Dashboard inbox 页 | ⚠️ 待还原 |
| Dashboard WS hook | ⚠️ 待写 `lib/use-inbox-ws.ts`,backoff 1→30s |
| Dashboard Rules Sheet | ⚠️ 待补 |
| Web Push 浏览器订阅 | ⚠️ 待还原 |
| Inbox rules engine(规则匹配 + suggestions) | ⚠️ 待补 |

---

## 迁移步骤

1. 还原 `legacy/v0/.../inbox/*` 文件树
2. Hub URL 改 `${HUB_URL}` + `credentials: 'include'`
3. WS hook + backoff + subscribe payload(用 user-channel,not tenant)
4. WS 失败 3 次 → fallback 5s 轮询 `?after_id=` 增量
5. Web Push 订阅 + Service Worker 处理 notificationclick → deep link `/inbox?msg=<id>`
6. Hub 补强:
   - `inbox_rules` 表 + CRUD endpoints
   - 规则匹配引擎(消息入库时即时跑,落 `matched_rule_id` + 决定 `status`)
   - Suggestions:基于 owner 过去 30 天行为的统计
7. Sheet 内 Reply 走标准 `POST /api/messages`

---

## 技术验收清单

- [ ] WS handshake 跨域 cookie 成功
- [ ] WS DO 不崩(P0-1 GAN 已验:>64KB / 非法 JSON / 恶意 frame)
- [ ] 跨 tenant 攻击:URL 改 tenantId → 后端 403
- [ ] per-owner 隔离:user A 拉别人 inbox → 403
- [ ] 限流 RL_MESSAGE → 429 + Retry-After
- [ ] 规则引擎:消息入库 < 50ms 完成规则匹配
- [ ] 401 → 自动 `/login?next=`
- [ ] auto-approved 消息也走完整 audit log
