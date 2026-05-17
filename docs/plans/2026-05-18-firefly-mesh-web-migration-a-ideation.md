# Web Migration A — Ideation

> 系列文档 `2026-05-18-firefly-mesh-web-migration-a-*`。本 sprint = hub 后端 12/12 完成后的第一个前端 sprint。

## 1. 一句话定位

把 `legacy/v0/packages/web/` 完整 Next.js dashboard 搬到 `services/web/`，**用 Next.js rewrites 代理 `/api/* → hub`**（避免跨域 cookie 噩梦），同时**替换 RSC 入口 `app/page.tsx`**（v0 原文件直接调 Postgres），**rename 14 个不一致路径**，**禁用 10 个 hub 缺失端点的 UI**。本地能跑起来对接 hub.firefly-mesh.com。Cloudflare Pages 部署 + server route 删除 + 上线推 sprint B。

## 2. 为什么"只改两件事"的乐观假设是错的（v2 修订）

第一版 ideation 写："14 page.tsx 没有一个 import `@firefly-mesh/core` —— 全部数据访问通过 `lib/api-client.ts::api()`"。

**reviewer 实测 grep 发现**：
- `app/page.tsx` 是 RSC，**直接** `import { auth } from "@firefly-mesh/core/auth"` + `import { db, employees } from "@firefly-mesh/core/db"` + `auth.api.getSession()` + Drizzle 查询。这是入口页（用户访问 `/` 必触发），不替换 sprint A 会 500。
- `components/knowledge/upload-dialog.tsx:60` + `:207` + `app/onboarding/import/page.tsx:39` 三处直接 `fetch(...)`（不走 api()，其中 2 处 multipart）。
- v0 dashboard 多页用 `new EventSource('/api/stream/...')`（SSE）做 live 更新。hub 无 SSE 端点。
- v0 路径用单数（`/api/employee`），hub 用复数（`/api/employees`），差异远不止设计 v1 列的 5-7 个，**实测 20+ 处**。

所以"只改两件事"是基于不完整 grep 的乐观假设。v2 修订后的真实工作量：

| 类别 | 数量 |
|---|---|
| RSC 入口替换 | 1 个 (app/page.tsx) |
| 路径 rename | 14 处 |
| UI 禁用（hub 缺失端点）| 10 处 |
| 配置改动 (next.config rewrites + 删 transpilePackages) | 2 处 |
| i18n（next-intl 中文 messages + LanguageSwitcher）| ~3 文件 |

## 3. 用户故事

### 3.1 工程师本地启动

```
pnpm install                              # 安装 services/web 依赖
pnpm --filter @firefly-mesh/hub dev       # 端 8787 起 hub
pnpm --filter @firefly-mesh/web dev       # 端 3000 起 dashboard（含 rewrites）
# 浏览器打开 http://localhost:3000 → 完整 dashboard
# 注册 → 创建 org → 看到员工/部门/项目页面
# 中英切换工作
# audit / multipart upload 等显示 "Coming soon" banner
```

### 3.2 不在范围（推到 sprint B）

