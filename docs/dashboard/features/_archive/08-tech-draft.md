# [归档] Feature 08 — 快速入门 · 技术层草稿

> 状态: 草稿,等 layer-by-layer 迭代。

---

## 数据模型

参见 [`../../reference/data-models.md`](../../reference/data-models.md) §onboarding。
表:`onboarding_state` (user_id × tenant_id, created_org, imported, skipped_import, paired_agent, skipped_pair, completed, updated_at) — PK (user_id, tenant_id)。

---

## API 契约

待补:
- `GET /api/onboarding/state?tenantId=` (P0)
- `POST /api/onboarding/state` body `{tenantId, step, value}` 自动派生 completed (P0)
- `POST /api/onboarding/import` (P2, V1 留位返回 501)

已实现(其他 feature):
- `GET /api/tenants` / `POST /api/tenants`
- `POST /api/invitations/:token/accept`
- Agent pair-init / status / confirm / register (feature 02)
- WS `agent.bound` user channel event

详见 [`../../reference/api-needed.md`](../../reference/api-needed.md) §Onboarding。

---

## 实现状态

| 层 | 状态 |
|---|---|
| `onboarding_state` 表 | ⚠️ migration 0005 待新增 |
| `/api/onboarding/state` GET/POST | ⚠️ 待写 |
| `/api/onboarding/import` | ⚠️ V1 留位 501 |
| Dashboard `/onboarding/*` 4 个页 + layout | ⚠️ 待还原 |
| Step 3 WS 实时反馈 | ⚠️ 替换轮询为 WS |
| Middleware 跳转逻辑 | ⚠️ `services/dashboard/middleware.ts` 待新建 |

---

## 迁移步骤

1. D1 migration 0005 + onboarding_state 表
2. `services/hub/src/routes/onboarding.ts` GET/POST
3. POST /api/tenants 内联写 onboarding_state (created_org=1)
4. POST /api/invitations/:token/accept 若是首次有 tenant → completed=1
5. 还原 `app/onboarding/` 5 个 page
6. 加 middleware 跳转规则
7. WS user-channel `agent.bound` 订阅

---

## 技术验收清单

- [ ] 新用户被强制跳 `/onboarding/create-org`
- [ ] Onboarding state 持久化,刷新后恢复进度
- [ ] WS 实时反馈 agent 绑定
- [ ] 邀请 accept shortcut 跳过 4-step
- [ ] middleware 跳转规则正确
- [ ] 跨 user 攻击 → 403
