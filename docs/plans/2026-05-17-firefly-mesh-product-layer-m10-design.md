# M10 — Design

## 1. 架构影响

| 层 | 变化 |
|---|---|
| Schema | 加 1 张表 `tasks` |
| Lib | 加 `lib/tasks.ts`（状态机 + RBAC） |
| Routes | 加 `routes/tasks.ts`（5 endpoint） |
| 上 sprint 产物 | 不动（a2a_messages 表的 relatedTaskId 软引用现在变成 effective FK） |

## 2. Schema

```sql
CREATE TABLE tasks (
  id                       TEXT PRIMARY KEY,
  org_id                   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Goal ancestry (V1.1 sub-task tree; ship fields, don't recurse)
  parent_id                TEXT,                       -- soft self-ref
  root_id                  TEXT,                       -- soft self-ref

  -- 3 parties
  creator_employee_id      TEXT NOT NULL REFERENCES employees(id) ON DELETE SET NULL,
  assignee_employee_id     TEXT REFERENCES employees(id) ON DELETE SET NULL,
  reviewer_employee_id     TEXT REFERENCES employees(id) ON DELETE SET NULL,

  title                    TEXT NOT NULL,
  description              TEXT,
  output                   TEXT,                       -- JSON serialised
  deadline                 TEXT,                       -- ISO8601

  status                   TEXT NOT NULL DEFAULT 'assigned'
    CHECK (status IN (
      'pending_dispatch_approval', 'assigned', 'in_progress',
      'pending_review', 'rejected', 'approved', 'cancelled'
    )),

  -- a2a linkage (V1.1 auto-populate; ship nullable for forward-compat)
  dispatch_approval_id     TEXT REFERENCES a2a_messages(id) ON DELETE SET NULL,
  review_approval_id       TEXT REFERENCES a2a_messages(id) ON DELETE SET NULL,

  review_round             INTEGER NOT NULL DEFAULT 0,
  review_comment           TEXT,

  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);
CREATE INDEX idx_tasks_org ON tasks(org_id);
CREATE INDEX idx_tasks_assignee_status ON tasks(assignee_employee_id, status);
CREATE INDEX idx_tasks_reviewer_status ON tasks(reviewer_employee_id, status);
CREATE INDEX idx_tasks_creator ON tasks(creator_employee_id);
```

**字段说明**：
- `output` TEXT 存 JSON（与 hub 约定一致）
- `parent_id` / `root_id` 软引用（防 SQLite 自引用 FK 麻烦）
- `dispatch_approval_id` / `review_approval_id` FK 到 a2a_messages（M11 表），SET NULL 防互相依赖
- `review_round` INTEGER（不是 v0 的 text）

## 3. State machine

定义在 `lib/tasks.ts`：

```typescript
export type TaskStatus =
  | "pending_dispatch_approval"   // V1.1 LLM flow
  | "assigned"
  | "in_progress"
  | "pending_review"
  | "rejected"
  | "approved"                    // terminal
  | "cancelled"                   // terminal V1.1

// Transitions allowed from each state
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending_dispatch_approval: ["assigned", "cancelled"],
  assigned: ["in_progress", "pending_review", "cancelled"],
  in_progress: ["pending_review", "cancelled"],
  pending_review: ["approved", "rejected", "cancelled"],
  rejected: ["pending_review", "cancelled"],   // resubmit
  approved: [],                                 // terminal
  cancelled: [],                                // terminal
}
```

**Helper**: `assertValidTransition(from, to)` throws on invalid.

## 4. RBAC

| 操作 | 谁能做 |
|---|---|
| POST /api/tasks (create assigned) | owner/admin/manager |
| POST /api/tasks/:id/start (assigned → in_progress) | assignee 本人 / admin/owner |
| POST /api/tasks/:id/submit (assigned/in_progress/rejected → pending_review) | assignee 本人 OR 其 agent（带 submit_task scope）/ admin/owner |
| POST /api/tasks/:id/review (pending_review → approved/rejected) | reviewer 本人 / admin/owner（**assignee 不能 review 自己**） |
| GET /api/tasks (list) | 全部 employee 可看；employee 看自己创建/分配/复核的；admin/owner/auditor 看全部 |
| GET /api/tasks/:id (detail) | 同 list 权限 |

**约束**：
- `assignee_employee_id != reviewer_employee_id` —— 创建时强制（防自批，硬规则；admin/owner 强制 review 时不受此限）
- `creator_employee_id` 自动 = 调用者 employee.id（不能伪造）

