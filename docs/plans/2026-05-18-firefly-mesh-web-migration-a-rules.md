# Web Migration A — Rules (delta)

> 继承 rules.md A-Y 全部红线 + sprint-locked 决策 W1-W6（W2/W5 已修订为 W2'/W5'，详见 meta.md §决策更新）。本文档追加 Z, AA, AB, AC, AD。

## Z. 不动 hub 铁律

**Z1**：sprint A 期间 `git diff services/hub` **必须为空**。任何对 hub 代码 / migrations / package.json / wrangler.toml 的修改 → 立即停止 + 转 sprint B 或 separate sprint。

**Z2**：dev 环境 hub `.dev.vars` 加 / 改 `PWA_URL=http://localhost:3000` 是允许的（gitignored 文件不算"动 hub"），但必须在 PROGRESS.md / state.yaml 记录。即使 W2' 后 dashboard 不再跨域调 hub，PWA_URL 仍要配置（防其他来源——curl / 未来 WS 客户端——被 CORS 阻拦）。

**Z3**：发现 hub CORS / cookie / 字段需要改 → 写到 sprint B backlog，不在本 sprint 改。Rewrites 策略已经消除了 sprint A 内对 hub CORS / SameSite 的依赖（详见 design.md §3）。

## AA. fetch URL 模式（W2' 修订后）

**AA1**：services/web 调 hub **必须**通过 `lib/api-client.ts::api()` helper，禁止零散 `fetch(...)` 调用。**唯一例外**：multipart 上传（FormData）允许直接 `fetch('/api/...', ...)`，因为 api() 只支持 JSON。这些 fetch 必须用**相对路径**（走 next.config rewrites）。

**AA2**：`api()` helper 内部使用**相对路径** `/api/...`（不 prefix HUB_URL）。HUB_URL 仅在 `next.config.ts` 的 rewrites destination 里使用一次，作为唯一配置入口。禁止在 api() / fetch() / authClient 里 hardcode `http://localhost:8787` 或域名。

**AA3**：credentials 必须是 `'same-origin'`（rewrites 后浏览器 → Next.js 是 same-origin；不需要 'include'）。如发现某调用用 `'include'` 或 `'omit'` → 修。

**AA4**：authClient（Better Auth）的 baseURL **保留默认相对路径**（即 `process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"`），通过 rewrites 透传到 hub `/api/auth/*`。禁止把 baseURL 改成 HUB_URL（那会触发跨域 cookie 问题）。

## AB. deps 限制（修订）

**AB1**：sprint A 期间 services/web/package.json 的 dependencies / devDependencies 列表**与 cp 来的 legacy 100% 一致**（除唯一一项：见 AB2）。

**AB2（修订）**：v0 `package.json` **已含 `next-intl@4.11.0`**，sprint A 允许使用。不再额外引入 i18n lib（react-i18next 等）。Sprint A **不引入新 deps**。

**AB3**：如真的需要新 dep（如解决某编译错误），先在 PR 描述里 justify + 标记需要 reviewer agent 确认。

## AC. v0 dashboard 文件 do-not-touch（本 sprint）

**AC1（修订）**：14 个 page.tsx 中 **13 个** 不动（除非 A.9 路径修复必要时改路径常量）；**`app/page.tsx` 必须替换为客户端 auth gate**（详见 AD）。

**AC2**：components/* — 不动。**例外**：A.9 路径 rename 必要时改 hooks / components 里的 path 字符串。详见 api.md §2 完整 diff 表。

**AC3**：hooks/* — 同 AC2。

**AC4（修订 / W15 例外）**：48 个 app/api/*/route.ts 中 **43 个不删不改**（保留，sprint B 删）。**5 个例外必须在 sprint A 删除**（W15）：
1. `services/web/app/api/auth/[...all]/route.ts`
2. `services/web/app/api/me/route.ts`
3. `services/web/app/api/knowledge/route.ts`
4. `services/web/app/api/knowledge/[id]/route.ts`
5. `services/web/app/api/knowledge/search/route.ts`

原因：Next.js 路由优先级（FS 路由抢在 rewrites 前）+ 上述路径在 hub 同路径存在 → 不删则客户端永远 hit v0 Postgres，sprint A 目标不达成。删除是 sprint A 跑通的唯一路径，记录到 W15。

