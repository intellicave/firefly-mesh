# M10 — Rules (delta)

> 继承 A-R。本文档追加 S-T。

## S. Task 状态机权威

**S1**：所有状态转移必须经过 `lib/tasks.ts::assertValidTransition()`。终态（approved / cancelled）不可转出 → 409。

**S2**：`tasks.review_round` 仅在 review.decision='rejected' 时递增（且每次递增 1）；'approved' 不变。

**S3**：从 'rejected' 重新 submit → status='pending_review'，不重置 review_round（v0 行为）。

## T. RBAC 硬规则

**T1**：assignee_employee_id **不可等于** reviewer_employee_id（创建期 + 后续 PATCH 都强制）。creator 可以等于 assignee 或 reviewer 之一（但同时等于二者会与 T1 冲突）。

**T2**：assignee 不能 review 自己的任务（即使 assignee 临时被赋予 owner 角色）。返 403 SELF_REVIEW_FORBIDDEN。

**T3**：agent JWT submit 时必须查 agents.ownerEmployeeId == task.assignee_employee_id；不一致 → 403 NOT_ASSIGNEE_AGENT。

**T4**：agent JWT submit 时还必须 JWT scope 含 "submit_task"（M6 sprint 的 boundary 已支持）→ 否则 403 BOUNDARY_VIOLATION。

## U. 文档

**U1**：所有 task 状态转移调 writeAudit；payload 含 `{ from, to, ...context }`（如 review 含 decision/comment/round）。
