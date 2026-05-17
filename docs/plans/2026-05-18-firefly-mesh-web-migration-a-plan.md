# Web Migration A — Plan

## 0. 范围

把 legacy/v0/web 复制到 services/web，改 fetch 和 auth 的 base URL，本地能跑通 happy path。**不做**：删 server route / 部署 / 删 pwa / 端到端 QA。

## 1. 任务清单（严格顺序，每步可独立 commit）

### Task A.1 — 拷贝代码

**status**: pending
**type**: file operation

**acceptance**:
- [ ] `cp -r legacy/v0/packages/web/* services/web/` （legacy 原文件保留）
- [ ] services/web/ 下含 app/ components/ lib/ public/ package.json next.config.ts tsconfig.json
- [ ] services/web/.next/ + node_modules/ 不进 git（gitignore 已含）

### Task A.2 — package.json + workspace

**status**: pending
**files modified**: services/web/package.json, pnpm-workspace.yaml

**acceptance**:
- [ ] services/web/package.json 的 `name` 改 `@firefly-mesh/web`
- [ ] services/web/package.json 的 `version` 设 `0.1.0`
- [ ] pnpm-workspace.yaml 加 `- "services/web"`
- [ ] `pnpm install` 在 monorepo root 跑成功（接受版本警告，但必须有 lockfile）

### Task A.3 — 解决 deps 冲突

**status**: pending
**files modified**: services/web/package.json (potentially)

**acceptance**:
- [ ] `pnpm install` 无 ERROR（warning 可接受）
- [ ] services/web 的 next / better-auth / drizzle / shadcn 版本独立，不污染其他包
- [ ] 如果有 peerDep conflict，记录到 sprint A risks 文档 + 选最稳妥处理

### Task A.4 — api-client.ts 重定向

**status**: pending
**files modified**: services/web/lib/api-client.ts

**acceptance**:
- [ ] api() 函数读 `process.env.NEXT_PUBLIC_HUB_URL`
- [ ] credentials 从 'same-origin' 改 'include'
- [ ] fetch URL prefix 加 hub URL
- [ ] typescript 编译过

### Task A.5 — auth-client.ts 重定向

**status**: pending
**files modified**: services/web/lib/auth-client.ts

**acceptance**:
- [ ] authClient baseURL 改成 `process.env.NEXT_PUBLIC_HUB_URL`
- [ ] 保留 organizationClient plugin
- [ ] typescript 编译过

### Task A.6 — i18n 抢救

**status**: pending
**files created**: services/web/lib/i18n/{en,zh,messages,store,LanguageSwitcher}.{ts,tsx}

**acceptance**:
- [ ] cp services/pwa/src/i18n/* services/web/lib/i18n/
- [ ] 修复 import 路径（lib/cn 等可能需要重新映射）
- [ ] LanguageSwitcher 在 dashboard root layout 接入
- [ ] 中英切换工作

### Task A.7 — 环境变量配置

**status**: pending
**files created**: services/web/.env.local, services/web/.env.example

**acceptance**:
- [ ] .env.local 含 `NEXT_PUBLIC_HUB_URL=http://localhost:8787`
- [ ] .env.example 模板提交 git
- [ ] services/hub/.dev.vars 临时改 `PWA_URL=http://localhost:3000` (dev only)

### Task A.8 — 本地 dev 跑通

**status**: pending

**acceptance**:
- [ ] 终端 1：`pnpm --filter @firefly-mesh/hub dev` 启动 port 8787
- [ ] 终端 2：`pnpm --filter @firefly-mesh/web dev` 启动 port 3000
- [ ] 浏览器 http://localhost:3000 → 看到 landing
- [ ] /signup → 注册成功，cookie 设进浏览器
- [ ] /onboarding → 完成 create-org（即使 v0 onboarding 流程跟 hub 新 employees endpoint 路径不一致，也至少 page 渲染）
- [ ] 列一份 "404 路径清单" → 转 sprint A.5 case-by-case 修

### Task A.9 — 路径 case-by-case 修复（sprint A 内）

**status**: pending
**files modified**: services/web/ 多个文件

**acceptance**:
- [ ] 把 A.8 列出的 404 路径在 page.tsx / hooks 里改成 hub 真实路径（如 /api/employee → /api/employees）
- [ ] 重跑 A.8 happy path，全部页面无 404
- [ ] 列一份 "调到 hub 但行为不一致 (RBAC / response shape mismatch)" 清单 → 转 sprint B

### Task A.10 — 文档同步 + commits

**status**: pending

**acceptance**:
- [ ] state.yaml 加 sub_sprint_web_migration_a 记录
- [ ] 本 plan.md 所有 task 状态 → completed
- [ ] 4-6 atomic commits

---

## 2. 完成判定

1. 9 task acceptance 100%
2. hub 后端没有任何修改（git diff services/hub 是空的）
3. 浏览器手动 smoke test 注册 → 登录 → 看到 dashboard
4. 6 个 e2e（hub）全部不回归

## 3. 降阶信号词扫描

- 0 "for now" / "暂时"
- 0 TODO 占位
- "sprint B"、"V1.1" 作为明确推迟 ✓ 允许

## 4. 风险

| 风险 | 缓解 |
|---|---|
| v0 next@16 在新 monorepo 装不上 | services/web 单独装；不向上提升 |
| CORS preflight 失败 | hub .dev.vars 设 PWA_URL=localhost:3000，重启 wrangler dev |
| Better Auth cookie 不带上 | 用浏览器 devtools network 看 Cookie header；如缺失改 cookie SameSite |
| /api/* 路径名不一致 → 大量 404 | 这是预期，A.9 case-by-case 解决 |
| /audit GET 端 hub 未实现 → 404 | 已知（M12 不做读端），audit 页面留空状态，sprint B 或 audit-read sprint 实现 |
| Push 通知客户端代码 import 不上 | sprint A 不接 push，相关代码注释或抛 NotImplementedError |

## 5. Task 状态汇总

| Task | Status |
|---|---|
| A.1 拷贝代码 | pending |
| A.2 workspace 集成 | pending |
| A.3 deps 冲突 | pending |
| A.4 api-client 改 | pending |
| A.5 auth-client 改 | pending |
| A.6 i18n 抢救 | pending |
| A.7 env 配置 | pending |
| A.8 dev 跑通 | pending |
| A.9 路径 case-by-case | pending |
| A.10 文档同步 | pending |
