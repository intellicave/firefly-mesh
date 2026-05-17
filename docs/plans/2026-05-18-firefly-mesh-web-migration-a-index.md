# Web Migration A — 文档地图

> hub 后端 12/12 done 之后的第一个前端 sprint。
>
> **2026-05-18 v2 修订**：第一版设计经独立 reviewer 审查后发现 4 Critical + 4 High，已就地修订（详见 meta.md "Reviewer 反馈" 段）。Sprint A 估时从 1 天上调到 1.5-2 天。

## 阅读路径

| 角色 | 读 |
|---|---|
| 新工程师 | [design.md](2026-05-18-firefly-mesh-web-migration-a-design.md) §2-5 + [plan.md](2026-05-18-firefly-mesh-web-migration-a-plan.md) |
| reviewer | 本 [plan.md §1](2026-05-18-firefly-mesh-web-migration-a-plan.md) acceptance + [rules.md Z-AF](2026-05-18-firefly-mesh-web-migration-a-rules.md) + [api.md §2 完整 diff 表](2026-05-18-firefly-mesh-web-migration-a-api.md) |
| CEO 看进度 | [meta.md](2026-05-18-firefly-mesh-web-migration-a-meta.md) |

## 文档清单

| 文档 | 角色 |
|---|---|
| [meta.md](2026-05-18-firefly-mesh-web-migration-a-meta.md) | W1-W9 决策 + 铁律 + reviewer 反馈 |
| [ideation.md](2026-05-18-firefly-mesh-web-migration-a-ideation.md) | sprint 范围 + 用户故事 + 风险 |
| [design.md](2026-05-18-firefly-mesh-web-migration-a-design.md) | rewrites 代理 + app/page.tsx 替换 + i18n + CORS + workspace 集成 |
| [ui.md](2026-05-18-firefly-mesh-web-migration-a-ui.md) | UI 继承（不动）+ 禁用 banner + i18n 接入 + 已知 gap |
| [api.md](2026-05-18-firefly-mesh-web-migration-a-api.md) | 零新 endpoint + v0 ↔ hub 完整 20+ 行路径 diff 表 |
| [plan.md](2026-05-18-firefly-mesh-web-migration-a-plan.md) | 11 task (含 A.0) + acceptance + 风险 |
| [rules.md](2026-05-18-firefly-mesh-web-migration-a-rules.md) | Z (不动 hub) / AA (fetch 模式 - W2' 修订) / AB (deps - 修订) / AC (do-not-touch - 修订) / AD (app/page.tsx 替换) / AE (UI 禁用清单) / AF (路径 rename 一致性) |
| [index.md](2026-05-18-firefly-mesh-web-migration-a-index.md) | 本文 |

## sprint A → B → go-live 三步

| Sprint | 状态 | 估时 | 内容 |
|---|---|---|---|
| **web migration A** | 🚧 本 | **1.5-2 天**（修订前 1 天，reviewer 抓出 4C+4H 后上调）| rewrites + app/page.tsx 替换 + 14 路径 rename + 10 UI 禁用 + i18n + dev 跑通 |
| web migration B | 📅 | 1-1.5 天 | 删 45 v0 server routes + Pages 部署 + cookieDomain prod + 删 pwa + SSE → WS + E2E |
| go-live | 📅 | 1-2 天 | Stripe + 法律 + Sentry + 营销 + soft launch |

## 核心策略（v2 修订）

**反转之前的"fetch 绝对 URL"思路**，改用 Next.js rewrites：

- 浏览器始终 fetch 相对路径 `/api/*`（same-origin 到 Next.js dev server）
- Next.js server 在 SSR 阶段把请求代理到 hub `http://localhost:8787`
- 浏览器 cookie domain = `localhost`（同源），无跨域问题
- **hub CORS 一行不动**，**Better Auth SameSite 一行不动**，**api-client.ts base URL 一行不动**

副作用：multipart 上传 + SSE 的 fetch 也走 rewrites（前者无 hub 端实现 → 禁用 banner；后者长连接行为待 sprint A 实测）。

替代的代价：next.config.ts 加 rewrites 块（10 行）+ 删 transpilePackages 一项（如有）。这两处改动比"跨域 cookie + CORS preflight + SameSite=None"的调试代价小很多。

## 真实工作量

| 类别 | 工作量 |
|---|---|
| cp + workspace + deps 解决 | ~2h |
| app/page.tsx 替换（W7）| ~30m |
| next.config rewrites + 删 transpilePackages | ~15m |
| 14 路径 rename（grep + 一次批量替换 + 验证）| ~2h |
| 10 UI 禁用 banner（每个 ~10m）| ~1.5h |
| i18n: cp 中文 messages + 写 LanguageSwitcher | ~1h |
| hub .dev.vars + .env.local 配置 | ~10m |
| 本地 dev smoke test + 修小 bug | ~2h |
| 文档同步 + 4-6 commits | ~30m |
| **合计** | **~10h（1.5 天）**，留 buffer 到 2 天 |
