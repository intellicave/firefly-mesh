# product-layer M5-M7 — Plan

> 契约式 acceptance + status 字段。沿用上 sprint 的 plan 风格。

---

## 0. 范围

**实施**：M5（agents ALTER + 内部 wiring）+ M6（boundaries 完整）+ M7（agent_tokens admin 签发完整、client 消费推迟到 V1.1）

**不做**：M5 不删 owner_user_id / M6 不对 hub 现有业务 endpoint 强制接入 enforceScope / M7 不实现 /api/agents/activate-by-token / 不动 web 层 / 不部署

---

## 1. 任务清单

### Task 2.1 — Schema：agents ALTER + 2 新表 Drizzle

**status**: completed
**files modified**:
- `services/hub/src/db/schema.ts`

**acceptance_criteria**:
- [ ] schema.ts agents 表追加 4 列：ownerEmployeeId（text + references employees + onDelete set null）、runtimeKind（text enum + default 'unknown'）、runtimeMeta（text nullable）、activatedAt（text nullable）
- [ ] 新增 representationBoundaries 表（id PK / agentId UNIQUE references agents cascade / scopes text default '[]' / updatedAt）
- [ ] 新增 agentTokens 表（id PK / orgId references tenants cascade / employeeId references employees cascade / tokenHash UNIQUE / agentId nullable references agents set null / status enum / expiresAt / consumedAt / revokedAt / createdAt / createdBy）
- [ ] 3 个索引：agent_tokens_org / agent_tokens_employee / agent_tokens_token_hash
- [ ] typecheck pass

### Task 2.2 — Migration 0006 (ALTER agents)

**status**: completed
**files created**:
- `services/hub/migrations/0006_agents_owner_employee.sql`

**acceptance_criteria**:
- [ ] 4 个 ALTER TABLE agents ADD COLUMN
- [ ] runtime_kind 有 CHECK enum 约束 + DEFAULT 'unknown'
- [ ] migration apply local 成功
- [ ] 验证：`SELECT name FROM pragma_table_info('agents') WHERE name IN ('owner_employee_id','runtime_kind','runtime_meta','activated_at')` 返回 4 行

### Task 2.3 — Migration 0007 (boundaries + agent_tokens)

**status**: completed
**files created**:
- `services/hub/migrations/0007_boundaries_and_tokens.sql`

**acceptance_criteria**:
- [ ] CREATE TABLE representation_boundaries（含 UNIQUE agent_id 约束）
- [ ] CREATE TABLE agent_tokens（含 status CHECK enum）
- [ ] 3 个 INDEX 创建
- [ ] apply local 成功
- [ ] 表存在验证脚本通过

### Task 2.4 — lib/scopes.ts

**status**: completed
**files created**:
- `services/hub/src/lib/scopes.ts`

**acceptance_criteria**:
- [ ] 迁移 v0 10 个 scope 定义不变
- [ ] export SCOPE_CATALOG / SCOPE_IDS / ScopeId / isValidScope / defaultScopes / isDangerousScope / getScopeDef / enforceScope
- [ ] enforceScope 抛 error 含 code='BOUNDARY_VIOLATION'
- [ ] typecheck pass

### Task 2.5 — lib/jwt.ts 扩展

**status**: completed
**files modified**:
- `services/hub/src/lib/jwt.ts`

**acceptance_criteria**:
- [ ] AgentJwtPayload 加 `scope: string[]`
- [ ] signAgentJwt 加 `scopes: string[]` 参数（位置在 userId 后、secret 前）
- [ ] verifyAgentJwt 解析 scope claim；缺失时降级 defaultScopes()
- [ ] 类型注释更新
- [ ] typecheck pass

### Task 2.6 — agents.ts /register 内部 wiring

**status**: completed
**files modified**:
- `services/hub/src/routes/agents.ts`

**acceptance_criteria**:
- [ ] zod schema 加 optional runtimeKind + runtimeMeta
- [ ] /register handler 中：反查 employees（orgId+userId），拿 ownerEmployeeId
- [ ] agent insert 加 ownerEmployeeId / runtimeKind / runtimeMeta JSON.stringify / activatedAt
- [ ] insert representation_boundaries（scopes JSON.stringify(defaultScopes())）
- [ ] signAgentJwt 调用加 scopes 参数
- [ ] response shape 不变（仍 { data: { agentId, token, tenantId } }）
- [ ] typecheck pass

### Task 2.7 — routes/boundaries.ts

**status**: completed
**files created**:
- `services/hub/src/routes/boundaries.ts`

**acceptance_criteria**:
- [ ] GET /:agentId — orgGuard + agents cross-tenant 检查 + 默认 scope fallback
- [ ] PUT /:agentId — orgGuard + requireRole + scope 数组校验 + upsert + audit_log
- [ ] response shape 符合 api.md §2
- [ ] 跨租户保护（每条 SQL 有 orgId 或 agents.tenant_id guard）
- [ ] typecheck pass

### Task 2.8 — routes/agent-tokens.ts

**status**: completed
**files created**:
- `services/hub/src/routes/agent-tokens.ts`