- ❌ 删除 services/web/app/api/* 里 45 个不再使用的 route.ts
- ❌ Cloudflare Pages 部署
- ❌ 删除 services/pwa/
- ❌ 加 `@cloudflare/next-on-pages` 适配
- ❌ next-on-pages edge runtime 兼容（v0 代码用 Node API 的地方要审）
- ❌ 端到端 QA 对接生产 hub
- ❌ SSE → WS 替换（audit / knowledge live 实时更新）
- ❌ 加 hub 端 multipart upload / bulk import / audit-read / org/graph 聚合端点

## 4. 模块清单（A 内步骤，v2 修订为 11 task）

| Step | 内容 | 修订状态 |
|---|---|---|
| A.0 | 替换 `app/page.tsx` 为客户端 auth gate（W7 fix）| **新增** |
| A.1 | `cp -r legacy/v0/packages/web/ services/web/` | 不变 |
| A.2 | services/web/package.json 改名 `@firefly-mesh/web`，加入 pnpm-workspace.yaml | 不变 |
| A.3 | 解决 deps + **删 next.config.ts transpilePackages 中的 @firefly-mesh/core**（W8 fix） | 修订 |
| A.4 | 改 `next.config.ts` 加 `rewrites()` 代理 `/api/* → hub`（W2' fix） | **替换原 A.4** |
| A.5 | `lib/api-client.ts`：credentials 'same-origin'（不再用 'include'），路径保持相对 | 简化 |
| A.6 | `lib/auth-client.ts`：baseURL 保留默认（走 rewrites）| 简化 |
| A.7 | i18n: 用 v0 已有 next-intl + cp services/pwa 的中文 messages（W5' fix）| 修订 |
| A.8 | 设环境变量 + hub `.dev.vars` 加 `PWA_URL=http://localhost:3000`（CORS 备用）| 不变 |
| A.9 | 14 路径 rename + 10 UI 禁用 banner（按 api.md §2 表执行；AE / AF 强制） | **大幅扩展** |
| A.10 | 本地跑通 happy path：注册 → 创建 org → 看到 dashboard | 不变 |
| A.11 | 文档同步 + commits | 不变 |

## 5. 验收

- [ ] 8 份设计文档（v2 修订后）
- [ ] services/web 在 pnpm workspace
- [ ] `pnpm --filter @firefly-mesh/web typecheck` 通过（or 至少 reduce 已知错误到记录列表）
- [ ] `pnpm --filter @firefly-mesh/web dev` 启动成功
- [ ] 浏览器能注册 → 登录 → 看到 dashboard 主页（含 i18n 中英切换）
- [ ] app/page.tsx 客户端 gate 正确：未登录 → /login，已登录无 agent → /onboarding，已登录有 agent → /inbox
- [ ] 14 路径 rename 完成（grep 验证）
- [ ] 10 个 UI 禁用 banner 在对应页面正确显示
- [ ] 现有 6 e2e（hub 后端）全部不回归（hub 一行不动）

## 6. 范围分裂理由

把 sprint A vs B 分开是**降低单次 sleep run 风险**：
- A = "对接 hub，本地跑起来" — 改动局限于 web 层，hub 不动，可立即看到效果
- B = "清理 + 部署" — 删 45 routes + Cloudflare Pages 配置 + 端到端联调，独立验证

A 完成后即使不做 B 也有价值（开发可本地用真后端）。

## 7. 风险（v2 修订）

| 风险 | 缓解 |
|---|---|
| v0 用 next@16，monorepo root 没固定 next 版本 → 版本冲突 | 单独装在 services/web，不向上提升；后续 sprint 升级再决定 |
| ~~CORS preflight 失败~~（rewrites 后不存在跨域）| ~~过期~~ |
| ~~Better Auth cookie 不带上~~（rewrites 后是 same-origin）| ~~过期~~ |
| `app/page.tsx` 重写后 useEffect race condition（hydration 慢 + 重定向闪烁）| 加 loading state `<Skeleton />`，避免空白闪屏；用 router.replace 避免 history 污染 |
| /api/* 路径 rename 漏改一处 | 用 grep 强制验证（AF2）；不允许 case-by-case |
| Next.js rewrites + Better Auth OAuth callback（GitHub / Google）跳转 origin 不一致 | 实测：rewrites 是 server-side fetch 代理，OAuth provider 仍跳回浏览器 `localhost:3000`，由 Next.js 处理 callback 路由 → 应该工作；A.10 smoke test 必验 |
| SSE EventSource 通过 rewrites 长连接行为不确定 | sprint A 接受 audit/knowledge "Live" 失效 + console.warn；sprint B 单独修（改 WS） |
| `transpilePackages: @firefly-mesh/core` 删除后某 component 编译失败 | 如果删除后某 component import 路径报错 → grep 找出该 import → 那是个新的 RSC 调 db 案例 → 加进 A.0 替换清单 |
| services/web 在 Workers 环境下用了 Node API（如 fs / path） | next-on-pages 适配是 sprint B 的事；A 阶段只要 `next dev` 能跑就行 |
| multipart upload-dialog + import page 用户体验差（banner 而不是真功能）| 接受；sprint B / V1.1 加 hub 端点后真接入；当前 banner 是诚实的，比 silent fail 好 |
| v0 lib/api-client.ts 期望 `credentials: 'same-origin'`，但 multipart fetch 用了 `'include'` | A.5 同时审 multipart fetch 的 credentials，统一改 'same-origin' |
