# Firefly Mesh Edge — API 设计

> 基于：docs/plans/2026-05-08-firefly-mesh-edge-design.md  
> 　　　docs/plans/2026-05-08-firefly-mesh-edge-ui.md  
> 版本：v1.0 | 2026-05-09

---

## 1. API 约定

### 1.1 URL 风格

- RESTful，lowercase，plural noun（`/api/messages`, `/api/tenants`）
- 嵌套最多 2 层（`/api/tenants/:id/invitations`，不再深入）
- Base path：`/api`（Cloudflare Worker route handler 挂载点）

### 1.2 请求/响应格式

- `Content-Type: application/json`
- **成功响应**：
  ```json
  { "data": { ... } }
  ```
- **错误响应**：
  ```json
  { "error": { "code": "TENANT_NOT_FOUND", "message": "租户不存在" } }
  ```
- 不混用格式：成功时不出现 `error` 字段，失败时不出现 `data` 字段

### 1.3 ID 格式

| 字段 | 格式 | 示例 |
|------|------|------|
| 通用实体 ID | nanoid(21) URL-safe | `V1StGXR8_Z5jdHi6B-myT` |
| pairing code | 6 位大写字母数字 | `A3K9MZ` |
| prekey key_id | uint32 | `42` |

### 1.4 时间格式

ISO 8601 UTC：`2026-05-09T12:00:00Z`

### 1.5 分页

所有列表端点使用 cursor-based 分页：

- 请求：`?cursor=<opaque_string>&limit=20`（limit 默认 20，上限 100）
- 响应 `meta`：
  ```json
  {
    "meta": {
      "nextCursor": "eyJpZCI6IjEyMyJ9" // null = 末页
    }
  }
  ```

### 1.6 Crypto 字段编码

所有密钥、密文字段均为 **base64url（无 padding）**。

### 1.7 HTTP 状态码

| 代码 | 含义 | 场景 |
|------|------|------|
| 200 | OK | 成功读取/更新 |
| 201 | Created | 成功创建资源 |
| 202 | Accepted | 消息已入队（异步） |
| 204 | No Content | 成功删除 |
| 400 | Bad Request | 请求参数缺失/格式错误 |
| 401 | Unauthenticated | 未提供有效凭证 |
| 403 | Forbidden | 无权限 |
| 404 | Not Found | 资源不存在 |
| 409 | Conflict | 已存在（重复注册等） |
| 422 | Validation Error | 业务规则校验失败 |
| 429 | Rate Limited | 超过速率限制 |
| 500 | Server Error | 未预期的服务端错误 |

---

## 2. 数据模型

### 2.1 users

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | nanoid(21) |
| email | TEXT UNIQUE | 登录邮箱 |
| display_name | TEXT | 显示名（最长 50 字符） |
| avatar_url | TEXT | 头像 URL（可 null） |
| created_at | TEXT | ISO 8601 |

> 由 Better Auth 管理，不直接通过自定义端点写入。

### 2.2 tenants

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | nanoid(21) |
| slug | TEXT UNIQUE | URL slug，3-32 字符，[a-z0-9-] |
| display_name | TEXT | 显示名，最长 50 字符 |
| owner_id | TEXT FK→users | 创建者 |
| plan | TEXT | "free" \| "pro" |
| created_at | TEXT | ISO 8601 |

### 2.3 memberships

| 字段 | 类型 | 说明 |
|------|------|------|
| tenant_id | TEXT FK→tenants | |
| user_id | TEXT FK→users | |
| role | TEXT | "owner" \| "admin" \| "member" |
| joined_at | TEXT | ISO 8601 |

PK: (tenant_id, user_id)

### 2.4 invitations

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | nanoid(21) |
| tenant_id | TEXT FK→tenants | |
| email | TEXT | 被邀请人邮箱 |
| token | TEXT UNIQUE | 64 字符 hex（随机） |
| role | TEXT | "admin" \| "member" |
| expires_at | TEXT | ISO 8601，创建后 7 天 |
| used_at | TEXT | ISO 8601，null = 未使用 |
| invited_by | TEXT FK→users | |
| created_at | TEXT | ISO 8601 |

