# Web Migration A — Meta

> 第一个非后端 sprint。沿用 P1-P29 + edge D1-D8 + 全部 rules.md A-Y。
>
> **2026-05-18 update**：第一版设计经独立 code-reviewer 审查发现 4 Critical + 4 High，已在原文档内就地修订并新增 AD/AE/AF 规则。决策 W2 → W2'，W5 → W5'。本 sprint 估时从 1 天上调到 1.5-2 天。

## 关系链

| sprint | 状态 |
|---|---|
| hub 后端 M1-M12 | ✅ 全部完成 (5 sprint, 2026-05-16~18) |
| **web migration A** | 🚧 本 sprint |
| web migration B | 📅 next |
| go-live | 📅 next next |

## 决策 W1-W6（修订版）

| ID | 决策 | 状态 |
|---|---|---|
| **W1** | sprint A 不删 v0 server route（推 sprint B）| 不变 |
| **W2'** | **Next.js rewrites 代理 `/api/* → hub`**（不是 fetch 绝对 URL）| **修订**（原 W2 假设跨域 cookie 可工作，reviewer 实证不行）|
| **W3** | services/web 独立依赖版本，不向上提升 | 不变 |
| **W4** | dev 时改 hub .dev.vars 加 PWA_URL（备用，rewrites 后已不必走 CORS），不改 hub 源码 | 不变 |
| **W5'** | **i18n 用 v0 已有的 next-intl + lib/messages/en.ts**，只 cp services/pwa 的中文翻译内容（不 cp Zustand store / switcher）| **修订**（原 W5 会引 SSR hydration mismatch）|
| **W6** | cookieDomain 配置推 sprint B | 不变 |

新增（v2 修订引入）：

| ID | 决策 |
|---|---|
| **W7** | `app/page.tsx` 必须替换为客户端 auth gate（v0 原文件是 RSC 直接调 Postgres，sprint A 跑不起来） |
| **W8** | next.config.ts 删除 `transpilePackages: ["@firefly-mesh/core"]`（如有），避免 Next.js 试图编译 Postgres 代码 |
| **W9** | 缺失端点（audit read / multipart upload / SSE / dry-run / org graph / token batch / onboarding state）的 UI **必须显式禁用 + banner**，禁止 silent fail |

v2 第二轮 reviewer 修订引入：

| ID | 决策 |
|---|---|
| **W10** | next.config.ts `rewrites()` 数组必须保留 v0 已有的 `/.well-known/agent-card.json` 规则（A2A 协议发现端点），不能直接替换为只含 hub proxy（H-NEW-1 reviewer fix）|
| **W11** | next-intl 是从零 bootstrap（不是"集成已有"）。v0 虽含 next-intl@4.11.0 但从未激活：需新增 `i18n/request.ts`、修改 layout.tsx、采用 "without i18n routing" 模式。13 现有 page.tsx 的 `messages.x` 硬编码引用 sprint A 不迁移到 useTranslations（V0.2 sprint）。（M1 reviewer 澄清）|
| **W12** | `/api/me` 路径冲突处理：v0 已有 `app/api/me/route.ts`（Postgres），hub 也有 `/api/me`（D1）。Next.js rewrites 优先级让 v0 route.ts 命中，sprint A 内**实际访问 v0 Postgres 而非 hub**。A.9 阶段决定方案（推荐：删除该 v0 route.ts；备选：route.ts 内部改 proxy 到 hub）。（M2 reviewer 澄清）|

## 不可破坏（铁律）

- **hub 一行不动**（git diff services/hub 必须空）
- 不删 legacy / 不删 services/pwa
- 不部署 prod
- 不引入新依赖（v0 已有 deps 全部保留即可；next-intl 已在 v0 deps 内，允许使用）
- 缺失 hub 端点 → 禁用 UI（不能 silent fail）

## 跟先前 sprint 的接口

- 调用 hub ~80 个 endpoint —— 见 [api.md §2 完整 diff 表](2026-05-18-firefly-mesh-web-migration-a-api.md)
- **不依赖** hub CORS 接受 localhost:3000（rewrites 后是 same-origin）
- **不依赖** Better Auth 跨域 cookie（rewrites 后是 same-origin cookie）
- hub .dev.vars 加 `PWA_URL=http://localhost:3000`（防其他来源被 CORS 阻拦）

## 风险登记

详见 [ideation §7](2026-05-18-firefly-mesh-web-migration-a-ideation.md#7-风险) + [plan §4](2026-05-18-firefly-mesh-web-migration-a-plan.md#4-风险)。

## Reviewer 反馈（v1 → v2）

第一版（commit c1e9ac0）评级 C，发现：
- 4 Critical（app/page.tsx RSC 调 db / multipart fetch / SSE / .dev.vars 缺 PWA_URL）
- 4 High（路径 diff 20+ / next-intl 已存在 / transpilePackages 风险 / SameSite=Lax 跨域）
- 3 Medium + 2 Low

修订后（本版）：
- 反转 fetch 策略（rewrites 替代跨域）→ Critical C4 + High H4 自动消解
- 新增 Task A.0（替换 app/page.tsx）→ Critical C1 消解
- 新增 AE / AF / W9 规则 → Critical C2 / C3 + High H1 消解
- 改 W5 → W5' + 删 transpilePackages → High H2 / H3 消解

## v2 第二轮 reviewer（commit 78536ff 之后）

第二轮 reviewer 评级 **B**，确认全部 8 个 v1 Critical/High 真实修复。新发现：

- **2 High**：H-NEW-1（rewrites 漏保留 well-known agent-card.json 规则）+ H-NEW-2（app/page.tsx 有 dead loading 状态代码）
- **3 Medium**：M1（next-intl 是从零 bootstrap）+ M2（Next.js 路由优先级 → /api/me 命中 v0 而非 hub）+ M3（onboarding 状态推导缺规则）

全部修复入 plan.md + design.md（commit pending）。新增 W10-W12 决策。

预期 v2 第三轮 reviewer 重审通过（无 Critical/High，最多 Medium/Low）。
