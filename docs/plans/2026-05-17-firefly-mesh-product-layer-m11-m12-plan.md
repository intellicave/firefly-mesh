# product-layer M11+M12 — Plan

## 0. 范围

**实施**：M11（a2a 产品层 + 6 endpoint + HITL 状态机）+ M12（audit_log ALTER + helper + retrofit 11 处）+ e2e

**不做**：WS 主动推送产品层事件 / GET /api/audit 读端 / reply_to_message_id 自指 FK / confidence_score / audit_log RULE / web 层 / M8 M9 M10

---

## 1. Task 清单

### Task 3.1 — Schema 扩展

**status**: completed
**files modified**: services/hub/src/db/schema.ts

**acceptance_criteria**:
- [ ] schema.ts 加 `a2aThreads` 表
- [ ] schema.ts 加 `a2aMessages` 表（17 列）
- [ ] schema.ts 扩展 `auditLog`：加 `actorType`、`resourceType`、`resourceId`、`payload` 4 个可空列
- [ ] FK 全部正确（org_id, thread_id, encrypted_message_id, sender/receiver agent+employee）
- [ ] 5 个索引（org/thread/receiver-emp+status/sender-emp+status/encrypted）
- [ ] typecheck pass

### Task 3.2 — Migration 0008 (a2a 产品层)

**status**: completed
**files created**: services/hub/migrations/0008_a2a_product_layer.sql

**acceptance_criteria**:
- [ ] 2 个 CREATE TABLE（IF NOT EXISTS）
- [ ] 5 个 CREATE INDEX
- [ ] CHECK 约束写明 7 类型枚举 + 4 HITL 状态枚举
- [ ] FK ON DELETE 策略正确
- [ ] 本地 apply 成功
- [ ] 表存在验证脚本通过

### Task 3.3 — Migration 0009 (audit_log ALTER)

**status**: completed
**files created**: services/hub/migrations/0009_audit_log_extend.sql

**acceptance_criteria**:
- [ ] 4 个 ALTER TABLE auditLog ADD COLUMN
- [ ] actor_type 有 CHECK enum
- [ ] 全部 NULL 允许（向后兼容）
- [ ] 本地 apply 成功
- [ ] pragma_table_info 验证 4 列存在

### Task 3.4 — lib/audit.ts

**status**: completed
**files created**: services/hub/src/lib/audit.ts

**acceptance_criteria**:
- [ ] export `writeAudit(db, params)` 函数
- [ ] 接受 tenantId | null、actor { type, id }、action、optional resource { type, id }、optional payload
- [ ] JSON.stringify payload
- [ ] back-compat：同时写 target_id 和 resource_id（取一致值）
- [ ] typecheck pass

### Task 3.5 — Retrofit 11 处 audit_log 写入

**status**: completed
**files modified**: tenants.ts / invitations.ts / agents.ts / boundaries.ts / agent-tokens.ts / messages.ts

**acceptance_criteria**:
- [ ] 全部 11 处 `db.insert(schema.auditLog).values(...)` 改为 `await writeAudit(db, { ... })`
- [ ] 每处都填写 actor.type（human/agent/system）
- [ ] 每处都填写 resource.type + resource.id（基本同 action 主语）
- [ ] 适当填 payload（如 boundary.updated 含 before/after，agent_token.issued 含 employeeId 等）
- [ ] grep 验证：`db.insert(schema.auditLog).values` hit 数为 0
- [ ] typecheck pass

### Task 3.6 — lib/a2a-messages.ts

**status**: completed
**files created**: services/hub/src/lib/a2a-messages.ts

**acceptance_criteria**:
- [ ] export `computeInitialA2aStatus(type)` 返回 `{ senderApprovalStatus, receiverActionStatus }`
- [ ] 复用 hub 现有 `computeHitlFlags`（hitl/engine.ts）
- [ ] 7 类型映射正确（inform/sync auto, request/commit/handoff pending, escalate/block sender=auto receiver=pending）
- [ ] export `assertValidA2aTransition(currentStatus, action)` 状态机校验函数
- [ ] export `resolveAgentEmployee(db, agentId)` 反查 owner_employee_id helper
- [ ] typecheck pass

### Task 3.7 — routes/a2a-messages.ts（6 endpoint）

**status**: completed
**files created**: services/hub/src/routes/a2a-messages.ts

**acceptance_criteria**:
- [ ] POST `/` agent JWT + 内部协调（messages_meta + pending_messages + a2a_messages + a2a_threads）
- [ ] GET `/inbox` session + tab=approve|action 过滤 + JOIN employees for name + cursor 分页
- [ ] POST `/:id/approve` sender 侧 + RBAC + 状态机
- [ ] POST `/:id/reject` sender 侧
- [ ] POST `/:id/accept` receiver 侧
- [ ] POST `/:id/reject-receive` receiver 侧
- [ ] 所有 endpoint 跨租户保护（每条 SQL eq orgId）
- [ ] 所有 endpoint 调 writeAudit
- [ ] typecheck pass

