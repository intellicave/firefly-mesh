# [归档] Feature 06 — 审计日志 · 技术层草稿

> 状态: 草稿,等 layer-by-layer 迭代。

---

## 数据模型

参见 [`../../reference/data-models.md`](../../reference/data-models.md) §audit。
表:`audit_log` (id, tenant_id, actor_kind, actor_id, actor_label 冗余, kind, subject_kind, subject_id, details JSON ≤8KB, created_at) + `cron_locks`。

索引:
- `(tenant_id, created_at DESC)` — 默认列表
- `(kind, created_at DESC)` — 按类型过滤
- `actor_id` — 按 actor 过滤

D1 triggers 自动写 audit(migration 0004 已就位,P0-4 GAN 已加固 CAS lease + db.batch atomic + 失败时不释放 lease)。
Cron `0 3 * * *` 每天 truncate >90 天的行。

---

## API 契约

已实现:
- migration 0004 + cron cleanup 已部署

待补 (P0):
- `GET /api/tenants/:id/audit?kind=&actor=&from=&to=&cursor=&limit=` (owner/admin only,V1 member 不可见)
- `GET /api/audit/:id` (P1)
- `GET /api/tenants/:id/audit/export.csv` (P1,V1 同步 max 10k 行)

详见 [`../../reference/api-needed.md`](../../reference/api-needed.md) §Audit。

---

## 实现状态

| 层 | 状态 |
|---|---|
| audit_log 表 + auto-write triggers | ✅ migration 0004 |
| cron cleanup (CAS lease + db.batch) | ✅ P0-4 GAN 加固 |
| Hub audit query API | ⚠️ 待补 |
| CSV export endpoint | ⚠️ 待补 (V1 同步即可) |
| Dashboard `/audit` 页 | ⚠️ 待还原 |

---

## 迁移步骤

1. Hub 新增 `services/hub/src/routes/audit.ts` — list + filter + cursor
2. requireRole(['owner','admin'])
3. CSV export 端点 `text/csv; charset=utf-8`,上限 10k 行,超过 413
4. 还原 dashboard:`audit-table.tsx` + `audit-detail-sheet.tsx` + `filter-bar.tsx`
5. JSON 渲染用 `react-syntax-highlighter`
6. 时区:列表显示 user 本地时区,Sheet 显示 UTC 原值

---

## 技术验收清单

- [ ] 列表分页 cursor 工作
- [ ] kind/actor/date filter 后端正确 query
- [ ] CSV 导出 ≤ 10k 行,超过返回 413
- [ ] member 角色访问 → 403 或 sidebar 隐藏
- [ ] 跨 tenant 攻击 → 403
- [ ] cron `audit_log` 自身 truncate 工作,且事件写入 audit_log