## 5. 5 个 endpoint 详细设计

### 5.1 POST /api/tasks

**Auth**: session + orgGuard + requireRole(['owner','admin','manager'])

**Request**:
```typescript
zValidator("json", z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  assigneeEmployeeId: z.string(),                  // required
  reviewerEmployeeId: z.string(),                  // required (V1.1 可选 → 自动 = creator)
  deadline: z.string().datetime().optional(),
  parentId: z.string().optional(),                 // V1.1; current sprint may accept but no validation
}))
```

**Logic**:
1. 验 assignee 在同 tenant
2. 验 reviewer 在同 tenant
3. 校验 assignee != reviewer（强制；admin 例外? 不，创建期强制硬约束）
4. INSERT tasks status='assigned' creator=requester rootId=null parentId=body.parentId
5. UPDATE tasks SET rootId=id WHERE id=newId  (root = self)
6. writeAudit action='task.created' resource=task payload={title, assignee, reviewer, deadline}

**Response 201**: `{ data: <full task row> }`

### 5.2 POST /api/tasks/:id/start

**Auth**: session + orgGuard

**Logic**:
1. 查 task in tenant; 404 if not found
2. RBAC: caller employee.id === assignee_employee_id OR admin/owner
3. assertValidTransition(status, 'in_progress')
4. UPDATE status='in_progress', updated_at=now
5. writeAudit action='task.started'

### 5.3 POST /api/tasks/:id/submit

**Auth**: session OR agent JWT

**Request body**: `{ output?: object | string }`

**Logic**:
1. 查 task
2. RBAC:
   - session: caller employee.id === assignee OR admin/owner
   - agent JWT: agent.ownerEmployeeId === assignee (lookup) AND JWT scope includes "submit_task"
3. assertValidTransition(status, 'pending_review')
4. UPDATE status='pending_review', output=JSON.stringify(body.output ?? null), updated_at=now
5. writeAudit

### 5.4 POST /api/tasks/:id/review

**Auth**: session + orgGuard

**Request body**: `{ decision: 'approved'|'rejected', comment?: string }`

**Logic**:
1. 查 task
2. RBAC: caller employee.id === reviewer OR admin/owner
3. status must be 'pending_review'（否则 409）
4. assignee 不能 review 自己：if caller.id === assignee → 403 SELF_REVIEW_FORBIDDEN
5. newStatus = body.decision  ('approved' | 'rejected')
6. newRound = decision==='rejected' ? round+1 : round
7. UPDATE status=newStatus, review_round=newRound, review_comment=body.comment, updated_at=now
8. writeAudit payload={decision, round, comment}

### 5.5 GET /api/tasks/:id + GET /api/tasks

list query: `?status=&assignee=&reviewer=&cursor=&limit=&sort=`

- employee 角色：默认过滤 (assignee_employee_id=ME OR reviewer_employee_id=ME OR creator_employee_id=ME)
- 其他角色：返回全部
- 简单分页 cursor=createdAt

## 6. 与 a2a_messages 的关系

**本 sprint 不自动创建 a2a_message on task create/submit**。两个 nullable FK 字段（dispatch_approval_id / review_approval_id）作为 forward-compat 槽位，V1.1 自动 wire 时填。

a2a_messages.relatedTaskId（M11 留的字段）继续作为软引用 —— 客户端 agent 主动发 a2a_message 时如果是任务相关可以填 relatedTaskId，便于 dashboard 关联展示。

## 7. 决策记录

| ID | 主题 | 选 | 弃 | 理由 |
|---|---|---|---|---|
| M10-1 | 任务创建即 assigned | yes | 经过 pending_dispatch_approval | LLM dispatch 是 V1.1，简化流程 |
| M10-2 | reviewer 必填 | yes | 可空（auto=creator） | 显式胜过隐式；UI 必须给值 |
| M10-3 | assignee=reviewer 禁止 | yes | 允许 | 防自批 |
| M10-4 | 不实现 LLM dispatch | yes | 实现 | hub 不挑 LLM router |
| M10-5 | output 字段 TEXT JSON | yes | JSONB | D1 没 JSONB |
| M10-6 | review_round INTEGER | yes | TEXT（v0 是 text） | hub 数值清晰 |
| M10-7 | parent_id/root_id 软引用 | yes | FK | SQLite 自引用 FK 麻烦 |
| M10-8 | 不自动创建 a2a_message | yes | 自动 | session create 没 agent context |
| M10-9 | 不实现 /cancel /approve-dispatch | yes | 实现 | V1.1 |
