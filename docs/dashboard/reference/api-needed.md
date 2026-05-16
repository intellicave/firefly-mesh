# Reference — Hub 待新增 API

> 按 feature 分组,标注优先级。所有契约都按 [`api-implemented.md`](api-implemented.md) 的约定(cookie auth + 错误格式)。
>
> 执行顺序见 [`../migration/03-hub-extend.md`](../migration/03-hub-extend.md)。

优先级:
- **P0** = dashboard 启动必须有
- **P1** = dashboard 完整功能必须有
- **P2** = nice-to-have,可推迟到 V2

---

## 1. Account — feature 07

### P0 — `GET /api/me`

返回当前 user 的概览,dashboard 启动时一次拉齐,避免多次 fetch。

**Response**:
```json
{
  "data": {
    "user": { "id": "...", "name": "...", "email": "...", "image": "..." },
    "tenants": [
      { "id": "...", "slug": "...", "name": "...", "role": "owner" }
    ],
    "default_tenant_id": "...",
    "onboarding": { "completed": true }
  }
}
```

### P0 — `PATCH /api/me`

改 user 自己的 name(其余字段保留)。

**Request**: `{ name: string }`
**Response**: `{ data: { user } }`

### P2 — `POST /api/me/avatar`

multipart 上传头像。V1 用 OAuth provider 头像,V2 加。

---

## 2. Onboarding — feature 08

### P0 — `GET /api/onboarding/state?tenantId=...`

**Response**:
```json
{
  "data": {
    "user_id": "...", "tenant_id": "...",
    "created_org": true,
    "imported": false, "skipped_import": true,
    "paired_agent": false, "skipped_pair": false,
    "completed": false
  }
}
```

### P0 — `POST /api/onboarding/state`

**Request**: `{ tenantId: string, step: 'created_org'|'imported'|'skipped_import'|'paired_agent'|'skipped_pair', value: boolean }`
更新单字段,并自动派生 `completed` 字段(`created_org && (imported||skipped_import) && (paired_agent||skipped_pair)`)。
**Response**: `{ data: onboarding_state }`

### P2 — `POST /api/onboarding/import`

multipart 上传 CSV。V1 返回 501 `{ message: "Coming soon. Use Skip for now." }`。

---

## 3. Organization — feature 03

### P0 — Employees CRUD

| Method | Path | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/tenants/:id/employees?cursor=&q=` | member | 列表 + 搜索(`q` 模糊匹配 name/email) |
| POST | `/api/tenants/:id/employees` | owner/admin | body `{ name, email?, role_in_tenant?, department_id? }` |
| PATCH | `/api/tenants/:id/employees/:eid` | owner/admin | 改 name/department/status |
| DELETE | `/api/tenants/:id/employees/:eid` | owner/admin | 软删(status=suspended) |

### P0 — Departments CRUD

| Method | Path | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/tenants/:id/departments` | member | |
| POST | `/api/tenants/:id/departments` | owner/admin | body `{ name, lead_employee_id? }` |
| PATCH | `/api/tenants/:id/departments/:did` | owner/admin | |
| DELETE | `/api/tenants/:id/departments/:did` | owner/admin | 删除时 employees.department_id 置 NULL |

### P0 — Projects CRUD

| Method | Path | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/tenants/:id/projects` | member | |
| POST | `/api/tenants/:id/projects` | owner/admin | body `{ name, owner_employee_id, due_date? }` |
| PATCH | `/api/tenants/:id/projects/:pid` | owner/admin | |
| DELETE | `/api/tenants/:id/projects/:pid` | owner/admin | 级联删 tasks + project_members |

### P1 — Project members + Tasks

| Method | Path | 权限 |
|---|---|---|
| GET | `/api/projects/:id/members` | member |
| POST | `/api/projects/:id/members` | owner/admin |
| DELETE | `/api/projects/:id/members/:eid` | owner/admin |
| GET | `/api/projects/:id/tasks` | member |
| POST | `/api/projects/:id/tasks` | owner/admin |
| PATCH | `/api/projects/:id/tasks/:tid` | owner/admin |
| DELETE | `/api/projects/:id/tasks/:tid` | owner/admin |

### P1 — 成员管理 (membership × user)

| Method | Path | 权限 | 说明 |
|---|---|---|---|
| PATCH | `/api/tenants/:id/members/:userId` | owner | 改 role |
| DELETE | `/api/tenants/:id/members/:userId` | owner | 踢出成员 |
| DELETE | `/api/invitations/:token` | owner/admin | 撤销 pending 邀请 |

---

## 4. Knowledge — feature 04

### P0 — Folders CRUD

| Method | Path | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/tenants/:id/folders` | member | 返回所有 folder(member 按 boundary 裁剪) |
| POST | `/api/tenants/:id/folders` | owner/admin | body `{ name, parent_id? }` |
| PATCH | `/api/tenants/:id/folders/:fid` | owner/admin | |
| DELETE | `/api/tenants/:id/folders/:fid?force=1` | owner/admin | 默认非空时 reject,`force=1` 递归删 |

### P0 — Documents CRUD

