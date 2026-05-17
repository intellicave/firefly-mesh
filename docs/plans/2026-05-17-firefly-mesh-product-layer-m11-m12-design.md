# product-layer M11+M12 — Design

## 1. 架构影响

| 层 | 变化 |
|---|---|
| ① Infra | 不动 |
| ② Delivery（hub messages_meta / pending_messages / threads） | **不动** schema；产品层通过 encrypted_message_id 引用 |
| ③ Protocol | 不动 |
| ④ Identity | 不动 |
| ⑤ Experience | 不动（dashboard 推迟）|
| ⑥ Product layer | **加 2 张 a2a 表 + 扩展 auditLog** |

## 2. 数据模型

### 2.1 a2a_threads（新）

```sql
CREATE TABLE a2a_threads (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  topic           TEXT,
  related_task_id TEXT,                 -- soft ref (M10 加 tasks 表)
  message_count   INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_a2a_threads_org ON a2a_threads(org_id);
```

### 2.2 a2a_messages（新）

```sql
CREATE TABLE a2a_messages (
  id                       TEXT PRIMARY KEY,
  org_id                   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  thread_id                TEXT NOT NULL REFERENCES a2a_threads(id) ON DELETE CASCADE,
  encrypted_message_id     TEXT NOT NULL REFERENCES messages_meta(id) ON DELETE CASCADE,
  reply_to_message_id      TEXT,        -- soft self-ref

  sender_agent_id          TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  sender_employee_id       TEXT REFERENCES employees(id) ON DELETE SET NULL,
  receiver_agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  receiver_employee_id     TEXT REFERENCES employees(id) ON DELETE SET NULL,

  type                     TEXT NOT NULL CHECK (type IN
    ('inform','sync','request','commit','handoff','escalate','block')),

  sender_approval_status   TEXT NOT NULL DEFAULT 'auto'
    CHECK (sender_approval_status IN ('pending','approved','rejected','auto')),
  sender_approval_by       TEXT REFERENCES employees(id),
  sender_approval_at       TEXT,

  receiver_action_status   TEXT NOT NULL DEFAULT 'auto'
    CHECK (receiver_action_status IN ('pending','accepted','rejected','auto')),
  receiver_action_by       TEXT REFERENCES employees(id),
  receiver_action_at       TEXT,

  related_task_id          TEXT,        -- soft ref
  created_at               TEXT NOT NULL
);
CREATE INDEX idx_a2a_messages_org ON a2a_messages(org_id);
CREATE INDEX idx_a2a_messages_thread ON a2a_messages(thread_id);
CREATE INDEX idx_a2a_messages_receiver_emp ON a2a_messages(receiver_employee_id, receiver_action_status);
CREATE INDEX idx_a2a_messages_sender_emp ON a2a_messages(sender_employee_id, sender_approval_status);
CREATE INDEX idx_a2a_messages_encrypted ON a2a_messages(encrypted_message_id);
```

**字段说明**：
- `encrypted_message_id` UNIQUE 不加（一条加密消息原则上对应一条产品层，但留余地：未来 broadcast 场景一条加密消息映射多条产品层）
- `sender/receiver_employee_id` 可空 SET NULL（员工被删时 a2a_messages 保留作历史）
- HITL 4 状态枚举：`pending/approved/rejected/auto`（"auto" 表示无需人工，状态机直接通过）
- `reply_to_message_id` 软引用（应用层校验 in-org）

### 2.3 audit_log ALTER

```sql
ALTER TABLE audit_log ADD COLUMN actor_type TEXT
  CHECK (actor_type IN ('human','agent','system'));
ALTER TABLE audit_log ADD COLUMN resource_type TEXT;
ALTER TABLE audit_log ADD COLUMN resource_id TEXT;
ALTER TABLE audit_log ADD COLUMN payload TEXT;        -- JSON
```

- 4 列**全部可空**（向后兼容已有数据）
- `target_id` 保留（不动）；新代码优先 `resource_type + resource_id`，但旧字段不丢
- `payload` TEXT 存 JSON 字符串

### 2.4 现有 hub 表的影响

| 表 | 影响 | 处理 |
|---|---|---|
| `messages_meta` | 被 a2a_messages 引用 | 不动 |
| `pending_messages` | 间接被引用 | 不动 |
| `threads`（encryption 层） | a2a_threads 独立存在；两者不引用 | 不动 |
| `employees` | a2a_messages 引用 | 不动 |
| `agents` | a2a_messages 引用 | 不动 |

## 3. HITL 状态机

复用 `services/hub/src/hitl/engine.ts::computeHitlFlags(type)`，扩展生成"双向 HITL 状态"：