### Task 3.8 — 挂载

**status**: completed
**files modified**: services/hub/src/index.ts

**acceptance_criteria**:
- [ ] import a2aMessagesRouter
- [ ] app.route("/api/a2a-messages", a2aMessagesRouter)
- [ ] typecheck pass + wrangler dev 启动成功

### Task 3.9 — E2E

**status**: completed
**files created**: services/hub/test/m11-m12.e2e.ts + package.json script

**acceptance_criteria**:
- [ ] Phase 1: POST inform (auto/auto) → inbox approve/action tab 都不显示
- [ ] Phase 2: POST request (pending/pending) → 显示在 sender approve tab + receiver action tab
- [ ] Phase 3: sender approve → 状态变 approved；inbox approve 不再显示
- [ ] Phase 4: receiver accept → 状态变 accepted；inbox action 不再显示
- [ ] Phase 5: 重复 approve → 409 INVALID_STATUS
- [ ] Phase 6: 非 sender 调 sender approve → 403
- [ ] Phase 7: admin 调 sender approve（不是 sender 本人）→ 200
- [ ] Phase 8: 跨租户 → 404
- [ ] Phase 9: audit_log 含 actor_type + resource_type + payload
- [ ] Phase 10: 检查 retrofit — POST /api/tenants 后 audit_log 行有 actor_type='human', resource_type='tenant'
- [ ] 现有 3 e2e 不回归

### Task 3.10 — 文档同步 + commits

**status**: completed
**files modified**: state.yaml, plan.md statuses

**acceptance_criteria**:
- [ ] state.yaml 加 M11-M12 sub-sprint section
- [ ] 11 task statuses → completed
- [ ] ~7 atomic commits

---

## 2. 完成判定

1. 10 个 task acceptance 100%
2. typecheck 全绿
3. test:e2e:m11-m12 全绿
4. 上 2 sprint test 不回归
5. test:e2e 不回归
6. wrangler dev 启动 + 6 新端点 curl 健康
7. state.yaml 更新

---

## 3. 降阶信号词扫描

- ❌ "for now" / "暂时" — 0
- ❌ TODO 占位符 — 0
- ✅ "V1.1" / "下个 sprint" 作为明确排期 — 允许（WS 推送、GET /api/audit 等）

---

## 4. 风险

| 风险 | 缓解 |
|---|---|
| POST /api/a2a-messages 一次写 4 表，D1 无事务，部分失败留垃圾数据 | 顺序写：a2a_threads（如新建）→ messages_meta → pending_messages → a2a_messages；失败任一返 5xx，依赖 cron 清理 |
| writeAudit retrofit 改 11 处可能漏 / 错填 actor type | grep 验证 hit 数 = 0；e2e 覆盖至少 2 处 retrofit |
| sender_employee_id 反查时 agent 没 owner_employee_id（老数据 / shell） | 反查 null → 设 null，不阻塞消息发送（HITL 状态仍 work） |
| HITL 状态机非典型 transition（如 sender approved 后 reject） | assertValidA2aTransition 严格校验，409 |

---

## 5. 任务状态汇总

| Task | Status |
|---|---|
| 3.1 Schema | completed |
| 3.2 Migration 0008 | completed |
| 3.3 Migration 0009 | completed |
| 3.4 lib/audit.ts | completed |
| 3.5 Retrofit 11 处 | completed |
| 3.6 lib/a2a-messages.ts | completed |
| 3.7 routes/a2a-messages.ts | completed |
| 3.8 挂载 | completed |
| 3.9 E2E | completed |
| 3.10 文档同步 | completed |

**Sleep run 完成于** 2026-05-17。验收：

- ✅ typecheck 全绿
- ✅ test:e2e:m11-m12 — 10/10 phases pass
- ✅ test:e2e:m5-m7 不回归 — 14/14
- ✅ test:e2e:product-layer 不回归 — 11/11
- ✅ test:e2e 不回归 — 6/6 phases
- ✅ 6 个 atomic commit（docs / schema+migrations / audit helper / retrofit / a2a lib+route / e2e tests / state sync）

## 7. 实现 drift notes

实施期发现 + 修复的 4 个 bug（test 迭代时 catch）：
1. 测试调错 invite endpoint（应 `/api/tenants/:id/invite` 不是 `/api/invite`）
2. invite response 不直接返 token 而是 inviteLink，需 URL parse 提取
3. POST a2a-messages 代码有死代码 `set({ messageCount: undefined as never })` 违反 NOT NULL
4. inbox GET 用 `senderEmp = schema.employees, receiverEmp = schema.employees` 双 JOIN 同表未用 Drizzle `alias()` → SQL 冲突

全部已 fix；test 通过；commit message 里有详情。

设计文档无需修订（schema / API / RBAC / 状态机设计本身正确）。