**acceptance_criteria**:
- [ ] POST: 32-byte random plain → base64url → SHA-256 hash → DB 只存 hash
- [ ] POST response 唯一一次返回 plainToken
- [ ] GET 列表（按 created_at desc）
- [ ] POST :id/regenerate: 旧 → revoked + 新 → pending
- [ ] DELETE :id: 软删 status='revoked' + revoked_at
- [ ] employee cross-tenant 校验
- [ ] audit_log: issued / regenerated / revoked 3 个 action
- [ ] typecheck pass

### Task 2.9 — 挂载

**status**: completed
**files modified**:
- `services/hub/src/index.ts`

**acceptance_criteria**:
- [ ] import 2 个新 router
- [ ] app.route("/api/boundaries", boundariesRouter)
- [ ] app.route("/api/agent-tokens", agentTokensRouter)
- [ ] typecheck pass + wrangler dev 启动成功

### Task 2.10 — E2E

**status**: completed
**files created**:
- `services/hub/test/m5-m7.e2e.ts`

**acceptance_criteria**:
- [ ] Phase 1: 基础 register 流 → owner_employee_id 正确 / runtime_kind 默认 / boundary 默认 scope / JWT 含 scope claim
- [ ] Phase 2: GET boundary 返回正确 + catalog 完整 + updatedAt
- [ ] Phase 3: PUT boundary 加 danger scope → 成功 + audit_log
- [ ] Phase 4: agent_token issue → DB 含 hash 不含 plain → list 不返回 plain
- [ ] Phase 5: regenerate → 旧 revoked / 新 pending / 旧 plain hash 不再存在
- [ ] Phase 6: revoke → status=revoked
- [ ] Phase 7: RBAC negative（employee 角色 PUT boundary → 403）
- [ ] Phase 8: cross-tenant（A 用 B 的 agentId → 404）
- [ ] Phase 9: 向后兼容（手动 sign JWT 不带 scope claim → verifyAgentJwt 返回 defaultScopes()）
- [ ] 现有 e2e.ts + product-layer.e2e.ts 不回归
- [ ] package.json 加 test:e2e:m5-m7 script

### Task 2.11 — 文档同步

**status**: completed
**files modified**:
- `docs/pipeline/state.yaml`
- 本 plan.md task statuses

**acceptance_criteria**:
- [ ] state.yaml 加新 sprint 记录
- [ ] task statuses 全部 → completed
- [ ] commit 拆分：(1) schema + 2 migrations (2) scopes + jwt (3) agents wiring (4) boundaries route (5) agent-tokens route (6) e2e tests (7) state sync

---

## 2. 完成判定

满足全部才算完成：

1. 11 个 task 的 acceptance 100% 通过
2. `pnpm --filter @firefly-mesh/hub typecheck` 全绿
3. `pnpm --filter @firefly-mesh/hub test:e2e:m5-m7` 全绿
4. `pnpm --filter @firefly-mesh/hub test:e2e:product-layer` 不回归
5. `pnpm --filter @firefly-mesh/hub test:e2e` 不回归
6. `wrangler dev` 启动 + 4 个新端点 curl 健康
7. state.yaml 更新

---

## 3. 降阶信号词扫描

- ❌ "for now" / "暂时" / TODO 占位符 — 0 次
- ❌ "later" 作为推迟 — 0 次
- ❌ mock 替代真实 — 0 次
- ✅ "V1.1" / "下个 sprint" 作为**明确排期** — 允许（client-side activate-by-token, /me/devices/list endpoint）

---

## 4. 风险

| 风险 | 缓解 |
|---|---|
| ALTER agents 大表慢 / lock | hub agents 表当前很小（无生产数据风险），本地测可忽略 |
| owner_user_id 新代码遗忘改用 owner_employee_id | 保留 owner_user_id 作 fallback，新代码优先 owner_employee_id |
| JWT 向后兼容失败 | verifyAgentJwt 单测覆盖：旧 JWT 无 scope claim → 返回 defaultScopes() |
| boundary 改后 JWT 不立即失效 | 已知 tradeoff，design.md §5.3 明确 + V1.1 加 force-refresh endpoint |
| audit_log payload 字段不存（M12 才 ALTER）| 用 payload-less 写法（只用现有 action / target_id）；M12 后再加 payload diff |

---

## 5. 任务状态汇总

| Task | Status |
|---|---|
| 2.1 Schema | completed |
| 2.2 Migration 0006 | completed |
| 2.3 Migration 0007 | completed |
| 2.4 lib/scopes.ts | completed |
| 2.5 lib/jwt.ts 扩展 | completed |
| 2.6 agents.ts wiring | completed |
| 2.7 routes/boundaries.ts | completed |
| 2.8 routes/agent-tokens.ts | completed |
| 2.9 挂载 | completed |
| 2.10 E2E | completed |
| 2.11 文档同步 | completed |

**Sleep run 完成于** 2026-05-17。验收结果：

- ✅ typecheck 全绿
- ✅ test:e2e:m5-m7 — 14/14 scenarios pass
- ✅ test:e2e:product-layer 不回归 — 11/11 pass
- ✅ test:e2e 不回归 — 6/6 phases pass
- ✅ 7 个 atomic commit（docs 1 / schema+migrations 1 / scopes+jwt 1 / agents wiring 1 / routes 1 / tests 1 / state sync 1）

---

## 7. 实现偏离设计（drift notes）

无 drift。design.md 全部 sections 实施时无需修订。**Sprint 端到端 clean**。
