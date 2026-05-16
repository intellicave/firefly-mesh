# [归档] Feature 03 — 组织管理 · 技术层草稿

> 状态: **草稿,待后续 layer-by-layer 迭代**
> 用途: 当前轮只打磨功能层。技术层段落原文暂存。

---

## (原 §4) 数据模型

参见 [`../../reference/data-models.md`](../../reference/data-models.md) §org。
涉及表:`tenants` / `members` / `invitations` / `employees` / `departments` / `projects` / `project_members` / `tasks`。

---

## (原 §5) API 契约

已实现 (hub):
- `GET/POST /api/tenants`、`GET /api/tenants/:id` / `GET /api/tenants/:id/members`
- `POST /api/tenants/:id/invite` / `GET /api/tenants/:id/invitations` / `GET /api/invitations/:token` / `POST /api/invitations/:token/accept`(含 CAS + db.batch,P0-2 GAN 已加固)

待补:
- `DELETE /api/invitations/:token` (P1 撤销邀请)
- `PATCH/DELETE /api/tenants/:id/members/:userId` (P1 改 role / 踢人)
- Employees / Departments / Projects CRUD 各 4 端点 (P0)
- Tasks / project_members (P1)

详见 [`../../reference/api-needed.md`](../../reference/api-needed.md) §Organization。

---

## (原 §6) 实现状态

| 层 | 状态 |
|---|---|
| Hub tenant + members + invitations | ✅ |
| Hub employees / departments / projects / tasks | ⚠️ 待新增 (migration 0006) |
| Hub 撤销邀请 / 改 role / 踢人 | ⚠️ 待补 |
| Hub 权限中间件 | ✅ `requireRole(['owner','admin'])` 已存在 |
| Dashboard `/organization` 页 | ⚠️ 待还原 |
| Dashboard `/settings/members` 页 | ⚠️ PWA 现有 MembersPage 可参考 |
| Dashboard `/organization/projects/:id` 子页 | ⚠️ 待还原 |

---

## (原 §7) 迁移步骤

1. D1 migration 0006_org_entities.sql — 5 张表
2. Hub 新增 routes: employees.ts / departments.ts / projects.ts / tasks.ts
3. Hub /api/tenants/:id/invitations/:token DELETE
4. Hub /api/tenants/:id/members/:userId PATCH/DELETE
5. 删 user 时:membership 删,employees user_id 置 NULL + status=suspended
6. 还原 dashboard 页面
7. fetch 全部走 `${HUB_URL}${path}` + `credentials: 'include'`
8. 权限 UI 层隐藏,后端中间件强制
9. 跨 tenant 攻击防御

---

## (原 §8) 技术验收清单

- [ ] 三 tab 切换,URL `?tab=` 保留
- [ ] Employees/Departments/Projects CRUD
- [ ] 跨 tenant 攻击 → 403
- [ ] 邀请 / 撤销 / 接受 / 改 role / 踢人
- [ ] member 看不到 admin 按钮