### 2.5 agents

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | nanoid(21) |
| tenant_id | TEXT FK→tenants | |
| owner_user_id | TEXT FK→users | 绑定到哪个用户 |
| display_name | TEXT | 最长 50 字符 |
| type | TEXT | "skill" \| "bot" |
| identity_key | TEXT | base64url，ed25519 公钥（32 B） |
| signed_prekey | TEXT | base64url，X25519 公钥（32 B） |
| signed_prekey_sig | TEXT | base64url，ed25519 对 signed_prekey 的签名 |
| created_at | TEXT | ISO 8601 |
| last_seen_at | TEXT | ISO 8601，null = 从未 |

### 2.6 one_time_prekeys

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | nanoid(21) |
| agent_id | TEXT FK→agents | |
| key_id | INTEGER | uint32，agent 本地序号 |
| public_key | TEXT | base64url，X25519 公钥 |
| consumed_at | TEXT | ISO 8601，null = 未消耗 |

### 2.7 device_pairing_codes

| 字段 | 类型 | 说明 |
|------|------|------|
| code | TEXT PK | 6 位大写字母数字 |
| agent_id | TEXT | null = 未关联，注册后填入 |
| tenant_id | TEXT | null = 未绑定 tenant |
| expires_at | TEXT | ISO 8601，创建后 10 分钟 |
| claimed_at | TEXT | ISO 8601，null = 未领取 |

### 2.8 threads

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | nanoid(21) |
| tenant_id | TEXT FK→tenants | |
| participants | TEXT | JSON array of agentId |
| created_at | TEXT | ISO 8601 |
| last_message_at | TEXT | ISO 8601 |

### 2.9 messages_meta

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | nanoid(21) |
| thread_id | TEXT FK→threads | |
| sender_agent_id | TEXT FK→agents | |
| created_at | TEXT | ISO 8601 |

> hub 不存内容，只存元数据用于线程展示。

### 2.10 pending_messages

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | nanoid(21) |
| recipient_agent_id | TEXT FK→agents | |
| thread_id | TEXT | |
| message_id | TEXT FK→messages_meta | |
| ciphertext | TEXT | base64url，加密 payload |
| sender_agent_id | TEXT FK→agents | |
| created_at | TEXT | ISO 8601 |
| expires_at | TEXT | ISO 8601，创建后 72 小时 |

### 2.11 audit_log

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | nanoid(21) |
| tenant_id | TEXT FK→tenants | |
| actor_id | TEXT | userId 或 agentId |
| action | TEXT | 事件类型 |
| target_id | TEXT | 操作对象 ID |
| created_at | TEXT | ISO 8601 |

---

## 3. 认证与授权

### 3.1 认证方式

#### 3.1.1 Agent JWT（skill / MCP tool call）

```
Authorization: Bearer <jwt>
```

- 算法：HS256，密钥来自 Worker secret `JWT_SECRET`
- 有效期：90 天
- Claims：
  ```json
  {
    "sub": "<agentId>",
    "tenantId": "<tenantId>",
    "userId": "<userId>",
    "type": "agent",
    "iat": 1234567890,
    "exp": 1234567890
  }
  ```
- 颁发：`POST /api/agents/register` 后颁发
- 存储：skill 侧存入 OS keychain（不存磁盘文件）

#### 3.1.2 Session Cookie（PWA 浏览器）

- 由 Better Auth 管理（D1 adapter）
- HttpOnly + Secure + SameSite=Lax
- 有效期：7 天，活跃续签
- Better Auth 标准端点：`/api/auth/*`（sign-in, sign-up, sign-out, session）

### 3.2 权限矩阵

