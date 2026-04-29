# firefly-mesh — API 设计（autodev-api 产出）

> **输入**：[ideation](2026-04-28-firefly-mesh-ideation.md) + [oss-scan](2026-04-28-firefly-mesh-oss-scan.md) + [design](2026-04-28-firefly-mesh-design.md) + [ui §9](2026-04-28-firefly-mesh-ui.md)
> **本文档不重复 design schema 字段定义**——只定义协议 / 端点 / 模板 / 安全 / DB 操作产物。

---

## 1. API 约定

### 1.1 URL & HTTP

- RESTful，小写，**单数名词**：`/api/employee` / `/api/agent` / `/api/skill` / `/api/knowledge`
- 集合术语用复数：`/api/audit/threads`
- 嵌套 ≤ 1 层：`/api/task/{id}/review`、`/api/a2a/{id}/approve`
- HTTP method 严格语义：GET 只读 / POST 创建或动作 / PUT 整体替换 / PATCH 局部 / DELETE 删除

### 1.2 Request / Response

- `Content-Type: application/json`（multipart 仅 file upload）
- **Response envelope**：
  - 成功：`{ data: T, meta?: { cursor?, hasMore?, total? } }`
  - 错误：`{ error: { code: string, message: string, details?: unknown } }`
- 时间：ISO 8601 UTC
- ID：UUID v4
- 零 null 优先（可选字段缺失用省略；nullable 字段才用 `null`）

### 1.3 分页 / 排序 / 过滤

- 分页：cursor-based `?cursor={opaque}&limit=20`（max 100）
- 排序：`?sort=updated_at&order=desc`
- 过滤：query string 多 filter；复杂 filter 用 POST body

### 1.4 错误码目录

| code | HTTP | 说明 |
|---|---|---|
| `UNAUTHENTICATED` | 401 | 未登录 / 无 token |
| `INVALID_TOKEN` | 401 | token 解析失败 / 已撤销 |
| `SIGNATURE_FAILED` | 401 | sender 签名 verify 失败 |
| `FORBIDDEN` | 403 | RBAC 拒绝 |
| `INSUFFICIENT_SCOPE` | 403 | agent boundary 不允许 |
| `BOUNDARY_VIOLATION` | 403 | agent 越权动作 |
| `SCOPE_FORBIDDEN` | 403 | 跨 scope KB / Skill 访问 |
| `NOT_FOUND` | 404 | 资源不存在（含跨 org） |
| `VALIDATION_ERROR` | 400 | zod parse 失败（含 `details`） |
| `CONFLICT` | 409 | 并发冲突 / unique 违反 |
| `LLM_DECOMPOSITION_FAILED` | 422 | LLM 拆解 3 次重试失败 |
| `LLM_OUTPUT_INVALID` | 422 | LLM 输出 schema 不合法 |
| `EMBED_FAILED` | 422 | 向量嵌入失败 |
| `INDEX_INCONSISTENT` | 422 | embed model 不匹配 |
| `LOOP_DETECTED` | 422 | A2A 死循环（V2） |
| `BUDGET_EXCEEDED` | 429 | token 预算耗尽 |
| `RATE_LIMITED` | 429 | 过快请求 |
| `INTERNAL_ERROR` | 500 | unexpected |

---

## 2. 认证与授权

### 2.1 三种认证

| 调用源 | 方式 | 位置 |
|---|---|---|
| Web UI | Better Auth session cookie | HTTP-only cookie |
| Agent skill / MCP | JWT Bearer | `Authorization: Bearer {jwt}` |
| A2A 跨 agent | JWT + ed25519 签名 | `+ X-Agent-Signature` + `X-Agent-Identity` |

### 2.2 Agent JWT payload

```typescript
{
  sub: string,        // agent UUID
  emp: string,        // owner employee UUID
  org: string,        // org UUID
  scopes: string[],   // 来自 representation_boundaries.scopes
  iat: number,        // 颁发时间
  // 无 exp；撤销靠 revoked_tokens 表 + 中间件 check
}
```

### 2.3 中间件链

```
Request → withAuth → withOrgGuard → withRBAC([roles]) → withScope([scopes])
       → withSenderSignature (A2A endpoints) → Route handler
```

每个中间件的责任：

- `withAuth` — 验 cookie / Bearer，注入 `session: { userId, orgId, employeeId, role, scopes? }`
- `withOrgGuard` — 强制 SQL 注入 `WHERE org_id = session.orgId`，跨 org 访问 → 404（不暴露存在）
- `withRBAC([roles])` — 检查 `session.role ∈ allowed`
- `withScope([scopes])` — agent 调用专用，检查 `session.scopes ⊇ required`
- `withSenderSignature` — A2A endpoints，verify ed25519 + 检查 sender 与 token sub 匹配

### 2.4 Boundary scope catalog（v1）

