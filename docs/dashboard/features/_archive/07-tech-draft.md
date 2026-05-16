# [归档] Feature 07 — 账户与登录 · 技术层草稿

> 状态: 草稿,等 layer-by-layer 迭代。

---

## 数据模型

参见 [`../../reference/data-models.md`](../../reference/data-models.md) §auth。
Better Auth 表:`user` / `account`(OAuth + password)/ `session`(含 ip_address + user_agent)/ `verification`。

V2 应用层扩展(本 V1 不做):`user_preferences` (language / timezone / notification_settings)。

---

## API 契约

已实现(全部 Better Auth):
- `POST /api/auth/sign-up/email` / `sign-in/email` / `sign-out` / `change-password`
- `GET /api/auth/sign-in/social?provider=google|github` / `callback/:provider`
- `GET /api/auth/session`
- `GET /api/auth/list-sessions` / `POST /api/auth/revoke-session`

待补(应用层):
- `GET /api/me` 当前 user + tenants + default_tenant_id + onboarding.completed (P0)
- `PATCH /api/me` 改 name (P0)
- `POST /api/me/avatar` 头像上传 (P2, V1 用 OAuth provider 头像)

详见 [`../../reference/api-needed.md`](../../reference/api-needed.md) §Account。

---

## 实现状态

| 层 | 状态 |
|---|---|
| Hub Better Auth 全部端点 | ✅ |
| Hub `/api/me` 应用层 | ⚠️ 待补 |
| Hub cookie 域 `.firefly-mesh.com` | ⚠️ 部署时确认 `BETTER_AUTH_COOKIE_DOMAIN` |
| Dashboard `/signup`, `/login` | ⚠️ 待还原 |
| Dashboard `/settings` 3 tabs | ⚠️ 待还原 |
| Auth client (better-auth/react) | ⚠️ 新建 `lib/auth-client.ts` |

---

## 迁移步骤

1. 新建 `services/dashboard/lib/auth-client.ts` 用 `createAuthClient({ baseURL: ${HUB_URL}/api/auth })`
2. 还原 `app/signup/page.tsx` + `app/login/page.tsx` + `app/(dashboard)/settings/page.tsx`
3. OAuth callbackURL **必须绝对 URL** `${window.location.origin}/onboarding`
4. 登录后判断 tenants 长度跳 `/inbox` 或 `/onboarding`
5. Middleware (`services/dashboard/middleware.ts`):
   - 未登录 `/(dashboard)/*` → /login
   - 已登录 /login,/signup → /inbox
6. Hub `/api/me` 端点新增
7. 错误文案统一防猜测:`Invalid email or password`
8. i18n key 前缀 `dash_auth_*`

详见 [`../auth-cookie.md`](../auth-cookie.md)(跨域 cookie 配置 — 这是最容易踩坑的地方)。

---

## 技术验收清单

- [ ] cookie 域 `.firefly-mesh.com`(DevTools 验证)
- [ ] OAuth 回跳 `app.firefly-mesh.com/...`(不是 hub 域)
- [ ] 错误密码 → "Invalid email or password"(不区分两种错)
- [ ] List sessions 显示多端,revoke 单个/全部
- [ ] 登出 cookie 清空
- [ ] middleware 跳转正确