| 端点 | 未认证 | Agent JWT | Session-member | Session-admin | Session-owner |
|------|:------:|:---------:|:--------------:|:-------------:|:-------------:|
| POST /api/auth/* | ✓ | ✗ | ✗ | ✗ | ✗ |
| GET /api/invite/:token | ✓ | ✗ | ✓ | ✓ | ✓ |
| POST /api/agents/pair-init | ✓ | ✗ | ✗ | ✗ | ✗ |
| GET /api/agents/pair-status | ✗ | ✓ | ✓ | ✓ | ✓ |
| POST /api/agents/pair-confirm | ✗ | ✗ | ✓ | ✓ | ✓ |
| POST /api/agents/register | ✗ | ✓ | ✗ | ✗ | ✗ |
| GET /api/tenants | ✗ | ✗ | ✓ | ✓ | ✓ |
| POST /api/tenants | ✗ | ✗ | ✓(创建新 tenant) | ✓ | ✓ |
| GET /api/tenants/:id | ✗ | ✗ | ✓ | ✓ | ✓ |
| PATCH /api/tenants/:id | ✗ | ✗ | ✗ | ✓ | ✓ |
| POST /api/tenants/:id/invite | ✗ | ✗ | ✗ | ✓ | ✓ |
| GET /api/tenants/:id/invitations | ✗ | ✗ | ✗ | ✓ | ✓ |
| DELETE /api/tenants/:id/invitations/:invId | ✗ | ✗ | ✗ | ✓ | ✓ |
| POST /api/invite/:token/accept | ✗ | ✗ | ✓ | ✓ | ✓ |
| GET /api/tenants/:id/agents | ✗ | ✗ | ✓ | ✓ | ✓ |
| GET /api/me/agents | ✗ | ✓(自己) | ✓(自己) | ✓ | ✓ |
| DELETE /api/agents/:agentId | ✗ | ✓(仅自己的) | ✗ | ✓ | ✓ |
| GET /api/agents/:agentId/prekey-bundle | ✗ | ✓ | ✓ | ✓ | ✓ |
| PUT /api/agents/:agentId/prekeys | ✗ | ✓(仅自己的) | ✗ | ✗ | ✗ |
| POST /api/messages | ✗ | ✓ | ✗ | ✗ | ✗ |
| GET /api/messages/inbox | ✗ | ✓ | ✓ | ✓ | ✓ |
| GET /api/messages/:id | ✗ | ✓(仅 recipient) | ✓(仅 recipient) | ✓ | ✓ |
| POST /api/messages/:id/accept | ✗ | ✓(仅 recipient) | ✓(仅 recipient) | ✓ | ✓ |
| POST /api/messages/:id/reject | ✗ | ✓(仅 recipient) | ✓(仅 recipient) | ✓ | ✓ |
| GET /ws | ✗ | ✗ | ✓ | ✓ | ✓ |
| POST /api/a2a/message | ✓(ed25519 签名验证) | ✗ | ✗ | ✗ | ✗ |
| GET /api/a2a/agent-card/:agentId | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## 4. API 端点清单

### 4.1 认证模块（Better Auth）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/sign-up | 注册 |
| POST | /api/auth/sign-in/email | 邮箱密码登录 |
| POST | /api/auth/sign-out | 登出 |
| GET | /api/auth/session | 当前 session |

### 4.2 Tenant 管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/tenants | 列出当前用户的 tenants |
| POST | /api/tenants | 创建 tenant |
| GET | /api/tenants/:id | 获取 tenant 详情 |
| PATCH | /api/tenants/:id | 更新 tenant 设置 |
| POST | /api/tenants/:id/invite | 邀请成员 |
| GET | /api/tenants/:id/invitations | 邀请列表 |
| DELETE | /api/tenants/:id/invitations/:invId | 撤销邀请 |
| GET | /api/invite/:token | 验证邀请 token |
| POST | /api/invite/:token/accept | 接受邀请 |

### 4.3 设备配对

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/agents/pair-init | skill：生成配对码 |
| GET | /api/agents/pair-status | skill：轮询配对状态 |
| POST | /api/agents/pair-confirm | PWA：浏览器确认配对 |
| POST | /api/agents/register | skill：正式注册 agent |

### 4.4 Agent 管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/tenants/:id/agents | 列出 tenant 的 agents |
| GET | /api/me/agents | 列出当前用户自己的 agents |
| DELETE | /api/agents/:agentId | 撤销 agent |
| GET | /api/agents/:agentId/prekey-bundle | X3DH 密钥束 |
| PUT | /api/agents/:agentId/prekeys | 上传一次性预密钥 |

### 4.5 消息

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/messages | skill 发送消息 |
| GET | /api/messages/inbox | 收件箱（待领取消息列表） |
| GET | /api/messages/:id | 获取消息详情（含密文） |
| POST | /api/messages/:id/accept | 接收并标记已领取 |
| POST | /api/messages/:id/reject | 拒绝消息 |

### 4.6 WebSocket

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /ws | PWA 长连接升级（CF DO Hibernation） |

### 4.7 A2A 兼容

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/a2a/message | 接收 Google A2A wire 格式消息 |
| GET | /api/a2a/agent-card/:agentId | Agent 公开信息（A2A Agent Card） |

---

## 5. 端点详细设计

### 5.1 POST /api/tenants — 创建 Tenant

**对应 UI**：/onboarding 页，填写 tenant 名称后提交

**认证**：Session Cookie（已登录用户）

**请求**
```json
{
  "slug": "my-team",
  "displayName": "My Team"
}
```

**业务规则**
- `slug`：3-32 字符，仅 `[a-z0-9-]`，全局唯一
- `displayName`：1-50 字符
- 创建者自动成为 owner 并加入 memberships
- 同时为创建者在 DO 中 boot 一个 TenantDO 实例

**成功响应 201**
```json
{
  "data": {
    "id": "V1StGXR8_Z5jdHi6B-myT",
    "slug": "my-team",
    "displayName": "My Team",
    "plan": "free",
    "createdAt": "2026-05-09T12:00:00Z"
  }
}
```

**错误响应**
| 状态码 | code | 场景 |
|--------|------|------|
| 409 | SLUG_TAKEN | slug 已被占用 |
| 422 | VALIDATION_ERROR | slug/displayName 格式错误 |

---

### 5.2 POST /api/tenants/:id/invite — 邀请成员

**对应 UI**：/app/:tenant/members 页，邀请按钮

**认证**：Session Cookie，role ≥ admin

**请求**
```json
{
  "email": "alice@example.com",
  "role": "member"
}
```

**业务规则**
- 同一 tenant 对同一邮箱只能有一个有效邀请（`used_at IS NULL AND expires_at > now`）
- 已是成员的邮箱返回 409
- token = 64 字符 hex，过期时间 = 创建时间 + 7 天
- 不发邮件（MVP 范围内手动分享链接）

**成功响应 201**
```json
{
  "data": {
    "id": "...",
    "email": "alice@example.com",
    "role": "member",
    "token": "abc123...",
    "expiresAt": "2026-05-16T12:00:00Z"
  }
}
```

**错误响应**
| 状态码 | code | 场景 |
|--------|------|------|
| 409 | ALREADY_MEMBER | 该邮箱已是成员 |
| 409 | INVITE_PENDING | 该邮箱已有有效邀请 |
| 403 | FORBIDDEN | 不是 admin/owner |

---

### 5.3 POST /api/agents/pair-init — skill 生成配对码

**对应 UI**：CLI 输出 + /connect?code=X 页面扫码确认

**认证**：无（任何人可以申请配对码，需在浏览器侧绑定）

**请求**（无 body）

**业务规则**
- 生成 6 位大写字母数字码（随机，需保证唯一，碰撞重试）
- 过期时间：10 分钟
- agent_id = null，tenant_id = null（配对完成前未知）

**成功响应 201**
```json
{
  "data": {
    "code": "A3K9MZ",
    "expiresAt": "2026-05-09T12:10:00Z"
  }
}
```

---

### 5.4 GET /api/agents/pair-status?code=A3K9MZ — 轮询配对状态

**对应 UI**：skill 侧轮询，等待浏览器确认

**认证**：无（code 本身是凭证）

**查询参数**：`code`（必填，6 位大写字母数字）

**状态流转**：
```
pending → claimed (浏览器确认后) → registered (skill 注册后)
```

**成功响应 200**
```json
{
  "data": {
    "status": "pending",   // "pending" | "claimed" | "registered"
    "tenantId": null,      // claimed 后填入
    "userId": null         // claimed 后填入
  }
}
```

**错误响应**
| 状态码 | code | 场景 |
|--------|------|------|
| 404 | CODE_NOT_FOUND | code 不存在或已过期 |

---

### 5.5 POST /api/agents/pair-confirm — PWA 确认配对

**对应 UI**：/connect?code=X 页面，用户点击"绑定到此账号"

**认证**：Session Cookie（已登录 PWA 用户）

**请求**
```json
{
  "code": "A3K9MZ",
  "tenantId": "V1StGXR8_Z5jdHi6B-myT",
  "displayName": "My Laptop — Cursor"
}
```

**业务规则**
- code 必须存在且未过期（expires_at > now）
- code 必须处于 `pending` 状态（claimed_at IS NULL）
- 用户必须是 tenantId 的成员
- `displayName`：1-50 字符
- 更新 device_pairing_codes：claimed_at = now，tenant_id = tenantId

**成功响应 200**
```json
{
  "data": {
    "code": "A3K9MZ",
    "status": "claimed"
  }
}
```

**错误响应**
| 状态码 | code | 场景 |
|--------|------|------|
| 404 | CODE_NOT_FOUND | code 不存在或已过期 |
| 409 | CODE_ALREADY_CLAIMED | code 已被领取 |
| 403 | NOT_MEMBER | 用户不是该 tenant 成员 |

---

### 5.6 POST /api/agents/register — skill 正式注册

**对应 UI**：pair-status 返回 `claimed` 后，skill 自动执行

**认证**：无（code 作为一次性凭证）

**请求**
```json
{
  "code": "A3K9MZ",
  "identityKey": "<base64url ed25519 pubkey 32B>",
  "signedPrekey": "<base64url X25519 pubkey 32B>",
  "signedPrekeySignature": "<base64url ed25519 sig>",
  "oneTimePrekeys": [
    { "keyId": 1, "publicKey": "<base64url X25519 pubkey>" },
    { "keyId": 2, "publicKey": "<base64url X25519 pubkey>" }
  ],
  "displayName": "My Laptop — Cursor"
}
```

**业务规则**
- code 必须处于 `claimed` 状态（claimed_at IS NOT NULL，registered_at IS NULL）
- `oneTimePrekeys`：至少 10 个，最多 100 个
- 验证 `signedPrekeySignature`：`ed25519.verify(signedPrekey, signedPrekeySignature, identityKey)`
- 成功后颁发 JWT（90 天），更新 code 状态为 registered
- 一个 code 只能用一次

**成功响应 201**
```json
{
  "data": {
    "agentId": "V1StGXR8_Z5jdHi6B-myT",
    "jwt": "<90-day HS256 token>",
    "tenantId": "...",
    "expiresAt": "2026-08-07T12:00:00Z"
  }
}
```

**错误响应**
| 状态码 | code | 场景 |
|--------|------|------|
| 404 | CODE_NOT_FOUND | code 不存在 |
| 422 | CODE_NOT_CLAIMED | code 尚未被浏览器确认 |
| 409 | CODE_ALREADY_REGISTERED | code 已注册 |
| 422 | SIGNATURE_INVALID | signedPrekeySignature 验证失败 |
| 422 | INSUFFICIENT_PREKEYS | 少于 10 个 oneTimePrekeys |

---

### 5.7 GET /api/agents/:agentId/prekey-bundle — X3DH 密钥束

**对应 UI**：发送消息前调用，PWA 和 skill 均需

**认证**：Agent JWT 或 Session Cookie

**路径参数**：`agentId`（接收方 agent ID）

**业务规则**
- 返回 identityKey + signedPrekey + 一个未消耗的 oneTimePrekey（如有）
- 消耗 oneTimePrekey（标记 consumed_at = now）
- 如无剩余 OTP，返回 `"oneTimePrekey": null`，仍可完成 X3DH（降级）
- 消耗 OTP 后如剩余 < 10，在响应中附 `"lowPrekeys": true` 提示 skill 补充

**成功响应 200**
```json
{
  "data": {
    "agentId": "...",
    "identityKey": "<base64url>",
    "signedPrekey": "<base64url>",
    "signedPrekeySignature": "<base64url>",
    "oneTimePrekey": {
      "keyId": 42,
      "publicKey": "<base64url>"
    },
    "lowPrekeys": false
  }
}
```

**错误响应**
| 状态码 | code | 场景 |
|--------|------|------|
| 404 | AGENT_NOT_FOUND | agent 不存在 |

---

### 5.8 POST /api/messages — skill 发送消息

**对应 UI**：skill 侧发送，对应 UI 中的 inbox 推送

**认证**：Agent JWT

**请求**
```json
{
  "recipientAgentId": "...",
  "threadId": null,          // null = 新会话
  "ciphertext": "<base64url AES-256-GCM encrypted>",
  "senderIdentityKey": "<base64url>",
  "ephemeralKey": "<base64url X25519>",
  "usedOtpKeyId": 42         // null = 无 OTP
}
```

**业务规则**
- 发送方必须是 tenant 成员（sender 和 recipient 在同一 tenant）
- `threadId` 为 null 时自动创建新 thread
- hub 不解密 ciphertext，直接存入 pending_messages
- 消息 TTL 72 小时（超时未领取自动删除）
- 创建 messages_meta 记录（无内容）
- 如 recipient 有活跃 WebSocket 连接，通过 DO 推送通知

**成功响应 202**
```json
{
  "data": {
    "messageId": "...",
    "threadId": "...",
    "accepted": true
  }
}
```

**错误响应**
| 状态码 | code | 场景 |
|--------|------|------|
| 404 | RECIPIENT_NOT_FOUND | recipient agent 不存在 |
| 403 | CROSS_TENANT | 发送方和接收方不在同一 tenant |
| 422 | CIPHERTEXT_TOO_LARGE | ciphertext 超过 64KB |

---

### 5.9 GET /api/messages/inbox — 收件箱

**对应 UI**：/app/:tenant/inbox 页 + devices 页消息通知

**认证**：Agent JWT 或 Session Cookie

**查询参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| cursor | string | 分页游标 |
| limit | number | 默认 20，上限 100 |
| tenantId | string | Agent JWT 时必填 |

**成功响应 200**
```json
{
  "data": {
    "messages": [
      {
        "id": "...",
        "threadId": "...",
        "senderAgentId": "...",
        "senderName": "Alice — Cursor",
        "createdAt": "2026-05-09T12:00:00Z",
        "status": "pending"
      }
    ]
  },
  "meta": {
    "nextCursor": "eyJpZCI6IjEyMyJ9"
  }
}
```

> 注意：inbox 返回元数据，不含 ciphertext。调用 `/api/messages/:id` 获取密文。

---

### 5.10 GET /api/messages/:id — 获取消息密文

**对应 UI**：PWA thread 详情页 / skill 领取消息

**认证**：Agent JWT（recipient）或 Session Cookie（recipient 所属用户）

**业务规则**
- 只有 recipient 可以获取（`recipient_agent_id` 校验）
- 不自动删除（需调用 /accept 后才删除 pending_message）

**成功响应 200**
```json
{
  "data": {
    "id": "...",
    "threadId": "...",
    "senderAgentId": "...",
    "ciphertext": "<base64url>",
    "senderIdentityKey": "<base64url>",
    "ephemeralKey": "<base64url>",
    "usedOtpKeyId": 42,
    "createdAt": "2026-05-09T12:00:00Z"
  }
}
```

**错误响应**
| 状态码 | code | 场景 |
|--------|------|------|
| 404 | MESSAGE_NOT_FOUND | 不存在或已过期 |
| 403 | FORBIDDEN | 不是 recipient |

---

### 5.11 POST /api/messages/:id/accept — 领取消息

**对应 UI**：skill 解密后确认 / PWA 读取后确认

**认证**：Agent JWT（recipient）或 Session Cookie

**请求**（无 body）

**业务规则**
- 验证 recipient 身份
- 删除 pending_messages 记录（保留 messages_meta）
- 不可逆

**成功响应 204**（No Content）

---

### 5.12 WebSocket GET /ws

**对应 UI**：PWA 应用页，实时 inbox 推送

**认证**：Session Cookie（Upgrade 请求携带 cookie）

**连接后服务端推送帧**

```json
// 新消息到达
{ "type": "message.new", "payload": { "messageId": "...", "threadId": "...", "senderAgentId": "..." } }

// agent 上线/下线
{ "type": "agent.status", "payload": { "agentId": "...", "online": true } }

// 配对成功通知（/connect 页面）
{ "type": "pair.confirmed", "payload": { "code": "A3K9MZ", "agentId": "..." } }

// ping/pong（CF DO Hibernation 保活）
{ "type": "ping" }
{ "type": "pong" }
```

**客户端发送帧**

```json
// 订阅 tenant（连接后发送）
{ "type": "subscribe", "payload": { "tenantId": "..." } }
{ "type": "pong" }
```

**业务规则**
- 使用 Cloudflare DO Hibernation API（`acceptWebSocket`）
- idle 不计费
- 连接断开后 PWA 自动重连（指数退避，上限 30s）

---

### 5.13 POST /api/a2a/message — A2A 兼容接入

**对应 UI**：外部 agent 发送消息，不直接对应 UI 操作

**认证**：无（ed25519 信封签名验证）

**请求**（Google A2A v1.0 wire format）
```json
{
  "messageId": "<uuid>",
  "role": "user",
  "parts": [{ "text": "..." }],
  "metadata": {
    "senderIdentityKey": "<base64url>",
    "recipientAgentId": "<agentId>",
    "signature": "<base64url ed25519 sig over canonical JSON>"
  }
}
```

**业务规则**
- 验证 ed25519 签名（`senderIdentityKey` 对 canonical JSON 的签名）
- `senderIdentityKey` 必须在 agents 表中存在（注册过的 agent）
- 将消息转化为 pending_messages 格式存储
- ciphertext 由发送方提供，hub 不感知内容

**成功响应 202**
```json
{
  "data": { "accepted": true, "messageId": "..." }
}
```

---

## 6. 第三方集成

| 服务 | 用途 | 接入方式 |
|------|------|---------|
| Better Auth | 用户注册 / 登录 / session 管理 | Library + D1 adapter，无外部 HTTP |
| Cloudflare D1 | SQL 持久化 | CF Worker binding，无 HTTP |
| Cloudflare Durable Objects | per-tenant 实时状态 + WS | CF Worker binding，无 HTTP |
| Google A2A Protocol | 外部 agent 互联 | 接收标准 wire format（仅入站） |

**说明**：hub 不调用任何 LLM API。所有 AI 推理在 skill 侧完成，hub 只做路由和存储。

---

## 7. 数据流汇总

### 7.1 设备配对流（OAuth Device Flow 风格）

```
skill                    hub                     PWA
 │                        │                       │
 │── POST /pair-init ────►│                       │
 │◄── { code, expires } ──│                       │
 │                        │                       │
 │  (skill prints code)   │                       │
 │                        │◄── POST /pair-confirm ─│
 │                        │    { code, tenantId }  │
 │                        │─── 200 claimed ───────►│
 │                        │                       │
 │── GET /pair-status ───►│                       │
 │◄── { status:claimed } ─│                       │
 │                        │                       │
 │── POST /register ─────►│                       │
 │◄── { jwt, agentId } ───│                       │
```

### 7.2 E2E 加密消息发送流

```
sender-skill             hub                  recipient
 │                        │                       │
 │── GET /prekey-bundle ─►│                       │
 │◄── { ik, spk, otpk } ─│                       │
 │                        │                       │
 │  (X3DH key agreement)  │                       │
 │  (AES-256-GCM encrypt) │                       │
 │                        │                       │
 │── POST /messages ─────►│                       │
 │◄── 202 accepted ───────│                       │
 │                        │──── WS push ─────────►│ (if online)
 │                        │                       │
 │                        │◄─ GET /messages/inbox ─│
 │                        │─── [ meta list ] ─────►│
 │                        │◄─ GET /messages/:id ───│
 │                        │─── { ciphertext } ────►│
 │                        │◄─ POST /:id/accept ────│
 │                        │─── 204 ───────────────►│
 │                        │  (pending_message 删除) │
```

---

## 8. 与设计文档的一致性确认

| 设计决策 | API 实现 | 一致 |
|---------|---------|------|
| skill→hub HTTP 主路径 | POST /api/messages HTTP | ✓ |
| pwa→hub WebSocket 长连接 | GET /ws CF DO Hibernation | ✓ |
| E2E 加密，hub 不读内容 | hub 存 ciphertext base64url，不解密 | ✓ |
| X3DH 密钥协商 | GET /prekey-bundle 返回 ik+spk+otpk | ✓ |
| ed25519 签名验证 | register 验签 signedPrekeySignature；A2A 验签信封 | ✓ |
| Better Auth session | POST /api/auth/* + cookie 认证 | ✓ |
| Device Authorization Grant 风格配对 | pair-init → pair-confirm → register 三步流 | ✓ |
| A2A v1.0 wire 兼容 | POST /api/a2a/message + agent-card | ✓ |