| scope | 含义 | 默认开 |
|---|---|---|
| `read_kb` | 读 KB（按所属 scope） | ✅ |
| `write_kb_personal` | 写自己 personal KB | ✅ |
| `submit_task` | 提交完成任务 | ✅ |
| `send_a2a_inform` | 发 inform | ✅ |
| `send_a2a_request` | 发 request（HITL 必批） | ✅ |
| `send_a2a_commit` | 发 commit（HITL 必批） | ✅ |
| `send_a2a_handoff` | 发 handoff（HITL 必批） | ✅ |
| `dispatch_task` | 发起任务（CEO/manager 才需要） | ❌（admin 显式开） |
| `send_external_email` | 外发邮件 | ❌（V2 + admin 显式开） |
| `sign_contract` | 签合同 | ❌（V2，danger，admin 显式开） |

### 2.5 权限矩阵（关键端点抽样）

| 端点 | guest | employee | manager | admin/owner | auditor | agent |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `POST /api/auth/sign-in` | ✓ | - | - | - | - | - |
| `GET /api/me` | ✗ | ✓ 自己 | ✓ 自己 | ✓ 自己 | ✓ 自己 | ✗ |
| `GET /api/org/graph` | ✗ | ✓ 只读 | ✓ 只读 | ✓ 编辑 | ✓ 只读 | ✗ |
| `POST /api/employee` | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| `POST /api/token` | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| `PUT /api/boundary/{agentId}` | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| `POST /api/task/dispatch` | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ scope `dispatch_task` |
| `POST /api/a2a/send` | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ scope per type |
| `POST /api/a2a/{id}/approve` | ✗ | ✓ 自己 | ✓ 部门 | ✓ | ✗ | ✗ |
| `POST /api/task/{id}/review` | ✗ | ✓ reviewer 自己 | ✓ 部门 | ✓ | ✗ | ✗ |
| `GET /api/audit/threads` | ✗ | 限自己 | 限本部门 | ✓ 全部 | ✓ 全部 | ✗ |
| `GET /api/knowledge/search` | ✗ | ✓ 按 scope | ✓ 按 scope | ✓ | ✓ | ✓ scope `read_kb` |
| `POST /api/knowledge/upload` | ✗ | Personal only | Dept + Personal | 全 scope | ✗ | ✗ |
| `POST /api/skill` | ✗ | Personal only | Dept + Personal | 全 scope | ✗ | ✗ |
| `POST /api/agent/activate` | ✓（一次性 token） | - | - | - | - | - |
| `GET /.well-known/agent-card.json` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## 3. SSE Channels

### 3.1 命名约定

`{topic-domain}.{specific-id}` —— 例：`inbox.{employeeId}`、`audit.org.{orgId}`、`knowledge.indexing.{docId}`

### 3.2 Channel 清单

| Channel topic | 推送事件 | 订阅方 |
|---|---|---|
| `user.{me}` | `inbox.count.changed`, `task.assigned` | App Shell |
| `inbox.{employeeId}` | `a2a.message.received`, `task.review_requested` | /inbox |
| `audit.org.{orgId}` | `a2a.message.created`, `audit.entry.appended` | /audit + auditor |
| `knowledge.indexing.{docId}` | `knowledge.chunk.ready`, `knowledge.indexed`, `knowledge.failed` | /knowledge upload progress |
| `skill.{employeeId}` | `skill.loaded`, `skill.updated`, `skill.removed` | agent client（推送变更） |
| `org.graph.{orgId}` | `org.employee.added`, `org.department.changed` | /organization 多 admin 同步 |

### 3.3 事件 schema

```
data: {"event":"a2a.message.received","ts":"2026-04-28T14:18:00.000Z","payload":{...}}\n\n
```

Keep-alive：每 30s 发 `:keepalive\n\n`。

### 3.4 全部事件命名清单

| Domain | Events |
|---|---|
| `a2a` | `message.created`, `message.received`, `message.approved`, `message.accepted`, `message.rejected` |
| `task` | `dispatched`, `assigned`, `submitted`, `reviewed`, `escalated` |
| `knowledge` | `chunk.ready`, `indexed`, `failed` |
| `skill` | `loaded`, `updated`, `removed` |
| `audit` | `entry.appended` |
| `org` | `employee.added`, `department.changed` |
| `inbox` | `count.changed` |

---

## 4. REST Endpoints（按域分组）

### 4.1 Auth & Me

#### `ALL /api/auth/[...all]`
Better Auth handler，处理登录 / 注册 / 会话 / 登出。直接 mount。

#### `GET /api/me`
**用途**：当前用户 + org + employee 简要 / **UI**：App Shell

```typescript
Response = {
  data: {
    user: { id, email, name, avatarUrl? },
    employee: { id, role, title?, departmentIds: string[] },
    org: { id, name, slug },
    pendingCounts: { inboxApprove: number, inboxAction: number },
  }
}
```

#### `PUT /api/me`
**用途**：改自己资料 / **UI**：/settings/account
**Body**：`{ name?, avatarUrl?, title? }` (zod 1-100 chars; URL valid)

#### `POST /api/me/switch-org`
**用途**：multi-tenant 切 org / **UI**：TopBar Org switcher
**Body**：`{ orgId: uuid }`
**Errors**：404 NOT_FOUND（不在该 org）