| Method | Path | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/folders/:fid/documents?cursor=` | member (按 boundary) | |
| GET | `/api/documents/:id` | member (按 boundary) | 含完整 content_md |
| POST | `/api/documents` | owner/admin | body `{ folder_id, title, content_md, tags? }`,size 上限 256KB |
| PATCH | `/api/documents/:id` | owner/admin | |
| DELETE | `/api/documents/:id` | owner/admin | 硬删 |

### P1 — Upload (multipart)

`POST /api/documents/upload` — multipart 上传(V1 可用 base64 JSON 兜底)

### P0 — Boundaries CRUD

| Method | Path | 权限 |
|---|---|---|
| GET | `/api/tenants/:id/boundaries` | owner/admin |
| POST | `/api/tenants/:id/boundaries` | owner/admin |
| PATCH | `/api/tenants/:id/boundaries/:bid` | owner/admin |
| DELETE | `/api/tenants/:id/boundaries/:bid` | owner/admin |

### V2 — Agent 端拉知识

`GET /api/agent/knowledge?q=...` — agent JWT auth,按 boundary 自动裁剪结果。V1 dashboard 不依赖,V2 配合 skill 执行引擎。

---

## 5. Skills — feature 05

### P0 — Skills CRUD

| Method | Path | 权限 |
|---|---|---|
| GET | `/api/tenants/:id/skills` | member |
| POST | `/api/tenants/:id/skills` | owner/admin |
| PATCH | `/api/tenants/:id/skills/:sid` | owner/admin |
| DELETE | `/api/tenants/:id/skills/:sid` | owner/admin |

### P0 — Tools CRUD

| Method | Path | 权限 |
|---|---|---|
| GET | `/api/tenants/:id/tools` | member |
| POST | `/api/tenants/:id/tools` | owner/admin |
| PATCH | `/api/tenants/:id/tools/:tid` | owner/admin |
| DELETE | `/api/tenants/:id/tools/:tid` | owner/admin |

### P1 — Tool test connection

`POST /api/tools/:id/test` — V1 简化:HEAD `tool.endpoint` 5s 超时。

### P1 — Router rules CRUD

| Method | Path | 权限 |
|---|---|---|
| GET | `/api/tenants/:id/router-rules` | owner/admin |
| POST | `/api/tenants/:id/router-rules` | owner/admin |
| PATCH | `/api/tenants/:id/router-rules/:rid` | owner/admin |
| DELETE | `/api/tenants/:id/router-rules/:rid` | owner/admin |
| POST | `/api/tenants/:id/router-rules/reorder` body `{ ids: string[] }` | owner/admin |

### V2 — Skill runs

`GET /api/skills/:id/runs?cursor=` — V1 表为空,V2 写。

---

## 6. Audit — feature 06

### P0 — `GET /api/tenants/:id/audit?kind=&actor=&from=&to=&cursor=&limit=`

**Query params**:
- `kind` — 过滤事件类型
- `actor` — `user:<id>` 或 `agent:<id>`
- `from` / `to` — ISO 日期范围
- `cursor` — 上一页最后一行的 id
- `limit` — 默认 50,上限 500

**Response**: `{ data: AuditEvent[], next_cursor: string | null }`

**权限**: owner/admin only(V1)。

### P1 — `GET /api/audit/:id`

单条详情。

### P1 — `GET /api/tenants/:id/audit/export.csv`

CSV 导出,同 query params + 上限 10k 行,超过返回 413。

---

## 7. Messaging — feature 01 (补强)

### P1 — `direction=sent` 查询参数

现有 `GET /api/tenants/:id/messages` 增加 `direction=sent|received`(默认 received)。后端加 index `(from_agent_id_in_tenant, created_at DESC)` 或简化为应用层过滤。

### P1 — `GET /api/messages/:id`

单条消息详情(含完整 body)。Sheet 展开时用。

### P2 — `POST /api/inbox/mark-read`

批量标记已读,body `{ ids: string[] }`。

---

## 8. 优先级矩阵

| Feature | P0 端点数 | P1 端点数 | P2/V2 |
|---|---|---|---|
| 01 Cross-org messaging | 0 (主体已有) | 3 | 1 |
| 02 Agent onboarding | 0 (主体已有) | 1 (online 状态) | 0 |
| 03 Organization | 12 (employee+dept+project CRUD) | 9 (tasks+members+role) | 0 |
| 04 Knowledge | 12 (folder+doc+boundary CRUD) | 1 (upload) | 1 (agent 端) |
| 05 Skills | 8 (skill+tool CRUD) | 7 (router+test) | 1 (runs) |
| 06 Audit | 1 (list) | 2 (detail+export) | 0 |
| 07 Account | 2 (`me` GET/PATCH) | 0 | 1 (avatar) |
| 08 Onboarding | 2 (state GET/POST) | 0 | 1 (import) |

**总计**:P0 = 37,P1 = 23,V2 = 5。

**估时**:P0 端点(全部 CRUD + 简单查询)≈ 4-5 工作日,含 D1 migration 0005-0008 + tests。

---

## 9. 通用约定

每个新增端点都要:
- [ ] 套 `requireSession` middleware
- [ ] 写操作套 `requireRole(['owner','admin'])`(或 `'owner'`)
- [ ] tenant-scoped 资源套 `requireTenantMembership`
- [ ] 跨 tenant 攻击返回 403 或 404(让攻击者无法区分"存在但无权"和"不存在")
- [ ] 写操作在 audit_log 留痕(显式 INSERT 或 trigger)
- [ ] 限流:写操作走 `RL_MESSAGE` 同级,V1 复用 binding,V2 加专用 binding
- [ ] 校验 body:用 `zod` schema(项目已用)
