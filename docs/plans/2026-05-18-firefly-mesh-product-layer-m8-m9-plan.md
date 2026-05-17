# M8 + M9 — Plan

## 0. 范围

实现 4 张新表 + 14 endpoint + lib/scope-check.ts + e2e。**不做**：Vectorize / pdf / docx / multipart / skill loader / skill 执行引擎 / web 层。

## 1. Tasks

### Task 5.1 — Schema 扩展

**status**: pending
**files modified**: services/hub/src/db/schema.ts

**acceptance**:
- [ ] 4 张新表（knowledgeDocuments / knowledgeChunks / skills / agentSkills）
- [ ] 三层 scope CHECK 约束（kb + skill）
- [ ] tags / heading_path / manifest 都是 TEXT (JSON)
- [ ] embedding 是 BLOB nullable
- [ ] agent_skills 复合 PK + enabled INTEGER (0/1)
- [ ] 索引：org / scope+org / dept / owner / document_id / manifest_id
- [ ] typecheck pass

### Task 5.2 — Migration 0011 (knowledge)

**status**: pending
**files**: services/hub/migrations/0011_knowledge.sql

**acceptance**:
- [ ] CREATE TABLE × 2 + 7 索引
- [ ] CHECK 约束写明
- [ ] 本地 apply 成功
- [ ] verify SELECT 返回 2 表

### Task 5.3 — Migration 0012 (skills)

**status**: pending
**files**: services/hub/migrations/0012_skills.sql

**acceptance**:
- [ ] CREATE TABLE × 2 + 3 索引
- [ ] CHECK 约束
- [ ] apply 成功

### Task 5.4 — lib/scope-check.ts

**status**: pending
**files**: services/hub/src/lib/scope-check.ts (new)

**acceptance**:
- [ ] export getMyDepartmentIds(db, employeeId)
- [ ] export isPrivilegedReader/Writer
- [ ] export authorizeScopeWrite (M8 + M9 共用)
- [ ] export ScopeFilter / ThreeTierScope 类型
- [ ] typecheck pass

### Task 5.5 — routes/knowledge.ts (7 endpoint)

**status**: pending
**files**: services/hub/src/routes/knowledge.ts (new)

**acceptance**:
- [ ] 7 endpoint 实现
- [ ] POST 校验 fileType=md|txt（pdf/docx 422 UNSUPPORTED_FILETYPE）
- [ ] inline 分块器（按 \n\n 段落；超长再 split；上限 ~2000 chars/chunk）
- [ ] search LOWER() 大小写无关
- [ ] 三层 scope 可见性过滤
- [ ] writeAudit 全部 mutating
- [ ] typecheck pass

### Task 5.6 — routes/skills.ts (7 endpoint)

**status**: pending
**files**: services/hub/src/routes/skills.ts (new)

**acceptance**:
- [ ] 7 endpoint 实现
- [ ] manifest zod 校验
- [ ] dup check (org, manifest_id, version, scope, dept|owner) → 409
- [ ] 三层 scope 可见性
- [ ] agent_skills assign 验证 agent + skill 都属当前 tenant
- [ ] writeAudit 全部 mutating
- [ ] typecheck pass

### Task 5.7 — 挂载 index.ts

**status**: pending
**files**: services/hub/src/index.ts

**acceptance**:
- [ ] import + app.route("/api/knowledge", ...) + app.route("/api/skills", ...)
- [ ] typecheck + wrangler dev 启动

### Task 5.8 — E2E

**status**: pending
**files**: services/hub/test/m8-m9.e2e.ts + package.json

**acceptance**:
- [ ] Phase 1: setup 2 employees + 1 department
- [ ] Phase 2: Carol POST company KB md → 201, chunks > 0
- [ ] Phase 3: Bob (employee) tries POST company → 403
- [ ] Phase 4: Carol POST personal KB → 201
- [ ] Phase 5: Bob GET search visibility — sees company; sees own personal; doesn't see Carol's personal
- [ ] Phase 6: Search LIKE returns chunks with snippet
- [ ] Phase 7: POST knowledge fileType=pdf → 422
- [ ] Phase 8: PATCH then DELETE
- [ ] Phase 9: Skills — POST manifest, dup → 409
- [ ] Phase 10: GET /api/skills filter by scope
- [ ] Phase 11: POST /api/skills/:id/assign agent → 201
- [ ] Phase 12: cross-tenant 404
- [ ] 现有 5 e2e 不回归

### Task 5.9 — 文档同步 + commits

**status**: pending

**acceptance**:
- [ ] state.yaml 加 sub_sprint_m8_m9
- [ ] task statuses 全部 completed
- [ ] ~5 atomic commits

---

## 2. 完成判定

1. 9 task acceptance 100%
2. typecheck 全绿
3. test:e2e:m8-m9 全绿
4. 5 上 sprint e2e 不回归
5. wrangler dev + curl 健康

## 3. 降阶扫描

- "V1.1" 标注 ✓ 允许（Vectorize / pdf / docx / R2 / skill loader / 执行引擎）
- 0 "for now" / 占位 TODO

## 4. 风险

| 风险 | 缓解 |
|---|---|
| 分块器边界 case（空段、超长行）| 测试覆盖 + bounded loop |
| LIKE 性能差 | 仅 100 KB inline + chunk 上限保护；prod 用 Vectorize 替换 |
| 三层 scope SQL 复杂、易漏 case | scope-check.ts 集中 + e2e 覆盖 6 个矩阵交叉 |
| agent_skills assign 跨租户 | 显式两次 cross-tenant guard |
| manifest JSON 解析失败 | zod 校验 + 解析时 try/catch 兜底返默认 |

## 5. Task 状态汇总

| Task | Status |
|---|---|
| 5.1 Schema | pending |
| 5.2 Migration 0011 | pending |
| 5.3 Migration 0012 | pending |
| 5.4 lib/scope-check.ts | pending |
| 5.5 routes/knowledge.ts | pending |
| 5.6 routes/skills.ts | pending |
| 5.7 挂载 | pending |
| 5.8 E2E | pending |
| 5.9 文档同步 | pending |