```typescript
// services/hub/src/lib/a2a-messages.ts
export function computeInitialA2aStatus(type: A2AMessageType): {
  senderApprovalStatus: 'auto' | 'pending'
  receiverActionStatus: 'auto' | 'pending'
}

// inform / sync         → sender=auto,    receiver=auto
// request / commit /
//   handoff             → sender=pending, receiver=pending
// escalate / block      → sender=auto,    receiver=pending
```

**状态转移**：
- sender_approval_status: `pending → approved | rejected`（终态）
- receiver_action_status: `pending → accepted | rejected`（终态）
- `auto` 是初始终态（无需操作）

**约束**：
- sender 侧操作（approve/reject）只允许 sender_employee_id 本人 OR admin
- receiver 侧操作（accept/reject-receive）只允许 receiver_employee_id 本人 OR admin
- 已是终态（approved/rejected/accepted/auto）→ 409 INVALID_STATUS
- 改 sender 不影响 receiver；改 receiver 不影响 sender

**触发的"实际投递"**：
- sender_approval_status='approved' AND receiver_action_status IN ('auto','accepted') → 加密层 pending_messages 应该投递（依赖 hub 现有 ws / cron 推送）
- 本 sprint **不在 a2a-messages.ts 主动触发推送**，而是依赖 hub 现有推送链路对 messages_meta 起作用。WS 推送看到 messages_meta 增加就推；这是 hub 已有的行为

## 4. routes/a2a-messages.ts

### 4.1 POST /api/a2a-messages（agent JWT）

**用途**：sender agent 发产品层消息，hub 内部协调加密层。

**Request body**：
```typescript
{
  receiverAgentId: string,       // 必填
  type: A2AMessageType,
  summary?: string,              // ≤500 chars，"消息预览"
  threadId?: string,             // 产品层 a2a_threads.id；不传则新建
  threadTopic?: string,          // 新建 thread 时的 topic
  replyToMessageId?: string,
  relatedTaskId?: string,

  // 加密层字段（与 hub POST /api/messages 同）
  ciphertext: string,
  nonce: string,
  ephemeralPk: string,
  oneTimePrekeyId?: number,
}
```

**业务逻辑**（sequential，无 transaction by D1）：
1. agent JWT → senderAgentId + tenantId
2. 反查 sender agent → ownerEmployeeId
3. 反查 receiver agent → ownerEmployeeId + 同租户校验
4. 算 HITL 初始状态
5. 解析或创建 a2a_thread
6. 创建 messages_meta（hub 现有 schema，type / summary / sender_agent_id / recipient_agent_id）
7. 创建 pending_messages（加密 envelope）
8. 创建 a2a_messages（产品层，引用 messages_meta.id）
9. a2a_threads.message_count += 1
10. writeAudit({ actor: { type:'agent', id: senderAgentId }, action:'a2a_message.sent', resource: { type:'a2a_message', id }, payload: { type, threadId } })

**Response 201**：
```json
{ "data": {
  "id": "amsg_xxx",
  "threadId": "athd_xxx",
  "encryptedMessageId": "msg_xxx",
  "senderApprovalStatus": "auto",
  "receiverActionStatus": "auto",
  "createdAt": "..."
}}
```

**Errors**：400/401/403/404 RECIPIENT_NOT_FOUND / 422 etc.

### 4.2 GET /api/a2a-messages/inbox（session）

dashboard 收件箱。

**Query**：
```
?tab=approve|action    (default action)
?type=inform|...       (optional filter)
?counterpartEmployeeId=xxx
?cursor=ISO            (load earlier)
?limit=50              (max 100)
?sort=desc|asc         (default desc)
```

- `tab=approve` → sender_employee_id=ME AND sender_approval_status='pending'
- `tab=action` → receiver_employee_id=ME AND receiver_action_status='pending'

**Response**：
```typescript
{ data: {
  tab,
  items: [{
    id, type, summary, threadId, relatedTaskId,
    senderAgentId, senderEmployeeId, senderEmployeeName,
    receiverAgentId, receiverEmployeeId, receiverEmployeeName,
    createdAt,
  }],
  nextCursor: string | null,
}}
```

- summary 直接读自 messages_meta.summary（JOIN）
- 员工 name 通过 employees JOIN
- 跨租户保护：所有 SQL 含 `eq(a2a_messages.orgId, tenantId)`

### 4.3 4 个 HITL CTA

**POST /api/a2a-messages/:id/approve**（sender 侧）：
- session + orgGuard
- 查 a2a_message + 同租户校验
- 校验：c.get('employee').id === sender_employee_id OR role IN ('owner','admin')
- 校验：sender_approval_status === 'pending'（否则 409）
- UPDATE sender_approval_status='approved', sender_approval_by=employee.id, sender_approval_at=now
- writeAudit
- Response: { data: { id, status: 'approved' } }

