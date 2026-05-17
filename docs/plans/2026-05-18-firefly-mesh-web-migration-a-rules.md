# Web Migration A — Rules (delta)

> 继承 rules.md A-Y 全部红线 + sprint-locked 决策 W1-W6。本文档追加 Z, AA。

## Z. 不动 hub 铁律

**Z1**：sprint A 期间 `git diff services/hub` **必须为空**。任何对 hub 代码 / migrations / package.json / wrangler.toml 的修改 → 立即停止 + 转 sprint B 或 separate sprint。

**Z2**：dev 环境 hub `.dev.vars` 的 `PWA_URL` 临时改为 `http://localhost:3000` 是允许的（gitignored 文件不算"动 hub"），但必须在 PROGRESS.md / state.yaml 记录这个 dev 配置。

**Z3**：发现 hub CORS / cookie / 字段需要改 → 写到 sprint B backlog，不在本 sprint 改。

## AA. fetch URL 模式

**AA1**：services/web 调 hub **必须**通过 `lib/api-client.ts::api()` helper，禁止零散 `fetch(...)` 调用。

**AA2**：`api()` helper 内部用 `process.env.NEXT_PUBLIC_HUB_URL` —— 禁止 hardcode `http://localhost:8787` 或域名。

**AA3**：credentials 必须是 `'include'`。如发现某调用用 `'same-origin'` 或 `'omit'` → 修。

**AA4**：authClient（Better Auth）的 baseURL 必须用同样的 env var；保持单一 source of truth。

## AB. 不引入新 deps

**AB1**：sprint A 期间 services/web/package.json 的 dependencies / devDependencies 列表**与 cp 来的 legacy 100% 一致**。

**AB2**：i18n 模块 cp 自 services/pwa，不引入 next-intl / react-i18next。

**AB3**：如真的需要新 dep（如解决某编译错误），先在 PR 描述里 justify + 标记需要 reviewer agent 确认。

## AC. v0 dashboard 文件 do-not-touch（本 sprint）

**AC1**：14 个 page.tsx — 不动（除非 A.9 路径修复必要时改路径常量）。
**AC2**：components/* — 不动。
**AC3**：hooks/* — 不动。
**AC4**：48 个 app/api/*/route.ts — **不删不改**（保留，sprint B 删）。
**AC5**：next.config.ts / tsconfig.json — 不改（sprint B 加 @cloudflare/next-on-pages 时改）。
