# Web Migration A — Plan

## 0. 范围

把 legacy/v0/web 复制到 services/web，**用 Next.js rewrites 代理 /api/* 到 hub**（W2'），**替换 RSC 入口 app/page.tsx**（W7），**14 路径 rename + 10 UI 禁用**（H1 fix），i18n 用 v0 已有的 next-intl（W5'），本地能跑通 happy path。**不做**：删 server route / 部署 / 删 pwa / 端到端 QA。

## 1. 任务清单（严格顺序，每步可独立 commit）

### Task A.0 — 替换 app/page.tsx（W7，新增）

**status**: pending
**files modified**: services/web/app/page.tsx（先做 A.1 cp 之后才能改）

**实际执行顺序**：A.0 在 A.1 之后执行（先 cp 才能改）。task 编号 A.0 是表示**逻辑优先级**（这是其他 task 的前置 fix，做完 A.1 立刻做 A.0，再做后面）。

**目标**：v0 原 `app/page.tsx` 是 Server Component，`import { auth } from "@firefly-mesh/core/auth"` + `import { db, employees } from "@firefly-mesh/core/db"`。sprint A 必须替换为 client component，用 authClient + fetch /api/me/agents（走 rewrites）判断重定向。

**新文件内容**：

```typescript
// services/web/app/page.tsx
"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { Skeleton } from "@/components/ui/skeleton"

export default function RootPage() {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: session } = await authClient.getSession()
        if (cancelled) return
        if (!session?.user) {
          router.replace("/login")
          return
        }
        // hub /api/me/agents → 决定 /onboarding vs /inbox
        const res = await fetch("/api/me/agents", { credentials: "same-origin" })
        if (cancelled) return
        if (!res.ok) {
          router.replace("/onboarding")
          return
        }
        const { data } = await res.json()
        router.replace(data?.length ? "/inbox" : "/onboarding")
      } catch (err) {
        if (!cancelled) {
          console.error("[root-gate]", err)
          router.replace("/login")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [router])

  // Skeleton renders while mounted. Component unmounts when router.replace
  // navigates away. No "loaded but no redirect" branch exists, so no need
  // for a loading flag.
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  )
}
```

**acceptance**:
- [ ] services/web/app/page.tsx 是 "use client" 组件
- [ ] 不 import `@firefly-mesh/core/auth` 或 `@firefly-mesh/core/db`
- [ ] grep `@firefly-mesh/core` services/web/app/page.tsx 必须**零 hit**（AD3）
- [ ] useEffect 有 cancelled flag 避免 race condition
- [ ] 显示骨架屏期间不闪空白
- [ ] router.replace 而非 push，避免 history 污染
- [ ] **不**使用 `useState(loading)` + `if (!loading) return null` 这种死代码模式（setLoading 永不调用 → dead branch；H-NEW-2 reviewer fix）
- [ ] grep `services/web/app/` + `services/web/components/` + `services/web/lib/` 找其他 RSC 调 db 案例，全部列出。如有 → 加进 A.0 替换清单

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

### Task A.3 — 解决 deps 冲突 + 删 transpilePackages（W8 修订）

**status**: pending
**files modified**: services/web/package.json, services/web/next.config.ts (部分)

**acceptance**:
- [ ] `pnpm install` 无 ERROR（warning 可接受）
- [ ] services/web 的 next / better-auth / drizzle / shadcn 版本独立，不污染其他包
- [ ] 如果有 peerDep conflict，记录到 sprint A risks 文档 + 选最稳妥处理
- [ ] **next.config.ts 中 `transpilePackages` 删除 `@firefly-mesh/core` 项**（如有；其他项保留）。Reason：避免 Next.js 试图编译 Postgres 代码

**验证**：
```bash
grep '@firefly-mesh/core' services/web/next.config.ts
# 应该零 hit
```

### Task A.4 — next.config.ts 加 rewrites（W2'，替换原 A.4）

**status**: pending
**files modified**: services/web/next.config.ts

**目标**：浏览器始终 fetch `/api/*` (same-origin)，Next.js server 在 SSR 阶段代理到 hub。

**⚠️ 关键（H-NEW-1 reviewer fix）**：v0 `next.config.ts` 已有一个 `rewrites()` 函数，里面定义了 `/.well-known/agent-card.json` → `/api/well-known/agent-card.json` 规则（A2A 协议发现端点）。**必须保留**，不能直接替换为只含 hub proxy 的 rewrites（否则 A2A agent 找不到 organization card → 404）。

**Next.js rewrites 优先级（M2 reviewer note）**：rewrites 在 file system 路由**之后**评估。即 `app/api/*/route.ts` 存在时，请求会先命中 route.ts（v0 server route → Postgres），rewrites 不触发。**只有 path 没有对应 route.ts 时**（如重命名后的 `/api/employees`），rewrites 才把它代理到 hub。这是预期行为：sprint A 通过 A.9 把客户端调用从 `/api/employee`（命中 route.ts → Postgres）改为 `/api/employees`（无 route.ts → 走 rewrites → hub）。

**新增代码**：

```typescript
// services/web/next.config.ts
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // ... 已有配置（保留全部，除 transpilePackages 中的 @firefly-mesh/core）...
  async rewrites() {
    return [
      // 保留：A2A 协议发现端点（v0 原有 rule）
      {
        source: "/.well-known/agent-card.json",
        destination: "/api/well-known/agent-card.json",
      },
      // 新增：hub API proxy（W2'）
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_HUB_URL ?? "http://localhost:8787"}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
```

**acceptance**:
- [ ] next.config.ts 含 rewrites 函数
- [ ] **rewrites 数组含 2 条规则**：well-known + hub proxy（H-NEW-1）
- [ ] destination 用 `process.env.NEXT_PUBLIC_HUB_URL`，fallback `http://localhost:8787`
- [ ] **不**改 api-client.ts 的路径（A.5 单独处理 credentials）
- [ ] typescript 编译过
- [ ] 启动 dev 后 `curl localhost:3000/api/health` → 200（rewrites 代理到 hub）
- [ ] **curl localhost:3000/.well-known/agent-card.json** → 200（well-known 规则未被破坏）

### Task A.5 — api-client.ts credentials 调整

**status**: pending
**files modified**: services/web/lib/api-client.ts, services/web/components/knowledge/upload-dialog.tsx, services/web/app/onboarding/import/page.tsx

**目标**：rewrites 后是 same-origin，credentials 用 `'same-origin'`（默认）。不要再用 `'include'`（那是为跨域设的）。

**acceptance**:
- [ ] `lib/api-client.ts::api()` 内的 init.credentials 改为 `'same-origin'`（或删掉，让默认生效）
- [ ] **路径保持相对**（不 prefix hub URL）
- [ ] 3 处直接 fetch（upload-dialog 2 处 + onboarding/import 1 处）的 credentials 统一改 `'same-origin'`
- [ ] grep `credentials.*include` services/web/ 应零 hit（除 node_modules）
- [ ] typescript 编译过

### Task A.6 — auth-client.ts 保持默认（W2' 简化）

**status**: pending
**files modified**: services/web/lib/auth-client.ts（可能零改动）

**目标**：rewrites 后 Better Auth 也通过相对路径 `/api/auth/*` 访问 hub。baseURL **保持 v0 默认**（指向 NEXT_PUBLIC_APP_URL = localhost:3000）。

**acceptance**:
- [ ] authClient baseURL **保留**为 `process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"`（不要改成 HUB_URL）
- [ ] 保留 organizationClient plugin
- [ ] typescript 编译过

### Task A.7 — i18n: next-intl 从零接入 + 中文 messages（W5' 修订）

**status**: pending
**files created**: services/web/i18n/request.ts, services/web/lib/messages/zh.ts, services/web/components/language-switcher.tsx
**files modified**: services/web/app/layout.tsx（包 NextIntlClientProvider）

**⚠️ 关键（M1 reviewer 澄清）**：v0 `package.json` 已有 `next-intl@4.11.0`，但**从未激活**——`lib/messages/en.ts` 只是个普通 TS object，没有 `i18n/request.ts`，没有 middleware，layout.tsx 没有 NextIntlClientProvider。所以 sprint A 是**从零 bootstrap next-intl**，不是"集成已有"。

**关键决策**：采用 next-intl **"without i18n routing"** 模式（不加 middleware，不加 path prefix /zh/*）。Locale 通过 `NEXT_LOCALE` cookie 持久化。这是最小集成成本路径。

**步骤**：
1. **创建 `services/web/i18n/request.ts`**（next-intl v4 必需）：
   ```typescript
   // services/web/i18n/request.ts
   import { getRequestConfig } from "next-intl/server"
   import { cookies } from "next/headers"

   export default getRequestConfig(async () => {
     const cookieStore = await cookies()
     const locale = cookieStore.get("NEXT_LOCALE")?.value ?? "en"
     const valid = ["en", "zh"].includes(locale) ? locale : "en"
     const messages = (await import(`@/lib/messages/${valid}.ts`)).default
     return { locale: valid, messages }
   })
   ```

2. **next.config.ts 加 next-intl plugin**（与 W2' rewrites 共存）：
   ```typescript
   import createNextIntlPlugin from "next-intl/plugin"
   const withNextIntl = createNextIntlPlugin("./i18n/request.ts")
   // ... NextConfig 定义 ...
   export default withNextIntl(nextConfig)
   ```

3. **cp services/pwa 的中文翻译 key-value**（不 cp Zustand store）：整理成 next-intl 兼容的 nested object，与 v0 现有 `lib/messages/en.ts` 的 key 100% 对齐。写到 `services/web/lib/messages/zh.ts`。

4. **写 LanguageSwitcher**（client component < 50 行）：通过 `document.cookie` 设 NEXT_LOCALE + `router.refresh()` 触发 next-intl 重读。

5. **修改 `app/layout.tsx`**：用 RSC functions `getLocale()` + `getMessages()`，包 NextIntlClientProvider。

6. **不迁移现有 13 page.tsx 的硬编码 messages.x 引用**：v0 现有页面用 `messages.nav.inbox` 这种直接对象访问，sprint A **不**改为 `useTranslations()` hook。只加 provider + LanguageSwitcher 工作即可。改 13 个 page.tsx 是 V0.2 i18n migration sprint 的范围。

**acceptance**:
- [ ] services/web/i18n/request.ts 存在，getRequestConfig 从 NEXT_LOCALE cookie 读 locale
- [ ] services/web/lib/messages/zh.ts 存在，与 en.ts 的 key 100% 对齐
- [ ] next.config.ts 用 `createNextIntlPlugin('./i18n/request.ts')(nextConfig)` 包装 export
- [ ] LanguageSwitcher 是 client component < 50 行
- [ ] app/layout.tsx 包 NextIntlClientProvider
- [ ] 中英切换工作（LanguageSwitcher 点击 → cookie 写入 → router.refresh → 看到 next-intl 加载新 messages）
- [ ] 现有 13 page.tsx 的 `messages.x` 硬编码引用**不动**（V0.2 sprint 再迁移）
- [ ] **不**加 middleware.ts（without-i18n-routing 模式）
- [ ] **不**引入新 dep（next-intl 已在 v0 deps）

### Task A.8 — 环境变量配置

**status**: pending
**files created**: services/web/.env.local, services/web/.env.example
**files modified**: services/hub/.dev.vars（dev only）

**acceptance**:
- [ ] services/web/.env.local 含 `NEXT_PUBLIC_HUB_URL=http://localhost:8787`
- [ ] services/web/.env.example 模板提交 git
- [ ] services/hub/.dev.vars 添加（如无）`PWA_URL=http://localhost:3000` （CORS 备用，rewrites 后浏览器其实不再跨域调 hub，但 curl / 未来 WS 客户端可能需要）
- [ ] services/web/.env.local **不**进 git（在 gitignore）

### Task A.9 — 14 路径 rename + 10 UI 禁用（H1 fix，大幅扩展）

**status**: pending
**files modified**: services/web/app/, services/web/components/, services/web/lib/ 多个文件

**目标**：按 api.md §2 完整 diff 表执行：
- 14 个路径 rename（grep + 批量替换 + 验证）
- 10 个 missing UI 禁用 banner（AE1）

#### A.9.1 路径 rename（grep + sed 风格批量替换）

| 替换 | 命令示例 |
|---|---|
| /api/employee → /api/employees | grep -l '/api/employee\b' + 逐文件改（避开 /api/employees 已是新路径）|
| /api/department → /api/departments | 同上 |
| /api/skill → /api/skills | 同上 |
| /api/task → /api/tasks | 同上 |
| /api/a2a/inbox → /api/a2a-messages/inbox | 同上 |
| /api/a2a/{id}/* → /api/a2a-messages/{id}/* | 同上 |
| /api/org → /api/organizations/me | 同上 |
| /api/token → /api/agent-tokens | 同上 |
| /api/token/{id}/regenerate → /api/agent-tokens/{id}/regenerate | 同上 |
| /api/boundary → /api/boundaries | 同上 |

**rename 完成后强制验证**：

```bash
grep -rE "/api/(employee|department|skill|task|org|token|boundary|a2a)([/?'\"]|$)" \
  services/web/ --include="*.ts" --include="*.tsx" \
  | grep -vE "/api/(employees|departments|skills|tasks|organizations|agent-tokens|boundaries|a2a-messages)"
# 应该零 hit
```

#### A.9.2 UI 禁用 banner（按 AE1 表）

| 页面 | 禁用方式 |
|---|---|
| /onboarding/import | 顶部 Alert "员工批量导入将在 sprint B 上线，请使用 API 单条添加" |
| /(dashboard)/knowledge upload-dialog | 改 multipart upload 为 inline 文本框（hub /api/knowledge POST 接 JSON）|
| /(dashboard)/skills dry-run 按钮 | disabled=true + tooltip "Skill 执行引擎 V2" |
| /(dashboard)/skills loaded tab | 隐藏 tab |
| /(dashboard)/audit | EmptyState "审计读取端待 audit-read sprint" |
| /(dashboard)/audit SSE Live | try/catch + console.warn + 静态文案 |
| /(dashboard)/knowledge SSE indexing | 同上 |

#### A.9.3 客户端聚合替代缺失 endpoint

| 缺失 endpoint | 替代 |
|---|---|
| /api/onboarding/state | useEffect 并发 3 endpoint + 推导 step（详见 A.9.3.1 推导规则）|
| /api/org/graph | useEffect 并发 /api/employees + /api/departments + /api/projects，前端组装 graph 数据 |
| /api/token/batch | for-loop N 次 /api/agent-tokens POST |

##### A.9.3.1 onboarding state 推导规则（M3 reviewer fix）

v0 `app/onboarding/page.tsx` 期望返回 `{ step: "create-org" | "import" | "tokens" | "done", completed: boolean, orgId?: string }`。hub 无聚合 endpoint，需在客户端推导。**推导规则必须严格按下表**（不能临场发挥），否则 onboarding 流程乱跳：

| 条件 | step |
|---|---|
| `GET /api/me` 401 | 不应到达此页（root gate 已拦截到 /login）|
| `GET /api/organizations/me` 返回 404 or null | `step = "create-org"` |
| `GET /api/organizations/me` 200 + `GET /api/employees` 返回 0 条 | `step = "import"` |
| `GET /api/employees` 返回 ≥1 条 + `GET /api/me/agents` 返回 0 条 | `step = "tokens"` |
| `GET /api/me/agents` 返回 ≥1 条 | `step = "done"` |

实施时把推导逻辑封装成 `lib/onboarding.ts::deriveOnboardingStep()` helper，让 page.tsx 调用结果跟原 `/api/onboarding/state` shape 兼容。这样 v0 page.tsx 主体逻辑（`state.data.step === "done" ? "/inbox" : ...`）不需要改。

**acceptance**:
- [ ] A.9.1 grep 验证零 hit
- [ ] A.9.2 所有 10 个禁用点正确显示
- [ ] A.9.3 客户端聚合工作（手动验证页面渲染）
- [ ] 浏览器 console 无 unhandled error
- [ ] 列一份 "调到 hub 但行为不一致 (RBAC / response shape mismatch)" 清单 → 转 sprint B

### Task A.10 — 本地 dev 跑通

**status**: pending

**acceptance**:
- [ ] 终端 1：`pnpm --filter @firefly-mesh/hub dev` 启动 port 8787
- [ ] 终端 2：`pnpm --filter @firefly-mesh/web dev` 启动 port 3000
- [ ] 浏览器 http://localhost:3000 → app/page.tsx gate 工作（未登录 → /login）
- [ ] /signup → 注册成功，cookie 设进浏览器（localhost domain）
- [ ] /api/me 走 rewrites 到 hub，返回 200 + employee 数据
- [ ] /onboarding/create-org → 完成（路径 rename 已修）
- [ ] /(dashboard)/inbox → 看到 A2A 收件箱（即使空）
- [ ] /(dashboard)/organization → 看到员工/部门/项目（客户端聚合）
- [ ] /(dashboard)/audit → 看到 "Coming soon"
- [ ] /(dashboard)/knowledge → 看到 inline 文本输入
- [ ] /(dashboard)/skills → dry-run 按钮 disabled
- [ ] /onboarding/import → 看到禁用 banner
- [ ] 中英切换工作
- [ ] **GitHub OAuth 流程**：/api/auth/sign-in/github → 跳转 GitHub → 授权 → 回到 dashboard 保持登录（如失败 → 加进 risks 文档）
- [ ] 浏览器 console 无 unhandled error
- [ ] 列一份残留小 bug 清单 → 转 sprint A.9 二轮或 sprint B

### Task A.11 — 文档同步 + commits

**status**: pending

**acceptance**:
- [ ] state.yaml 加 sub_sprint_web_migration_a 记录
- [ ] PROGRESS.md 更新 sprint A 状态
- [ ] 本 plan.md 所有 task 状态 → completed
- [ ] 4-6 atomic commits（A.0-A.11 可合并部分小 task）

---

## 2. 完成判定

1. 11 task acceptance 100%
2. hub 后端没有任何修改（`git diff services/hub` 是空的；只有 .dev.vars 不在 git 里所以也是空）
3. 浏览器手动 smoke test 注册 → 登录 → 看到 dashboard
4. 14 路径 rename grep 验证零 hit
5. 10 个 UI 禁用 banner 全部显示
6. 6 个 e2e（hub）全部不回归

## 3. 降阶信号词扫描

- 0 "for now" / "暂时"（"sprint B" / "V1.1" 作为明确推迟 ✓ 允许）
- 0 TODO 占位
- 0 silent fail（缺失 endpoint 必须有 banner 或 console.warn）

## 4. 风险（v2 修订）

| 风险 | 缓解 |
|---|---|
| v0 next@16 在新 monorepo 装不上 | services/web 单独装；不向上提升 |
| ~~CORS preflight 失败~~ | ~~过期（rewrites 后 same-origin）~~ |
| ~~Better Auth cookie 不带上~~ | ~~过期（rewrites 后 same-origin cookie）~~ |
| /api/* 路径 rename 漏改一处 → 404 | A.9 强制 grep 验证零 hit |
| /audit GET 端 hub 未实现 → 404 | A.9 AE1 EmptyState |
| Push 通知客户端代码 import 不上 | sprint A 不接 push，相关代码注释或抛 NotImplementedError |
| app/page.tsx 客户端 gate hydration 闪烁 | 用 `<Skeleton />` 占位 + router.replace 避免 history 污染 |
| GitHub OAuth callback 跳回 localhost:8787 后 cookie 在 localhost:3000 读不到 | fallback：在 GitHub OAuth app 临时改 redirect_uri 为 localhost:3000；记录到 risks |
| 删 transpilePackages 后某 component 编译失败 | 那是个新的 RSC 调 db 案例 → 加进 A.0 替换清单 |
| SSE EventSource 通过 rewrites 长连接行为不确定 | A.10 实测：失败 → console.warn + silent fail，sprint B 改 WS |
| 客户端聚合 /api/org/graph + /api/onboarding/state 性能差 | 接受（V1 用户少）；sprint B 视需在 hub 加聚合 endpoint |
| 14 路径 rename 漏改 hooks/* | A.9 grep 范围覆盖 services/web/ 全部 .ts / .tsx |

## 5. Task 状态汇总

| Task | Status |
|---|---|
| A.0 替换 app/page.tsx | pending |
| A.1 拷贝代码 | pending |
| A.2 workspace 集成 | pending |
| A.3 deps 冲突 + 删 transpilePackages | pending |
| A.4 next.config rewrites | pending |
| A.5 api-client credentials | pending |
| A.6 auth-client 保持默认 | pending |
| A.7 i18n: next-intl + 中文 messages | pending |
| A.8 env 配置 | pending |
| A.9 14 路径 rename + 10 UI 禁用 | pending |
| A.10 dev 跑通 + OAuth 验证 | pending |
| A.11 文档同步 | pending |
