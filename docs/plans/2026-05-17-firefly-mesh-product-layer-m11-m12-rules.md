# product-layer M11+M12 — Rules (delta)

> 继承 [2026-05-16](2026-05-16-firefly-mesh-product-layer-rules.md) A-J + [2026-05-17 M5-M7](2026-05-17-firefly-mesh-product-layer-m5-m7-rules.md) K-N。本文档只追加 O-R。

## O. HITL 状态机权威

**O1**：server-side 是 HITL 状态唯一权威。客户端 agent 禁止自报 "approved" / "accepted"，必须经过 4 个 HITL CTA endpoint。

**O2**：状态机转移必须用 `lib/a2a-messages.ts::assertValidA2aTransition()` 校验。已是终态（approved/rejected/accepted/auto）→ 409 INVALID_STATUS。

**O3**：sender 侧 CTA（approve/reject）只允许 sender_employee_id 本人 OR role IN ('owner','admin')。receiver 侧 CTA 类似。

## P. 双层一致性

**P1**：POST /api/a2a-messages 必须按顺序写：a2a_threads (if new) → messages_meta → pending_messages → a2a_messages。任一失败立刻返 5xx；不补偿。

**P2**：messages_meta.summary 是非加密；a2a_messages 不重复存 summary（JOIN 读）。客户端写 summary 时心知"admin 可看"。

**P3**：a2a_messages.encrypted_message_id 必须真实存在于 messages_meta（FK 强制）。

## Q. audit_log helper 强制

**Q1**：禁止直接 `db.insert(schema.auditLog).values(...)`；必须通过 `lib/audit.ts::writeAudit()`。

**Q2**：writeAudit 调用必须传 `actor.type`（human / agent / system）—— grep CI 检查可加。

**Q3**：retrofit 后 grep 验证：`db.insert(schema.auditLog).values` hit 数 = 0，**唯一例外见 Q4**。

**Q4（2026-05-18 修订）**：`db.batch([...])` 路径允许使用 `auditValues({...})` 构造 row 后直接 `db.insert(schema.auditLog).values(...)`，因为 `writeAudit` 是 async-only、不适用 batch。在该位置必须留显式注释引用本规则。任何新的 batch 调用必须先在本文档登记。当前被认可的例外（已登记）：
- `services/hub/src/routes/invitations.ts` 的 invitation-accept batch（membership + audit 原子写）。
- `services/hub/src/routes/a2a-messages.ts` 有两处 batch 用例：
  - a2a POST 主路径 batch（a2a_threads + messages_meta + pending_messages + a2a_messages + audit 五表协调写，round-19 H1 fix 引入；round-25 reviewer 登记）。
  - `handleCta` (approve / reject / accept / reject-receive) 的 sender + receiver 分支两处 batch（a2a_messages UPDATE + audit + optimistic concurrency on status WHERE，round-36 H fix 引入；防止并发 admin 双写 audit 与冲突 decision）。round-37 reviewer 登记。
- `services/hub/src/routes/tenants.ts` 的 tenant create batch（tenants + memberships + employees + audit 四表原子写，round-32 H1 fix 引入；防止 owner employee 漏建导致租户永久 NO_EMPLOYEE_PROFILE）。round-33 reviewer 登记。
- `services/hub/src/routes/tasks.ts` 的 task 状态迁移 batch（start / submit / review 三处都是 task UPDATE + audit 原子写 + optimistic concurrency on status WHERE，round-35 H fix 引入；防止并发 reviewer 双写 audit）。round-35 reviewer 登记。

## R. 跨租户保护（再次强调）

**R1**：a2a 产品层所有 SQL 必须 `eq(a2a_messages.orgId, c.get('tenantId'))`。

**R2**：JOIN employees / agents 时也必须各自 `eq(*.orgId, tenantId)`（防 join 跨租户）。

**R3**：HITL CTA 不仅校验状态机，还校验 c.get('employee').id ∈ {sender_employee_id, receiver_employee_id} 或 role admin。
