# product-layer M11+M12 — Ideation

> 延续 [M5-M7 sprint](2026-05-17-firefly-mesh-product-layer-m5-m7-ideation.md)。继承上 sprint 全部决策。

## 1. 一句话定位

**M11**：把 hub 加密层的"agent 间消息"升级为"员工间通过 agent 协作的可审批工单流"（A2A 产品层 + HITL 双向状态机）。
**M12**：让 audit_log 能记录"谁、什么类型、什么动作、对什么资源、payload 是什么"。

---

## 2. 为什么这一档

### 2.1 hub 现有加密层够不够？

不够。Hub 现状只有：
- `messages_meta`：每条消息的非加密 envelope（type / summary / sender_agent / recipient_agent）
- `pending_messages`：加密 body（ciphertext / nonce / ephemeral_pk）
- `threads`：encryption 层会话（participants list）

**少了产品层语义**：
- 一条消息是 *谁的 agent* 发给 *谁的 agent*（不是 agent_id，是 employee 身份）
- HITL 双向审批状态（sender 自己要审批吗？receiver 要审批吗？谁审批了？）
- 业务线程的 topic（"Q3 spec 讨论"），跟 encryption 层的 thread 不是一回事
- 关联到哪个任务（related_task_id）

这些**全是 dashboard inbox 必须的字段**。v0 设计了 a2a_messages 表覆盖这些；edge sprint 砍了；本 sprint 补回。

### 2.2 hub 现有 audit_log 够不够？

不够。Hub 现状只有 4 列：`id / tenantId / actorId / action / targetId / createdAt`。

**缺**：
- `actor_type` — 是 human user 还是 agent 还是 system cron？dashboard 审计页要按这个过滤
- `resource_type` — 这个 target 是 employee 还是 department 还是 a2a_message？
- `resource_id` — 已有 targetId，但 v0 拆成 `resource_type + resource_id` 二维，更清晰
- `payload` — diff / context 信息（比如 boundary.updated 要记录 before/after scope）

v0 设计了 6 列；hub 当前是简化版；本 sprint 补回 4 列 + helper + 重构 11 个写入点。

---

## 3. 模块清单

### M11 — A2A 产品层

**新表 2 张**：
- `a2a_threads(id, org_id, topic, related_task_id, message_count, created_at)`
- `a2a_messages(17 列)`：
  - 标识：`id, org_id, thread_id (→a2a_threads), encrypted_message_id (→messages_meta)`
  - 收发方：`sender_agent_id, sender_employee_id, receiver_agent_id, receiver_employee_id`
  - 类型：`type (7 enum)`
  - HITL sender 侧：`sender_approval_status, sender_approval_by, sender_approval_at`
  - HITL receiver 侧：`receiver_action_status, receiver_action_by, receiver_action_at`
  - 关联：`related_task_id, reply_to_message_id`
  - `created_at`

**新 endpoint 6 个**（挂 `/api/a2a-messages/*`，跟 hub 现有 `/api/a2a/*` 共存）：
- `POST /api/a2a-messages` — agent 调用，内部协调创建 messages_meta + pending_messages + a2a_messages（"产品层包装加密层"）
- `GET /api/a2a-messages/inbox` — session 调用，dashboard 收件箱视图，按 receiver_employee_id 过滤
- 4 个 HITL CTA：
  - `POST /api/a2a-messages/:id/approve` — sender 侧（自己的 agent 发了 request，自己批准放行）
  - `POST /api/a2a-messages/:id/reject` — sender 侧（同上，拒绝）
  - `POST /api/a2a-messages/:id/accept` — receiver 侧（同事 agent 给我的 agent 发了 request，我批准接收）
  - `POST /api/a2a-messages/:id/reject-receive` — receiver 侧（同上，拒绝）

**不做**：
- WS 主动推送 a2a 产品层事件（依赖 hub 现有 ws 推送 messages_meta；产品层只 update DB）
- reply_to_message_id 自指外键（软引用，应用层校验）
- sender_signature 列（已在 hub 现有 messages 加密层）
- confidence_score（v0 字段，agent 推断置信度；M11 不要）

### M12 — audit_log 扩展

**ALTER**：`audit_log` ADD 4 列（actor_type / resource_type / resource_id / payload）。`targetId` 列保留（向后兼容；新代码优先 resource_type+resource_id）。

**新 helper**：`lib/audit.ts::writeAudit(db, params)`，统一写入接口：
```typescript
writeAudit(db, {
  tenantId: string,
  actor: { type: 'human' | 'agent' | 'system', id: string },
  action: string,
  resource?: { type: string, id: string },
  payload?: Record<string, unknown>,
})
```

**Retrofit**：11 处现有 `db.insert(schema.auditLog).values(...)` 改为 `writeAudit(...)`，填新字段。

**不做**：
- GET /api/audit 读端（推到 audit-read sprint）
- audit_log 的 RULE 防 UPDATE/DELETE（v0 是 Postgres RULE；D1 不支持。改 cron lease 模式或推迟）

---

## 4. 用户故事

### 4.1 Alice 让 agent 问 Bob "Q3 spec 的 deadline"

1. Alice 的 Claude Code 调 `POST /api/a2a-messages`：
   - type='request', summary='Q3 spec 的 deadline 是哪天？', ciphertext=...
2. Hub 内部协调：
   - 验 Alice 的 agent JWT、查 owner_employee_id = Alice
   - 接收方 receiverAgentId='bob-claude' → 查 bob agent.ownerEmployeeId = Bob
   - 算 HITL：type=request → sender auto-approve / receiver pending
   - 创 a2a_thread, messages_meta, pending_messages, a2a_messages
3. Bob 在 dashboard inbox 看到 🟡 request from alice-claude — "Q3 spec deadline?"
4. Bob 点 [Accept] → `POST /api/a2a-messages/:id/accept`
5. Hub 更新 a2a_messages.receiver_action_status='accepted' + 触发 Bob 的 agent WS 推送（hub 现有逻辑，依赖 messages_meta）
6. Bob 的 agent 看到 deliver frame，解密 body → 自动回复 'Aug 25'

### 4.2 Carol 看审计日志

1. Carol 进 dashboard `/audit`（推到下个 sprint，但本 sprint 写入面已准备好）
2. 后端调（未来）GET /api/audit?actor_type=agent&resource_type=a2a_message
3. 返回 Alice 的 agent 发出的所有 a2a_message + payload 含 type+summary

---

## 5. 范围声明

**实现**：M11 完整（schema + 6 endpoint + HITL state machine + 加密层协调）+ M12 完整（ALTER + helper + retrofit 11 处）+ e2e

**不做**：
- WS 主动推送 a2a 产品层（依赖 hub 现有）
- GET /api/audit 读端
- reply_to_message_id 自指 FK
- confidence_score
- audit_log RULE / 物理防写
- web 层 / M8 M9 M10

---

## 6. 验收

- [ ] 8 份设计文档
- [ ] 2 migrations 本地 apply
- [ ] schema 扩展（a2aThreads + a2aMessages + auditLog +4 cols）
- [ ] lib/audit.ts + lib/a2a-messages.ts
- [ ] routes/a2a-messages.ts 6 endpoint
- [ ] 11 处 audit_log 写入点 retrofit
- [ ] e2e 覆盖完整 HITL 流（4 种类型 × 4 种 HITL transition）
- [ ] 现有 3 个 e2e 不回归
- [ ] typecheck pass