**POST /:id/reject** — sender 侧，状态='rejected'

**POST /:id/accept** — receiver 侧，状态='accepted'，校验 receiver_employee_id

**POST /:id/reject-receive** — receiver 侧，状态='rejected'

可选 body `{ comment?: string }`（v0 有，写入 audit_log.payload；本 sprint 简化为不存 comment 到产品表，只存到 audit payload）。

## 5. lib/audit.ts helper

```typescript
// services/hub/src/lib/audit.ts
import { nanoid } from "nanoid"
import * as schema from "../db/schema.ts"
import type { DrizzleD1 } from "../db/connect.ts"

export type AuditActorType = "human" | "agent" | "system"

export interface AuditWriteParams {
  tenantId: string | null
  actor: { type: AuditActorType; id: string }
  action: string
  resource?: { type: string; id: string }
  payload?: Record<string, unknown>
}

export async function writeAudit(db: DrizzleD1, p: AuditWriteParams): Promise<void> {
  await db.insert(schema.auditLog).values({
    id: nanoid(21),
    tenantId: p.tenantId,
    actorId: p.actor.id,
    actorType: p.actor.type,
    action: p.action,
    targetId: p.resource?.id ?? null,    // back-compat
    resourceType: p.resource?.type ?? null,
    resourceId: p.resource?.id ?? null,
    payload: p.payload ? JSON.stringify(p.payload) : null,
    createdAt: new Date().toISOString(),
  })
}
```

## 6. Retrofit 11 处现有 audit_log 写入

| 文件 | 处数 | action | actor type | resource type |
|---|---|---|---|---|
| tenants.ts | 2 | `tenant.created` / `tenant.invited`等 | human | tenant / invitation |
| invitations.ts | 1 | `invitation.accepted` | human | invitation |
| agents.ts | 2 | `agent.registered` / `agent.revoked` | human | agent |
| boundaries.ts | 1 | `boundary.updated` | human | agent |
| agent-tokens.ts | 3 | `agent_token.issued/regenerated/revoked` | human | agent_token |
| messages.ts | 2 | `a2a.delivered` 等 | agent | message |

每处替换为 `await writeAudit(db, { ... })`。

**契约**：旧 audit_log 行（target_id 列）继续工作；新行同时写 resource_type + resource_id（payload 选填）。

## 7. 验证策略（e2e）

`test/m11-m12.e2e.ts`：

1. **HITL inform（auto/auto）**：POST → sender_approval='auto', receiver_action='auto' → 不出现在 inbox approve/action tab
2. **HITL request（pending/pending）**：POST → sender_approval='pending' → 出现在 sender 的 approve tab → POST /approve → 状态变 approved；同时 receiver 看到在 action tab → POST /accept → 状态变 accepted
3. **HITL request - sender reject**：POST → sender 拒绝 → 验证 sender_approval='rejected'，receiver_action 仍 pending（不级联，因为加密层不知道产品层拒绝；但 dashboard 可显示）
4. **重复操作 → 409**
5. **非 sender/receiver 调 approve → 403（admin 例外）**
6. **跨租户：B 用 A 的 a2a_message_id → 404**
7. **audit_log 新字段**：调一次 POST /a2a-messages，检查 audit_log 行 actor_type='agent', resource_type='a2a_message', resource_id=id, payload=JSON
8. **audit_log retrofit**：调 hub 现有 POST /api/tenants，检查新行 actor_type='human', resource_type='tenant'
9. **back-compat**：旧 audit_log 行（target_id 但无 actor_type）—— 仅查询验证不报错（既存数据兼容）

## 8. 决策记录

| 主题 | 选 | 弃 |
|---|---|---|
| 产品层与加密层关系 | a2a_messages.encrypted_message_id → messages_meta.id | ALTER messages_meta 加产品列 |
| 加密层 thread vs 产品层 thread | 独立两套（threads + a2a_threads）| 共用 |
| HITL 状态枚举 | 4 enum（含 'auto'）| 单独 boolean require_approval |
| sender summary 加密性 | 非加密（sender 客户端主动暴露）| 加密 → dashboard 看不到 |
| WS 推送产品层 | 不主动推；依赖 hub 现有推送 messages_meta | 加 a2a-message DO |
| audit_log RULE 防篡改 | D1 不支持 RULE；推迟到 cron lease 模式 | 立即做 |
| target_id 列 | 保留向后兼容 | DROP |
| comment 字段 | 写到 audit_log.payload，不在 a2a_messages | 加列 |
