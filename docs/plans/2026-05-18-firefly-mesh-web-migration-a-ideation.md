# Web Migration A — Ideation

> 系列文档 `2026-05-18-firefly-mesh-web-migration-a-*`。本 sprint = hub 后端 12/12 完成后的第一个前端 sprint。

## 1. 一句话定位

把 `legacy/v0/packages/web/` 完整 Next.js dashboard 搬到 `services/web/`，**只改两件事**（fetch base URL + auth base URL），让它本地能跑起来对接 hub.firefly-mesh.com。Cloudflare Pages 部署 + server route 删除 + 上线推 sprint B。

## 2. 为什么本 sprint 范围这么窄

经过仔细审计 `legacy/v0/packages/web/`：

- **14 个 page.tsx 没有一个 import `@firefly-mesh/core`** — 全部数据访问通过 `lib/api-client.ts::api()` 调 `/api/*` route
- `lib/auth-client.ts` 用 `createAuthClient({ baseURL })`，base URL 来自 `NEXT_PUBLIC_APP_URL`
- 这意味着把 `api()` 的 fetch 路径从相对路径改成 `HUB_URL + path` + `credentials: 'include'`，再把 `authClient` 的 baseURL 改成 hub，dashboard 就能完整对接 hub —— **48 个 server route 全部不用动**（暂时变成 dead code，sprint B 删）

这是个 happy accident — v0 当时的"server route 作为 BFF"设计天然支持 fetch 重定向。

## 3. 用户故事

### 3.1 工程师本地启动

```
pnpm install                          # 安装 services/web 依赖
pnpm --filter @firefly-mesh/hub dev    # 端 8787 起 hub
pnpm --filter @firefly-mesh/web dev    # 端 3000 起 dashboard
# 浏览器打开 http://localhost:3000 → 完整 dashboard
# 注册 → 创建 org → 看到员工/部门/项目页面
```

### 3.2 不在范围（推到 sprint B）

- ❌ 删除 services/web/app/api/* 里 45 个不再使用的 route.ts
- ❌ Cloudflare Pages 部署
- ❌ 删除 services/pwa/
- ❌ 加 `@cloudflare/next-on-pages` 适配
- ❌ next-on-pages edge runtime 兼容（v0 代码用 Node API 的地方要审）
- ❌ 端到端 QA 对接生产 hub

## 4. 模块清单（A 内步骤）

| Step | 内容 |
|---|---|
| A.1 | `cp -r legacy/v0/packages/web/ services/web/` |
| A.2 | services/web/package.json 改名 `@firefly-mesh/web`，加入 pnpm-workspace.yaml |
| A.3 | 解决 deps：v0 用了 next@16 / better-auth@1.6.9，对照根 monorepo 看版本冲突 |
| A.4 | 改 `services/web/lib/api-client.ts`：`fetch(path)` → `fetch(HUB_URL + path, { credentials: 'include' })` |
| A.5 | 改 `services/web/lib/auth-client.ts`：`baseURL = HUB_URL` |
| A.6 | 抢救 i18n：`cp services/pwa/src/i18n/* services/web/lib/i18n/` + 在 root layout 接入 |
| A.7 | 设环境变量：`services/web/.env.local` 加 `NEXT_PUBLIC_HUB_URL=http://localhost:8787` |
| A.8 | 本地跑通 happy path：注册 → 创建 org → 看到 dashboard 页面 |

## 5. 验收

- [ ] 8 份设计文档
- [ ] services/web 在 pnpm workspace
- [ ] `pnpm --filter @firefly-mesh/web typecheck` 通过（or 至少 reduce 已知错误到记录列表）
- [ ] `pnpm --filter @firefly-mesh/web dev` 启动成功
- [ ] 浏览器能注册 → 登录 → 看到 dashboard 主页（含 i18n 中英切换）
- [ ] 现有 6 e2e（hub 后端）全部不回归（hub 一行不动）

## 6. 范围分裂理由

把 sprint A vs B 分开是**降低单次 sleep run 风险**：
- A = "对接 hub，本地跑起来" — 改动局限于 web 层，hub 不动，可立即看到效果
- B = "清理 + 部署" — 删 45 routes + Cloudflare Pages 配置 + 端到端联调，独立验证

A 完成后即使不做 B 也有价值（开发可本地用真后端）。

## 7. 风险

| 风险 | 缓解 |
|---|---|
| v0 用 next@16，monorepo root 没固定 next 版本 → 版本冲突 | 单独装在 services/web，不向上提升；后续 sprint 升级再决定 |
| `better-auth` 客户端跨域 cookie 默认拒绝（SameSite=Lax） | 在 hub 端确认 trustedOrigins 含 dashboard 域 + 在 dashboard 设 cookie domain 一致；测试时 localhost:3000 + localhost:8787 需特殊处理 |
| v0 lib/api-client.ts credentials: 'same-origin' → 改 'include' 后 hub CORS preflight 必须放行 | 验证 hub 的 cors 中间件 `origin: c.env.PWA_URL` 允许 dashboard origin |
| v0 page.tsx 里有 RSC fetch 直接调 db （未通过 api()） | 已 grep 排除 — 14 个 page.tsx 都不 import @firefly-mesh/core |
| api-client.ts 的 `credentials: 'same-origin'` 改成 'include' 后，浏览器对 hub.firefly-mesh.com 发请求需要 hub CORS Access-Control-Allow-Credentials: true | 已确认 hub 现有 cors 中间件设置 credentials: true |
| services/web 在 Workers 环境下用了 Node API（如 fs / path） | next-on-pages 适配是 sprint B 的事；A 阶段只要 `next dev` 能跑就行 |
