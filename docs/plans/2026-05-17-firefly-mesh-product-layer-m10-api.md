# M10 — API

## 1. 端点清单（5）

| Method | Path | Auth | RBAC |
|---|---|---|---|
| POST | /api/tasks | session+orgGuard | owner/admin/manager |
| GET | /api/tasks | session+orgGuard | any（employee 仅自己相关） |
| GET | /api/tasks/:id | session+orgGuard | any（同上）|
| POST | /api/tasks/:id/start | session+orgGuard | assignee/admin/owner |
| POST | /api/tasks/:id/submit | session OR agent JWT | assignee OR assignee's agent (submit_task scope) / admin/owner |
| POST | /api/tasks/:id/review | session+orgGuard | reviewer/admin/owner（assignee 不能 review 自己）|

合计 6 个；plan §0 说 5 个（合并 start 与 submit 为同一 endpoint？不，分开更清晰）。**实际 6 个**，更新 plan。

## 2. Request/Response 详细

### POST /api/tasks → 201

```typescript
// Request
{
  title: string (1-200),
  description?: string (≤5000),
  assigneeEmployeeId: string,
  reviewerEmployeeId: string,
  deadline?: ISO8601,
  parentId?: string,            // V1.1; accepted but unvalidated
}

// Response 201
{ data: {
  id, orgId, title, description,
  assigneeEmployeeId, reviewerEmployeeId, creatorEmployeeId,
  status: "assigned",
  deadline, parentId, rootId,
  reviewRound: 0, reviewComment: null,
  dispatchApprovalId: null, reviewApprovalId: null,
  output: null,
  createdAt, updatedAt,
}}
```

**Errors**: 400 VALIDATION_ERROR / 403 FORBIDDEN / 404 EMPLOYEE_NOT_FOUND / 409 SAME_ASSIGNEE_REVIEWER

### POST /api/tasks/:id/start → 200

Body: empty
Response: `{ data: { id, status: "in_progress", updatedAt } }`
Errors: 403 / 404 / 409 INVALID_TRANSITION

### POST /api/tasks/:id/submit → 200

```typescript
// Request
{ output?: object | string }
```

Response: `{ data: { id, status: "pending_review", updatedAt } }`
Errors: 403 (含 agent scope missing) / 404 / 409 / 422 NO_OWNER_EMPLOYEE (agent JWT case)

### POST /api/tasks/:id/review → 200

```typescript
// Request
{ decision: "approved" | "rejected", comment?: string (≤2000) }
```

Response: `{ data: { id, status: "approved" | "rejected", reviewRound, reviewComment, updatedAt } }`
Errors: 400 / 403 SELF_REVIEW_FORBIDDEN / 403 FORBIDDEN / 404 / 409

### GET /api/tasks → 200

Query:
```
?status=<status>
?assignee=<empId>
?reviewer=<empId>
?creator=<empId>
?cursor=<ISO>
?limit=1-100 (default 50)
?sort=desc|asc
?tenantId=  (consumed by orgGuard)
```

Response:
```json
{ "data": [<task>, ...], "nextCursor": "..." }
```

Filter for employee role: AND (assignee_emp = ME OR reviewer_emp = ME OR creator_emp = ME)
For others: no filter.

### GET /api/tasks/:id → 200

`{ data: <full task row> }`

## 3. 影响清单

| 路径 | 影响 |
|---|---|
| 上 sprint /api/a2a-messages/* | 0 |
| /api/employees/* | 0 |
| 所有 hub 现有 5 路由 | 0 |
| a2a_messages.relatedTaskId 软引用 | 现在 task 表存在了；客户端可选填 |