**AC5（修订 → W14 推迟）**：next.config.ts 允许 **两处** 改动：
- ✅ 加 `rewrites()` 代理 `/api/:path*` → hub（同时保留 v0 已有的 `/.well-known/agent-card.json` 规则）
- ✅ 加 `withNextIntl` 包装 export（next-intl 接入需要）
- ❌ **不**删除 `transpilePackages: ["@firefly-mesh/core"]`（W8 → W14 推迟到 sprint B；v0 server routes + middleware 都 import 此包，删了 next dev 模块解析失败）

其他配置（experimental / images / headers 等）不改。tsconfig.json **不改**。

**AC5 / W13 附录**：pnpm-workspace.yaml 允许加 `legacy/v0/packages/core` 一项（W13 required），不算违反"不删 legacy / 不动 legacy 源码"——这是 workspace 元配置，不修改 legacy 任何文件内容。

## AD. app/page.tsx 替换（C1 fix，新增）

**AD1**：legacy v0 的 `app/page.tsx` 是 Server Component，直接 `import { auth } from "@firefly-mesh/core/auth"` + `import { db, employees } from "@firefly-mesh/core/db"`，**绕开** api() helper 直接访问 Postgres。这是入口页（用户访问 `/` 必触发），不替换会导致 sprint A 跑不起来（Postgres 连接失败 → 500）。

**AD2**：替换实现必须是**客户端组件**（`"use client"`），用 `authClient.getSession()` 判断登录态，用 fetch `/api/me/agents`（走 rewrites）判断 onboarding 状态。**禁止**保留任何 server-side `@firefly-mesh/core` import。

**AD3**：替换后 grep 验证：`grep -r "@firefly-mesh/core" services/web/app/page.tsx` 必须为空。

## AE. UI 禁用清单（H1 fix，新增）

**AE1**：以下 v0 dashboard 功能在 sprint A 内**功能不可用**（hub 端 endpoint 缺失），必须在对应页面顶部加显眼禁用 banner 或注释掉触发按钮，不能让用户点了之后 silent fail：

| 功能 | 禁用原因 | 计划恢复 |
|---|---|---|
| /api/knowledge/upload (multipart) | hub 只接 inline POST，未实现 multipart | sprint B 或 V1.1 加 multipart endpoint |
| /api/employee/import (multipart CSV) | hub 无 bulk import endpoint | sprint B |
| /api/skill/{id}/dry-run | hub M9 P26 决策延期 | V2（skill 执行引擎 sprint） |
| /api/skill/loaded | hub 无 loaded tab endpoint | sprint B 或 skills sprint |
| /api/audit/* (read) | hub M12 只做写入面 | audit-read sprint |
| /api/stream/* (SSE) | hub 用 WS 替代 SSE，sprint A 不接 WS | sprint B（替换为 WS 客户端） |
| /api/org/graph | hub 无聚合 endpoint，客户端聚合替代 | sprint B 或长期保持客户端聚合 |
| /api/token/batch | hub 无 batch endpoint，N 次调用替代 | 客户端循环即可，不必加 |
| /api/onboarding/state | hub 无聚合 endpoint，客户端聚合 | 客户端 /api/me + /api/organizations/me 拼装 |

**AE2**：禁用通过下列任一方式实现（不能 silent fail）：
- 页面顶部 `<Alert variant="destructive">Sprint A: X disabled — use Y instead</Alert>`
- 触发按钮 `disabled={true}` + tooltip "Coming in sprint B"
- 注释掉触发代码 + 留 `// TODO sprint B: re-enable when /api/X ready` 注释

**AE3**：page.tsx 里的 SSE EventSource 实例化代码可保留，但加 try/catch + console.warn，避免控制台炸红。

## AF. 路径 rename 一致性（H1 fix，新增）

**AF1**：sprint A 必须执行 api.md §2 表里**所有 14 项 rename**（如 `/api/employee` → `/api/employees`），不能挑捡执行。

**AF2**：rename 完成后 grep 验证：`grep -rE "/api/(employee|department|skill|task|org|token|boundary|a2a)([/?'\"]|$)" services/web/ --include="*.ts" --include="*.tsx"` 应**零 hit**（除非命中的是新路径，如 `/api/employees`）。

**AF3**：rename 必须用 `grep -l` 找到所有点然后逐一替换；禁止"试一下，跑起来发现 404 才修"的 case-by-case 模式（容易遗漏）。
