# M8 + M9 — Rules (delta)

> 继承 A-U。本 sprint 追加 V-X。

## V. 三层 scope 强制

**V1**：knowledge_documents + skills 表的 (scope, departmentId, ownerEmployeeId) 组合必须满足 CHECK 约束：
- scope='company' → both null
- scope='department' → departmentId NOT NULL
- scope='personal' → ownerEmployeeId NOT NULL

**V2**：应用层在 INSERT 前必须显式构造正确组合（不依赖默认值，DB CHECK 是兜底）。

**V3**：list/detail/search 时必须按 caller 的 employee + memberships 过滤 scope 可见性 —— 通过 `lib/scope-check.ts` 的 helper。

## W. inline-only knowledge upload

**W1**：本 sprint POST /api/knowledge 仅接受 fileType=md|txt 的 inline content（≤ 100 KB）。

**W2**：fileType=pdf / docx / html 返 422 UNSUPPORTED_FILETYPE 并明确指向 V1.1。

**W3**：file_url 列保留（V1.1 接 R2 时填）。本 sprint 写入时永远 null。

## X. skill assign 双重租户保护

**X1**：POST /api/skills/:id/assign 必须**先后**验证：
1. skill 属当前 tenant
2. agent 属当前 tenant

任一不属 → 404。

**X2**：assign 时还应检查 skill 对此 agent 的可见性（personal scope 只能 assign 给 owner 的 agent；department scope 只能 assign 给同部门成员的 agent）—— 否则 403 SCOPE_MISMATCH。

## Y. agent_skills.enabled

**Y1**：enabled 列是 INTEGER 0/1（D1 没原生 boolean）。应用层用 `enabled === 1` 判断。

**Y2**：DELETE agent_skills 行为 = 完全 unlink；想"暂停"用 PATCH enabled=0（M9 不实施 PATCH，留 V1.1）。
