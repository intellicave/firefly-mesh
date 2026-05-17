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

**Q3**：retrofit 后 grep 验证：`db.insert(schema.auditLog).values` hit 数 = 0。

## R. 跨租户保护（再次强调）

**R1**：a2a 产品层所有 SQL 必须 `eq(a2a_messages.orgId, c.get('tenantId'))`。

**R2**：JOIN employees / agents 时也必须各自 `eq(*.orgId, tenantId)`（防 join 跨租户）。

**R3**：HITL CTA 不仅校验状态机，还校验 c.get('employee').id ∈ {sender_employee_id, receiver_employee_id} 或 role admin。
