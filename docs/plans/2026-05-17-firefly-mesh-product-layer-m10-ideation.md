# M10 — Ideation

## 1. 一句话定位

把"CEO/manager 给员工派任务 → 员工（或其 agent）做 → 复核人批准/驳回"的工单流变成 hub 后端的一等公民。

## 2. 为什么

dashboard inbox 现在能显示 a2a_message 工单（M11），但**任务**是更高层的协调单位 —— 一个任务可能涉及多条 agent 消息、多次 review round、有 deadline。v0 已有完整设计，本 sprint 按 edge 架构补回。

## 3. 用户故事

### 3.1 Carol 派任务给 Bob

- Carol 在 dashboard 点 "新任务" → 填 title + description + assignee=Bob + reviewer=自己 + deadline
- POST /api/tasks → 任务直接 status='assigned'，Bob 收到 inbox 通知
- Bob 看到 → 标记 in_progress → 干活 → POST /api/tasks/:id/submit → status='pending_review'
- Carol 收到通知 → 看输出 → 点 approve → status='approved'
  - 或点 reject + 写 comment → status='rejected'，Bob 可以再 submit（reviewRound +1）

### 3.2 Bob 的 agent 替 Bob submit

- Bob 在 Claude Code 里说 "把任务 #123 提交"
- Claude Code 用 agent JWT 调 POST /api/tasks/:id/submit（要求 scope `submit_task`）
- hub 验证 agent.ownerEmployeeId === task.assigneeEmployeeId → 接受 submit
- Carol 那边的 review 流程跟手动一样

### 3.3 reviewer 不是 assignee 自己（双方人独立）

- 创建任务时 reviewer 可以 = assignee 之外的人
- v0 行为：assignee 不能 review 自己的任务（防自批）

## 4. 模块清单

**M10 — Tasks**：
- 新表 `tasks`（13 字段：id/org_id/parent_id/root_id/creator/assignee/reviewer/title/description/output/status/dispatch_approval_id/review_approval_id/review_round/review_comment/created_at/updated_at）
- 7 态状态机
- 5 个 endpoint
- 跟 a2a_messages 留 nullable FK（dispatch/review approval 引用）—— **V1.1 自动创建关联 a2a_message；本 sprint 留空字段不自动建**

## 5. 范围

**实现**：tasks 表 + 5 endpoint + 7 态状态机 + RBAC + audit + e2e

**不做**：
- LLM dispatch decomposition（V1.1，需要 LLM router）
- 子任务嵌套（parent_id/root_id 留字段不做递归 query）
- 自动创建 a2a_message 关联（V1.1，需要 agent context）
- /api/tasks/:id/cancel（V1.1）
- /api/tasks/:id/approve-dispatch（V1.1，配合 LLM dispatch）
- dashboard UI（推迟到 web 搬迁 sprint）

## 6. 状态机

```
[create] ─→ assigned
assigned ─→ in_progress  (assignee 标 "我在做")
assigned ─→ pending_review (assignee 直接 submit)
in_progress ─→ pending_review (assignee submit)
pending_review ─→ approved (reviewer 批准；终态)
pending_review ─→ rejected (reviewer 驳回，可再 submit)
rejected ─→ pending_review (assignee 再 submit；reviewRound++)
pending_dispatch_approval ─→ assigned (V1.1 LLM 流程，本 sprint 不用)
* ─→ cancelled (V1.1)
```

## 7. 验收

- [ ] 8 份设计文档
- [ ] migration 0010 本地 apply
- [ ] schema 加 tasks
- [ ] lib/tasks.ts + routes/tasks.ts
- [ ] 5 个 endpoint，挂载 /api/tasks
- [ ] e2e 覆盖：create → in_progress → submit → review(reject) → submit → review(approve)
- [ ] RBAC e2e：assignee 不能 review 自己；非 reviewer 不能 review；admin 例外
- [ ] cross-tenant e2e
- [ ] 现有 4 e2e 不回归
- [ ] typecheck pass
- [ ] 5-6 atomic commits