#### `POST /api/auth/change-password`
**Body**：`{ currentPassword: string, newPassword: string (min 12) }`
**Errors**：400 VALIDATION_ERROR / 401 UNAUTHENTICATED

#### `DELETE /api/me`
**用途**：删自己账户（hard delete user，employee 改 archived）

#### `GET /api/onboarding/state`
**Response**：`{ data: { step: 'create-org' | 'import' | 'tokens' | 'done', completed: boolean } }`

---

### 4.2 Org & Employee

#### `GET /api/org`
返回当前 org 元信息 / `PUT /api/org` admin 改 / `POST /api/org` onboarding 创建（含 admin user 建立）

#### `GET /api/org/graph`
**用途**：一次性返回完整 org graph（所有 employee + department + project + agent）/ **UI**：/organization
**Response** (节选)：
```typescript
{
  data: {
    employees: Array<EmployeeView>,    // 含 role, departmentIds, agents[]
    departments: Array<DepartmentView>,
    projects: Array<ProjectView>,
    edges: { reportsTo: [employeeId, employeeId][] },
  }
}
```
小公司 < 200 人，整批返回；大组织 cursor 分页（V2）

#### `GET/POST/PUT/DELETE /api/employee[/{id}]`
标准 CRUD，admin 限定。`POST /api/employee/import` multipart CSV → 解析 → 预览（Step 2 / 3 of onboarding）

```typescript
EmployeeBody = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  title: z.string().max(80).optional(),
  role: z.enum(['owner', 'admin', 'manager', 'employee', 'auditor']).default('employee'),
  departmentIds: z.array(z.string().uuid()).default([]),
  accountMode: z.enum(['create', 'bind', 'none']).default('create'),  // 沿 firefly
});
```

#### `GET/POST/PUT/DELETE /api/department[/{id}]`
CRUD；含 parentId 自引用层级。Body：`{ name, parentId?, description? }`

#### `GET/POST/PUT/DELETE /api/project[/{id}]`
（schema 已支持，UI 仅 settings/projects MVP 露出基本 CRUD；项目级 KB / Skill V0.2）

---

### 4.3 Token & Boundary

#### `GET /api/token`
**用途**：admin 列 org 全部 token / **UI**：/settings/tokens
**Query**：`?status=pending|consumed|revoked|expired&employeeId=...`
**Response**：list（不含 token 明文，仅 hash 后 8 位 + status + 元数据）

#### `POST /api/token`
**Body**：`{ employeeId: uuid, expiresInDays: number (default 7, max 90) }`
**Response**：`{ data: { tokenId, plainToken: string } }` ⚠️ plain token 仅返回**一次**

#### `POST /api/token/batch`
**Body**：`{ employeeIds: uuid[], expiresInDays: number }`
**Response**：`{ data: Array<{ employeeId, tokenId, plainToken }> }` 一次性显示 / **UI**：/onboarding/generate-tokens

#### `POST /api/token/{id}/revoke`
撤销 token，下次该 token 调 API 都 401。

#### `POST /api/token/regenerate?employeeId={id}`
撤销旧 token + 生成新 token。

#### `GET /api/boundary?agentId={id}`
**Response**：`{ data: { agentId, scopes: string[], updatedAt } }`

#### `PUT /api/boundary/{agentId}`
**Body**：`{ scopes: string[] }` 必须 ⊆ scope catalog
admin 改边界后 server 撤销该 agent 当前活跃 JWT，强制重新 activate（拿到新 scope 的 token）。

---

### 4.4 Task lifecycle

