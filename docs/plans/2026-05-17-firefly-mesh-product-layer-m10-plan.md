# M10 — Plan

## 0. 范围

实施 M10：tasks 表 + 6 endpoint（POST, GET list, GET detail, start, submit, review）+ 状态机 + RBAC + e2e。**不做**：LLM dispatch / sub-task tree / auto a2a_message linkage / cancel / approve-dispatch / UI

## 1. Task 清单

### Task 4.1 — Schema 扩展

**status**: pending
**files modified**: services/hub/src/db/schema.ts

**acceptance_criteria**:
- [ ] 加 `tasks` 表（17 字段，4 索引）
- [ ] FK 全部 SET NULL on delete（不级联删任务）
- [ ] status CHECK enum 含 7 态
- [ ] review_round integer default 0
- [ ] typecheck pass

### Task 4.2 — Migration 0010

**status**: pending
**files created**: services/hub/migrations/0010_tasks.sql

**acceptance_criteria**:
- [ ] CREATE TABLE IF NOT EXISTS tasks
- [ ] 4 个 CREATE INDEX
- [ ] CHECK enum 写明
- [ ] 本地 apply 成功

### Task 4.3 — lib/tasks.ts

**status**: pending
**files created**: services/hub/src/lib/tasks.ts

**acceptance_criteria**:
- [ ] export TaskStatus type
- [ ] export TRANSITIONS map
- [ ] export `assertValidTransition(from, to)` throws InvalidTaskTransitionError
- [ ] export `assertCanReview(employee, task)` —— assignee 不能 review 自己
- [ ] export `resolveAgentOwnerEmployee(db, agentId)` helper（submit by agent 用）
- [ ] typecheck pass

### Task 4.4 — routes/tasks.ts

**status**: pending
**files created**: services/hub/src/routes/tasks.ts

**acceptance_criteria**:
- [ ] 6 endpoint 实现：POST `/` + GET `/` + GET `/:id` + POST `/:id/start` + POST `/:id/submit` + POST `/:id/review`
- [ ] POST `/` 强制 assignee != reviewer
- [ ] POST `/:id/submit` 支持 session OR agent JWT 双路径
- [ ] POST `/:id/review` 阻止 self-review
- [ ] GET `/` employee 角色自动过滤
- [ ] 所有 mutating 调用 writeAudit
- [ ] cross-tenant 全部 guard
- [ ] typecheck pass

### Task 4.5 — 挂载

**status**: pending
**files modified**: services/hub/src/index.ts

**acceptance_criteria**:
- [ ] import tasksRouter
- [ ] app.route("/api/tasks", tasksRouter)
- [ ] wrangler dev 启动成功

### Task 4.6 — E2E

**status**: pending
**files created**: services/hub/test/m10.e2e.ts + package.json script

**acceptance_criteria**:
- [ ] Phase 1: Carol create task → Bob assignee, Dave reviewer → 201
- [ ] Phase 2: same-assignee-reviewer rejected 409
- [ ] Phase 3: Bob start → 200 in_progress
- [ ] Phase 4: Bob submit → 200 pending_review
- [ ] Phase 5: Bob attempts self-review → 403 SELF_REVIEW_FORBIDDEN
- [ ] Phase 6: Dave review reject + comment → status=rejected, round=1
- [ ] Phase 7: Bob resubmit → pending_review
- [ ] Phase 8: Dave review approve → status=approved, terminal
- [ ] Phase 9: 重复 review/submit on approved → 409
- [ ] Phase 10: agent JWT submit (Bob's agent w/ submit_task scope) → 200
- [ ] Phase 11: cross-tenant approve → 404
- [ ] Phase 12: GET list as employee → only own tasks
- [ ] 现有 4 e2e 不回归

### Task 4.7 — 文档同步 + commits

**status**: pending

**acceptance_criteria**:
- [ ] state.yaml 加 sub_sprint_m10 section
- [ ] task statuses 全部 completed
- [ ] 5-6 atomic commits

---

## 2. 完成判定

1. 6 task acceptance 100%
2. typecheck 全绿
3. test:e2e:m10 全绿
4. 上 3 sprint test 不回归
5. wrangler dev 启动 + 6 endpoint curl 健康

## 3. 降阶信号词扫描

- 0 "for now" / "暂时" / TODO 占位符
- "V1.1" 作为明确排期 ✓ 允许

## 4. 风险

| 风险 | 缓解 |
|---|---|
| agent JWT submit 时反查 ownerEmployeeId 慢 | lib/tasks.ts::resolveAgentOwnerEmployee 单 SELECT，索引在 agents.id 上 |
| reviewRound 整数溢出 | 实际不可能（人不会驳回 2B 次）|
| 状态机分支多易遗漏 | lib/tasks.ts::TRANSITIONS map 集中定义；测试覆盖 4×4 转移组合 |
| RBAC 复杂（4 种角色 × 6 个 endpoint） | RBAC 矩阵在 design §4；e2e 覆盖关键 deny 路径 |

## 5. 任务状态汇总

| Task | Status |
|---|---|
| 4.1 Schema | pending |
| 4.2 Migration 0010 | pending |
| 4.3 lib/tasks.ts | pending |
| 4.4 routes/tasks.ts | pending |
| 4.5 挂载 | pending |
| 4.6 E2E | pending |
| 4.7 文档同步 | pending |
