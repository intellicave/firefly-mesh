# product-layer M11+M12 — API

## 1. 新端点 6 个（M11 a2a-messages）

### 1.1 POST /api/a2a-messages

**Auth**：agent JWT（同 hub `/api/messages`）
**Rate limit**：复用 RL_MESSAGE（60 req/60s 已有）

**Request**：
```typescript
zValidator("json", z.object({
  receiverAgentId: z.string(),
  type: z.enum(["inform","sync","request","commit","handoff","escalate","block"]),
  summary: z.string().max(500).optional(),
  threadId: z.string().optional(),
  threadTopic: z.string().max(200).optional(),
  replyToMessageId: z.string().optional(),
  relatedTaskId: z.string().optional(),
  ciphertext: z.string(),
  nonce: z.string(),
  ephemeralPk: z.string(),
  oneTimePrekeyId: z.number().int().optional(),
}))
```

**Logic**：见 design.md §4.1

**Response 201**：
```json
{ "data": {
  "id": "amsg_xxx",
  "threadId": "athd_xxx",
  "encryptedMessageId": "msg_xxx",
  "type": "request",
  "senderApprovalStatus": "pending",
  "receiverActionStatus": "pending",
  "createdAt": "..."
}}
```

**Errors**：401 / 400 VALIDATION_ERROR / 404 RECIPIENT_NOT_FOUND / 422 RECIPIENT_NO_EMPLOYEE / 422 SENDER_NO_EMPLOYEE

### 1.2 GET /api/a2a-messages/inbox

**Auth**：session + orgGuard

**Query**：
```
?tab=approve|action       (default action)
?type=<7 enum>           (optional filter)
?counterpartEmployeeId=  (optional)
?cursor=<ISO>            (optional)
?limit=50                (1-100, default 50)
?sort=desc|asc           (default desc)
?tenantId=               (consumed by orgGuard)
```

**Response 200**：见 design.md §4.2 shape

### 1.3-1.6 HITL CTAs

**POST /api/a2a-messages/:id/approve** — sender 侧 approve
**POST /api/a2a-messages/:id/reject** — sender 侧 reject
**POST /api/a2a-messages/:id/accept** — receiver 侧 accept
**POST /api/a2a-messages/:id/reject-receive** — receiver 侧 reject

**Auth**：session + orgGuard
**Request body**：`{ comment?: string }` (optional)
**Response 200**：`{ data: { id, status: '<new status>' } }`
**Errors**：401 / 403 NOT_AUTHORIZED / 404 / 409 INVALID_STATUS

## 2. 现有 hub endpoint 影响

| endpoint | 影响 |
|---|---|
| POST /api/messages（hub 现有） | 不动 — 仍然只创建加密层；产品层调用新 /api/a2a-messages |
| GET /api/tenants/:id/messages | 不动 — 仍返回加密层视图 |
| 所有 /api/a2a/* hub 现有 | 不动 |
| 上 sprint /api/{employees,departments,...} | 不动 |

## 3. M12 audit_log

**无新对外 endpoint**。所有变化都在内部 `lib/audit.ts` helper 调用，影响 11 个现有 endpoint 的内部行为：

- 现有 endpoint 的对外 response shape **不变**
- audit_log 表新加 4 列后，dashboard 未来 GET /api/audit 时能拿到 actor_type 等

## 4. 完整端点 inventory

| Sprint | Endpoint | Auth | RBAC | Implemented |
|---|---|---|---|---|
| M5-M7 | GET /api/boundaries/:agentId | session+orgGuard | any | ✅ |
| M5-M7 | PUT /api/boundaries/:agentId | session+orgGuard | owner/admin | ✅ |
| M5-M7 | POST /api/agent-tokens | session+orgGuard | owner/admin | ✅ |
| M5-M7 | GET /api/agent-tokens | session+orgGuard | any | ✅ |
| M5-M7 | POST /api/agent-tokens/:id/regenerate | session+orgGuard | owner/admin | ✅ |
| M5-M7 | DELETE /api/agent-tokens/:id | session+orgGuard | owner/admin | ✅ |
| **M11** | POST /api/a2a-messages | agent JWT | (any agent) | 🚧 |
| **M11** | GET /api/a2a-messages/inbox | session+orgGuard | any | 🚧 |
| **M11** | POST /api/a2a-messages/:id/approve | session+orgGuard | sender/admin | 🚧 |
| **M11** | POST /api/a2a-messages/:id/reject | session+orgGuard | sender/admin | 🚧 |
| **M11** | POST /api/a2a-messages/:id/accept | session+orgGuard | receiver/admin | 🚧 |
| **M11** | POST /api/a2a-messages/:id/reject-receive | session+orgGuard | receiver/admin | 🚧 |

## 5. 测试契约（自检）

每个新端点至少：
- 200/201 happy path
- 401 无 auth
- 403 RBAC fail
- 400 zod fail
- 404 cross-tenant / not found
- 409 invalid state machine transition