#### `POST /api/task/dispatch`
（详见 [Step 4 §4.2 完整规格](#42-示例端点-1-postapitaskdispatchllm-拆解--hitl-点-1最关键)）

**核心点**：LLM 拆解 + 标记 `pending_dispatch_approval` + SSE 推 sender web UI

#### `POST /api/task/{id}/approve-dispatch`
**用途**：sender web UI 点"批准下达" → 路由 sub-tasks
**Body**：`{ adjustments?: Array<{ subTaskIndex, override }> }` 允许 sender 微调

#### `GET /api/task/list?employeeId={me}`
agent 拉自己的任务队列 / **UI**：skill `firefly.task.list`
**Query**：`?status=assigned|in_progress|pending_review&cursor=...`

#### `GET /api/task/{id}`
单任务 + parent / children / linked a2a_messages

#### `POST /api/task/{id}/submit`
**用途**：agent 提交完成 / **UI**：skill `firefly.task.submit`
**Body**：`{ output: object | string, attachments?: file[] }`
**业务规则**：
- 转为 `pending_review`，创建 PendingApproval（reviewer = task.reviewerEmployeeId 或 默认 = 上级）
- SSE 推 reviewer inbox
- 写 audit `task.submitted`

#### `POST /api/task/{id}/review`
**用途**：reviewer 通过 / 退回
**Body**：`{ decision: 'approved' | 'rejected', comment?: string, suggestedRevision?: string }`
**业务规则**：
- approved → status = `approved`，向上汇总；通知 creator
- rejected → reviewRound++，task 退回 assignee；轮次 ≥ 3 自动 escalate（V2）
- 写 audit `task.reviewed`

#### `POST /api/task/{id}/cancel`
管理者取消任务（向下传播）

---

### 4.5 A2A 通信

#### `POST /api/a2a/send`
（详见 Step 4 §4.3 完整规格）

#### `GET /api/a2a/inbox?employeeId={me}&tab={t}`
**Query**：`?tab=approve|action&cursor=...&filter[type]=...&filter[agent]=...`
**业务规则**：
- `tab=approve`：返回 sender 是 me 且 senderApprovalStatus='pending' 的消息
- `tab=action`：返回 receiver 是 me 且 receiverActionStatus='pending' 的消息 + task pending_review where reviewer=me

#### `GET /api/a2a/{messageId}`
单消息完整内容 + 关联 task / thread

#### `POST /api/a2a/{id}/approve`（sender 批准发送）
**Body**：`{ comment?: string }`
**业务规则**：
- senderApprovalStatus → 'approved'
- 计算 receiver HITL：commit/request/handoff → receiverActionStatus='pending' + 推 receiver inbox；inform/sync → 'auto' + 直接送达
- 写 audit `a2a.approved`

#### `POST /api/a2a/{id}/reject`（sender 拒绝发送）
**Body**：`{ comment?: string }` → senderApprovalStatus='rejected'，**消息不送达**

#### `POST /api/a2a/{id}/accept`（receiver 接受）
**Body**：`{ comment?: string }` → receiverActionStatus='accepted'，触发 receiver agent 的 fire-and-forget 处理

#### `POST /api/a2a/{id}/reject-receive`（receiver 拒绝）
→ receiverActionStatus='rejected'，写 audit；可选：sender 上级 escalate（V2）

---

### 4.6 Audit

#### `GET /api/audit/threads`
**Query**：`?from=ISO&to=ISO&actor=employeeId|agentId&type=...&taskId=...&cursor=...`
**Response**：`{ data: Array<ThreadOverview>, meta: { cursor, hasMore } }`

#### `GET /api/audit/threads/{id}`
**Response**：`{ data: { thread, messages: A2AMessage[], auditEntries: AuditEntry[] } }`

#### `GET /api/audit/threads/{id}/export.csv`
直接 CSV stream 下载

#### `GET /api/audit/log` (V2)
通用 audit log，按角色 RBAC

---

### 4.7 Knowledge（P12）

#### `GET /api/knowledge`
**Query**：`?scope=company|department|personal&deptId=...&cursor=...&search=...`

#### `POST /api/knowledge/upload`
**Content-Type**：multipart/form-data
**Fields**：`scope`, `deptId?`, `title`, `description?`, `tags[]`, `file`
**Response**：`{ data: { documentId, indexStatus: 'pending' } }`，异步 chunk + embed 启动；订阅 `/api/stream?topic=knowledge.indexing.{documentId}` 看进度
**业务规则**：
- 文件类型限：pdf / docx / md / txt / html
- max size: 50 MB（V1）
- 写权限：admin / scope owner（dept manager 自己 dept；任何员工自己 personal）

#### `GET /api/knowledge/{id}`
**Response**：document 元数据 + 前 5 chunks 预览（不返回完整向量）

#### `PUT /api/knowledge/{id}`
**Body**：`{ title?, description?, tags?[] }` （改 scope 不允许，需删后重建）

#### `POST /api/knowledge/{id}/reindex`
触发重新 chunk + embed（model 升级或 chunking 策略改时用）

#### `DELETE /api/knowledge/{id}`
cascade 删 chunks

#### `GET /api/knowledge/search`
（详见 Step 4 §4.4 完整规格）

---

### 4.8 Skills（P13）

#### `GET /api/skill`
**Query**：`?scope=company|department|personal&deptId=...&cursor=...`

#### `GET /api/skill/{id}`
**Response**：完整 manifest + bound files + conflict preview（哪些下层 scope 覆盖了）

#### `POST /api/skill`
**Body**：
```typescript
{
  manifestId: string,         // e.g. "firefly-mesh/email-draft"
  version: string,            // SemVer
  scope: 'company'|'department'|'personal',
  departmentId?: uuid,
  manifest: SkillManifest,    // agentskills.io 格式
  files?: Array<{ path, content }>,
}
```

#### `PUT /api/skill/{id}`
**Body**：`{ manifest, files?, autoBumpVersion?: boolean }` 默认 patch++

#### `DELETE /api/skill/{id}`
软删（status='archived'）；agent 仍可加载已绑定的旧版

#### `POST /api/skill/{id}/dry-run`
**Body**：`{ sampleInput: object }`
**Response**：`{ data: { output, tokenUsage, latencyMs } }`
**业务规则**：在 sandbox 跑（仅 generateText 调用 LLM；不连真任务系统）

#### `GET /api/skill/loaded?employeeId={me}`
**用途**：agent 接入时拉自己的有效 skill list（合并 Personal > Dept > Company 优先级）
**Response**：
```typescript
{
  data: {
    skills: Array<{
      id, manifestId, version, scope, manifest, conflictResolved: { winnerScope, hiddenSkillIds[] }
    }>;
    cacheKey: string;  // 用于 SSE 失效检测
  }
}
```

---

### 4.9 Agent activate / heartbeat（外部 client）

#### `POST /api/agent/activate`
**Body**：
```typescript
{
  oneTimeToken: string,       // 一次性接入 token
  runtimeKind: 'openclaw'|'hermes'|'claude-code'|'cursor'|'claude-desktop'|'other-mcp',
  runtimeVersion?: string,
  protocolVersion?: string,   // A2A v1.2 / agentskills.io v1.x
  publicKey: string,          // ed25519 public key (base64)，用于 server verify A2A 签名
}
```
**Response**：
```typescript
{
  data: {
    agentId: uuid,
    jwt: string,              // Bearer token，长期
    scopes: string[],
    serverPublicKey: string,  // 客户端 verify server-signed messages 用
  }
}
```
**业务规则**：
- 一次性 token consume 后 revoke
- agent_id 创建 + agent_tokens.consumed_at 写入
- 写 audit `agent.activated`

#### `POST /api/agent/heartbeat`
agent 每 60s 调一次，更新 `agents.lastSeenAt` + 推 `org.graph.{orgId}` SSE

---

### 4.10 Well-known

#### `GET /.well-known/agent-card.json`

Google A2A v1.2 标准 agent card，**外部 agent 发现入口**：

```json
{
  "$schema": "https://a2a-protocol.org/schemas/v1.2/agent-card.json",
  "version": "1.2",
  "name": "firefly-mesh",
  "displayName": "Firefly Mesh — Org Collaboration Hub",
  "description": "Bring your own agent. We bring the org.",
  "url": "https://{server-host}",
  "endpoints": {
    "a2a": "/api/a2a/send",
    "auth": "/api/agent/activate",
    "heartbeat": "/api/agent/heartbeat",
    "tasks": "/api/task/list",
    "knowledge": "/api/knowledge/search",
    "skills": "/api/skill/loaded"
  },
  "capabilities": ["a2a-v1.2", "agentskills-v1", "mcp-bridge"],
  "messageTypes": ["inform", "sync", "request", "commit", "handoff", "escalate", "block"],
  "auth": {
    "scheme": "Bearer",
    "tokenEndpoint": "/api/agent/activate"
  },
  "signaturePublicKey": "{ed25519-base64}"
}
```

---

## 5. A2A 协议详细 Schema

### 5.1 Message envelope（与 design §6.7 schema 对应，外部协议视角）

```typescript
const A2AMessageWire = z.object({
  messageId: z.string().uuid(),
  threadId: z.string().uuid(),
  replyToMessageId: z.string().uuid().optional(),
  protocolVersion: z.literal('1.2'),
  timestamp: z.string().datetime(),
  sender: z.object({
    agentId: z.string().uuid(),
    employeeId: z.string().uuid(),
    employeeName: z.string(),
    department: z.string().optional(),
    authorityScope: z.array(z.string()),
  }),
  receiver: z.object({
    agentId: z.string().uuid(),
    employeeId: z.string().uuid(),
  }),
  type: z.enum(['inform','sync','request','commit','handoff','escalate','block']),
  content: z.object({
    summary: z.string().max(500),
    body: z.string().max(20_000).optional(),
    structured: z.record(z.unknown()).optional(),
  }),
  approval: z.object({
    senderApprovalRequired: z.boolean(),
    senderApprovalStatus: z.enum(['pending','approved','rejected','auto']),
    senderApprovalBy: z.string().uuid().optional(),
    senderApprovalAt: z.string().datetime().optional(),
  }),
  action: z.object({
    receiverActionRequired: z.boolean(),
    receiverActionStatus: z.enum(['pending','accepted','rejected','auto']),
    deadline: z.string().datetime().optional(),
  }),
  links: z.object({
    relatedTaskId: z.string().uuid().optional(),
    relatedSopNodeId: z.string().uuid().optional(),
  }),
  audit: z.object({
    confidenceScore: z.number().min(0).max(1).optional(),
  }),
  signature: z.string(),  // ed25519-base64 over canonical JSON
});
```

### 5.2 Sender 签名流程

1. agent 准备 message body（去掉 `signature` 字段）
2. canonical JSON serialize（key 字典序、no whitespace）
3. ed25519 sign with agent 私钥
4. 填回 `signature` 字段
5. POST 到 server

server verify：
1. 取 `signature`、设为 empty、canonical serialize
2. 用 agent activate 时注册的 publicKey verify
3. fail → 401 SIGNATURE_FAILED

### 5.3 HITL 双向状态机

```
                                  ┌─────────────┐
        agent 调 send             │ pending_send│
       ─────────────────────────▶│ er_approval │
                                  └──────┬──────┘
                                         │ sender 员工 web UI 点
                                         ▼
                              ┌─────────────────────┐
                              │ sender_approved     │
                              └──────┬──────────────┘
                                     │
                  ┌──────────────────┴──────────────────┐
                  │                                     │
       inform/sync/escalate/block               commit/request/handoff
                  │                                     │
                  ▼                                     ▼
          ┌──────────────┐                     ┌─────────────────┐
          │ delivered    │                     │ pending_recvr_  │
          │ (receiver    │                     │ action          │
          │  auto handle)│                     └────────┬────────┘
          └──────────────┘                              │ receiver
                                                        │ 员工点
                                                        ▼
                                            ┌─────────────────────┐
                                            │ receiver_accepted / │
                                            │ rejected            │
                                            └─────────────────────┘
```

### 5.4 死循环检测（V2）

同 `threadId` + 同 sender→receiver pair + 同 type ≥ 3 round → 自动转 `escalate` 并暂停。MVP 用预算硬限保底。

---

## 6. DB 操作产物（不重复 design §6 schema）

### 6.1 Migration 顺序（FK 依赖图）

```
00_drizzle_init               -- pgvector extension + drizzle infra
01_organizations              -- root multi-tenant
02_better_auth_users          -- Better Auth schema
03_employees                  -- references user + org
04_departments                -- references org（含 parentId 自引用）
05_department_members         -- many-to-many
06_projects                   -- references org
07_project_members            -- many-to-many
08_agents                     -- references employee
09_agent_tokens               -- references employee + agent
10_representation_boundaries  -- references agent
11_skills                     -- references org / dept / employee（按 scope）
12_agent_skills               -- many-to-many
13_tasks                      -- references employee（含 parent 自引用，goal ancestry）
14_a2a_threads                -- references org
15_a2a_messages               -- references thread + agents + employees
16_knowledge_documents        -- references org / dept / employee
17_knowledge_chunks           -- references document，含 vector(2048) HNSW
18_audit_log                  -- 最后；引用 actor (string，allow 任意 actor type)
19_constraints_and_rules      -- DB-level RULE / CHECK 约束（见 §6.3）
20_seed_data_optional         -- W2 dogfooding 配置包（可选 migration，env 控制）
```

### 6.2 关键 SQL 查询模板

#### KB RAG 三层 scope filter（用于 `firefly.kb.search`）

```sql
WITH my_dept_ids AS (
  SELECT department_id FROM department_members WHERE employee_id = $me
)
SELECT
  c.id, c.content, c.scope, c.document_id,
  d.title AS document_title,
  c.heading_path,
  1 - (c.embedding <=> $query_embedding) AS score
FROM knowledge_chunks c
JOIN knowledge_documents d ON c.document_id = d.id
WHERE c.org_id = $orgId
  AND (
    c.scope = 'company'
    OR (c.scope = 'department' AND c.department_id IN (SELECT * FROM my_dept_ids))
    OR (c.scope = 'personal' AND c.owner_employee_id = $me)
  )
ORDER BY c.embedding <=> $query_embedding ASC
LIMIT $topK;
```

#### Skill registry 优先级合并（用于 `GET /api/skill/loaded`）

```sql
WITH my_dept_ids AS (
  SELECT department_id FROM department_members WHERE employee_id = $me
),
candidates AS (
  SELECT s.*,
    CASE s.scope
      WHEN 'personal' THEN 3
      WHEN 'department' THEN 2
      WHEN 'company' THEN 1
    END AS priority
  FROM skills s
  WHERE s.org_id = $orgId
    AND s.status = 'active'
    AND (
      s.scope = 'company'
      OR (s.scope = 'department' AND s.department_id IN (SELECT * FROM my_dept_ids))
      OR (s.scope = 'personal' AND s.owner_employee_id = $me)
    )
),
ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY manifest_id ORDER BY priority DESC, version DESC) AS rn
  FROM candidates
)
SELECT * FROM ranked WHERE rn = 1;
```

#### 任务路由 + skill match（V1 用 tag 匹配，V2 升级 LLM 语义）

```sql
SELECT e.id, e.name, e.role, COUNT(s.id) AS matching_skills
FROM employees e
JOIN agent_skills as_link ON as_link.agent_id = (SELECT id FROM agents WHERE owner_employee_id = e.id LIMIT 1)
JOIN skills s ON s.id = as_link.skill_id
WHERE e.org_id = $orgId
  AND e.status = 'active'
  AND s.manifest @> $required_tags::jsonb
GROUP BY e.id
ORDER BY matching_skills DESC, e.id
LIMIT 10;
```

#### Audit log 多租户 cursor 分页

```sql
SELECT * FROM audit_log
WHERE org_id = $orgId
  AND ($cursor IS NULL OR created_at < $cursor::timestamp)
  AND (... 其它 filter)
ORDER BY created_at DESC
LIMIT 20;
```

### 6.3 DB 层 trigger / RULE / CHECK

```sql
-- audit_log append-only：禁止 UPDATE / DELETE
CREATE RULE audit_log_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE RULE audit_log_no_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING;

-- skill / knowledge_documents scope CHECK
ALTER TABLE skills ADD CONSTRAINT skill_scope_check
  CHECK (
    (scope = 'company' AND department_id IS NULL AND owner_employee_id IS NULL) OR
    (scope = 'department' AND department_id IS NOT NULL) OR
    (scope = 'personal' AND owner_employee_id IS NOT NULL)
  );
ALTER TABLE knowledge_documents ADD CONSTRAINT kb_scope_check ...;

-- pgvector HNSW 索引（chunking 后建）
CREATE INDEX knowledge_chunks_embedding_idx ON knowledge_chunks
  USING hnsw (embedding vector_cosine_ops);

-- A2A 跨 org 拒绝
ALTER TABLE a2a_messages ADD CONSTRAINT a2a_same_org
  CHECK (
    -- sender 和 receiver 必须同 org（外键 FK 隐含）
    -- 实际通过中间件 enforce，DB 仅做 sanity
    org_id IS NOT NULL
  );
```

### 6.4 Seed pipeline（W2 Cyberautonomy dogfooding）

```typescript
// packages/deploy/seed/cyberautonomy/seed.ts
async function seedCyberautonomy() {
  // 1. 创建 org
  const orgId = await db.insert(organizations).values({
    name: 'Cyberautonomy', slug: 'cyberautonomy'
  }).returning('id');

  // 2. 导入员工（CSV）
  await importEmployees(orgId, './employees.csv');

  // 3. 创建部门
  for (const dept of ['Engineering', 'Sales', 'Marketing', 'Legal', 'Operations']) {
    await db.insert(departments).values({ orgId, name: dept });
  }

  // 4. 上传内置 KB（Cyberautonomy 内部 wiki / 决策案例）
  for (const file of glob('./kb/**/*.md')) {
    await uploadKnowledge({
      orgId, scope: 'company', file,
      tags: parseFrontmatter(file).tags,
    });
  }

  // 5. 注册内置 skills
  for (const skillDir of glob('./skills/*/')) {
    await registerSkill({
      orgId, scope: 'company', manifest: readManifest(skillDir),
      files: readSkillFiles(skillDir),
    });
  }

  // 6. 生成员工接入 token
  const tokens = await batchGenerateTokens({ orgId, employeeIds });

  // 7. 输出 token CSV 给 admin
  fs.writeFileSync('./tokens-out.csv', formatCsv(tokens));
}
```

---

## 7. Skill 包工具签名（`@firefly-mesh/skill` 暴露给客户端 agent）

### 7.1 `firefly.task.*`

| Tool | Input | Output |
|---|---|---|
| `firefly.task.list` | `{ status?: TaskStatus[] }` | `{ tasks: TaskSummary[] }` |
| `firefly.task.get` | `{ taskId: uuid }` | `{ task: TaskFull }` |
| `firefly.task.create_and_dispatch` | `{ description, deadline? }` | `{ rootTaskId, pendingApprovalId, decomposition[] }` |
| `firefly.task.submit` | `{ taskId, output }` | `{ taskId, status: 'pending_review' }` |

### 7.2 `firefly.a2a.*`

| Tool | Input | Output |
|---|---|---|
| `firefly.a2a.send` | `{ to: { agentId | employeeId }, type, content, threadId? }` | `{ messageId, deliveryStatus }` |
| `firefly.a2a.inbox` | `{ tab?: 'approve'\|'action' }` | `{ messages[] }` |
| `firefly.a2a.respond` | `{ messageId, action: 'approve'\|'reject'\|'accept'\|'reject-receive', comment? }` | `{ ok: true }` |

### 7.3 `firefly.kb.*`

| Tool | Input | Output |
|---|---|---|
| `firefly.kb.search` | `{ query, scope?, topK?: number }` | `{ chunks: ChunkResult[] }` |
| `firefly.kb.upload` | `{ scope, deptId?, title, tags?[], content: string\|file }` | `{ documentId, indexStatus }` |
| `firefly.kb.list` | `{ scope?, deptId? }` | `{ documents[] }` |

### 7.4 `firefly.skill.*`

| Tool | Input | Output |
|---|---|---|
| `firefly.skill.list` | `{ scope? }` | `{ skills[] }` |
| `firefly.skill.create` | `{ manifest, files, scope, deptId? }` | `{ skillId, version }` |
| `firefly.skill.invoke` | `{ skillId, input }` | （由 manifest 定义） |

### 7.5 错误处理（client agent）

所有 tool 调用都可能返回 `{ error: { code, message } }`。client agent 应：
- 401 → 提示员工重新接入（agent 不自动重连）
- 403 BOUNDARY_VIOLATION → 告诉员工"我没有这个权限，需要 admin 配置"
- 422 LLM_DECOMPOSITION_FAILED → 告诉员工"server 拆解失败，建议简化指令"
- 429 BUDGET_EXCEEDED → 告诉员工"今日预算耗尽"

---

## 8. 完整端点速查表（58 endpoints）

| # | Method | Path | UI |
|---|---|---|---|
| 1 | ALL | `/api/auth/[...all]` | /login |
| 2 | GET | `/api/me` | App Shell |
| 3 | PUT | `/api/me` | /settings/account |
| 4 | DELETE | `/api/me` | /settings/account |
| 5 | POST | `/api/me/switch-org` | TopBar |
| 6 | POST | `/api/auth/change-password` | /settings/account |
| 7 | GET | `/api/onboarding/state` | /onboarding |
| 8 | GET | `/api/org` | /settings/org |
| 9 | PUT | `/api/org` | /settings/org |
| 10 | POST | `/api/org` | /onboarding/create-org |
| 11 | GET | `/api/org/graph` | /organization |
| 12 | GET | `/api/employee` | /settings/members |
| 13 | POST | `/api/employee` | /organization, /settings/members |
| 14 | PUT | `/api/employee/{id}` | /organization drawer |
| 15 | DELETE | `/api/employee/{id}` | /organization confirm |
| 16 | POST | `/api/employee/import` | /onboarding/import-employees |
| 17 | GET | `/api/department` | /organization |
| 18 | POST | `/api/department` | /organization |
| 19 | PUT | `/api/department/{id}` | /organization |
| 20 | DELETE | `/api/department/{id}` | /organization |
| 21 | GET | `/api/project` | settings/projects |
| 22 | POST | `/api/project` | settings/projects |
| 23 | PUT | `/api/project/{id}` | settings/projects |
| 24 | DELETE | `/api/project/{id}` | settings/projects |
| 25 | GET | `/api/token` | /settings/tokens |
| 26 | POST | `/api/token` | /settings/tokens |
| 27 | POST | `/api/token/batch` | /onboarding/generate-tokens |
| 28 | POST | `/api/token/{id}/revoke` | /settings/tokens |
| 29 | POST | `/api/token/regenerate` | /settings/agent |
| 30 | GET | `/api/boundary` | /organization drawer |
| 31 | PUT | `/api/boundary/{agentId}` | /settings/boundaries |
| 32 | POST | `/api/task/dispatch` | skill: firefly.task.create_and_dispatch |
| 33 | POST | `/api/task/{id}/approve-dispatch` | /inbox drawer |
| 34 | GET | `/api/task/list` | skill: firefly.task.list |
| 35 | GET | `/api/task/{id}` | /inbox drawer |
| 36 | POST | `/api/task/{id}/submit` | skill: firefly.task.submit |
| 37 | POST | `/api/task/{id}/review` | /inbox drawer |
| 38 | POST | `/api/task/{id}/cancel` | inbox drawer (manager) |
| 39 | POST | `/api/a2a/send` | skill: firefly.a2a.send |
| 40 | GET | `/api/a2a/inbox` | /inbox |
| 41 | GET | `/api/a2a/{id}` | /inbox drawer |
| 42 | POST | `/api/a2a/{id}/approve` | /inbox drawer |
| 43 | POST | `/api/a2a/{id}/reject` | /inbox drawer |
| 44 | POST | `/api/a2a/{id}/accept` | /inbox drawer |
| 45 | POST | `/api/a2a/{id}/reject-receive` | /inbox drawer |
| 46 | GET | `/api/audit/threads` | /audit |
| 47 | GET | `/api/audit/threads/{id}` | /audit drawer |
| 48 | GET | `/api/audit/threads/{id}/export.csv` | /audit Export |
| 49 | GET | `/api/knowledge` | /knowledge |
| 50 | POST | `/api/knowledge/upload` | /knowledge Upload |
| 51 | GET | `/api/knowledge/{id}` | /knowledge drawer |
| 52 | PUT | `/api/knowledge/{id}` | /knowledge drawer |
| 53 | POST | `/api/knowledge/{id}/reindex` | /knowledge drawer |
| 54 | DELETE | `/api/knowledge/{id}` | /knowledge drawer |
| 55 | GET | `/api/knowledge/search` | skill: firefly.kb.search + /knowledge search box |
| 56 | GET | `/api/skill` | /skills |
| 57 | GET | `/api/skill/{id}` | /skills drawer |
| 58 | POST | `/api/skill` | /skills Create |
| 59 | PUT | `/api/skill/{id}` | /skills drawer |
| 60 | DELETE | `/api/skill/{id}` | /skills drawer |
| 61 | POST | `/api/skill/{id}/dry-run` | /skills drawer |
| 62 | GET | `/api/skill/loaded` | skill: firefly.skill.list |
| 63 | POST | `/api/agent/activate` | external CLI |
| 64 | POST | `/api/agent/heartbeat` | skill auto |
| 65 | GET | `/.well-known/agent-card.json` | external A2A discovery |

实际 65 个端点（高于 step 3 估的 58；含 Project CRUD MVP 在 settings 露出 + agent heartbeat）。

---

## 9. 阶段交接

下一步：**Step 6 (autodev-plan)** —— 基于 ideation 16 项 MVP + design 14 表 schema + 本 api.md 65 endpoints，产出 [`2026-04-28-firefly-mesh-plan.md`](2026-04-28-firefly-mesh-plan.md)：

- M0–M9 milestones（参考 firefly plan，按 firefly-mesh 范围调整）
- 每个 milestone 的契约式验收标准
- 红线扫描规则（无 TODO / mock / 降阶）
- GAN 自审触发条件
- 每个 task 的依赖图

按用户原 batch "go 123 到 4 停下"——api 是 step 5，超出原 batch。是否继续 step 6 等用户授权。

---

**API 完成。**
