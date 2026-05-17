# Web Migration A — Design

## 1. 架构影响

| 层 | 变化 |
|---|---|
| services/hub | **不动**（不改任何路由 / 中间件 / schema） |
| services/web | **新建**（cp -r legacy/v0/web + 改 next.config + 替换 app/page.tsx + 14 路径 rename + 10 UI 禁用 + i18n） |
| services/pwa | **不删**（B sprint 删）；只读中文 messages |
| legacy/v0 | 不动 |
| pnpm workspace | +1 包 `@firefly-mesh/web` |

## 2. Next.js rewrites 代理（W2'，核心策略）

### 2.1 为什么选 rewrites 而不是 fetch 绝对 URL

第一版设计选了 "api-client fetch 用绝对 URL prefix" (W2)，但实际跑会撞墙：

| 问题 | 原方案如何处理 | 实际后果 |
|---|---|---|
| 浏览器跨域 `localhost:3000 → localhost:8787` | 设 fetch credentials: 'include' | 触发 CORS preflight，hub 必须放行 PWA_URL=localhost:3000 |
| Better Auth set-cookie SameSite | 默认 SameSite=Lax | **跨域 fetch 不带 cookie** → auth 链路死路 |
| 解决 SameSite | 改 SameSite=None + Secure | localhost 无 https → 浏览器拒绝 Secure cookie → 死路 |
| Access-Control-Allow-Credentials: true | hub CORS 中间件已设 | 需要 origin 精确匹配，不能用 `*` |

rewrites 策略一行不动 hub：
- 浏览器 fetch `/api/*` (same-origin 到 Next.js dev server :3000)
- Next.js server 在 SSR 阶段代理到 hub :8787
- 浏览器 cookie domain = `localhost`，无跨域问题
- hub CORS 一行不动，Better Auth SameSite 一行不动

副作用容易隔离（OAuth callback / SSE 行为）vs 跨域 cookie 噩梦——明显选 rewrites。

### 2.2 next.config.ts rewrites 块

**⚠️ v0 已有 rewrites（H-NEW-1 reviewer fix）**：v0 `next.config.ts` 已有一个 `rewrites()` 函数，定义了 `/.well-known/agent-card.json` → `/api/well-known/agent-card.json`（A2A 协议发现端点）。**必须保留**，不能用新 rewrites 直接替换（否则 agent 找不到 organization card → 404）。

正确做法是**在已有数组里追加** hub proxy 规则：

```typescript
// services/web/next.config.ts
import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

const nextConfig: NextConfig = {
  // ... 已有配置（保留全部，除 transpilePackages 中的 @firefly-mesh/core）...
  async rewrites() {
    return [
      // 保留：A2A 协议发现端点（v0 原有）
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

// next-intl plugin 包装（W5' / A.7）
export default withNextIntl(nextConfig)
```

**Next.js rewrites 优先级（M2 reviewer note）**：rewrites 在 file system 路由**之后**评估。即 `app/api/*/route.ts` 存在时，请求先命中 route.ts（v0 server route → Postgres），rewrites 不触发。**只有 path 没有对应 route.ts 时**（如重命名后的 `/api/employees`），rewrites 才把它代理到 hub。

这是预期行为：sprint A 通过 A.9 把客户端调用从 `/api/employee`（命中 route.ts → Postgres）改为 `/api/employees`（无 route.ts → 走 rewrites → hub）。**rename 是 load-bearing 的，不只是 consistency**。

具体例子：
- `/api/auth/*` → `app/api/auth/[...all]/route.ts` 存在 → Next.js 处理（v0 route 内部 proxy 到 hub Better Auth，所以 sprint A 是双层 proxy，工作但不优雅；sprint B 删 route.ts 后变单层 rewrites）
- `/api/employee/*` → `app/api/employee/route.ts` 存在 → 命中 v0 Postgres（**不该被新代码调用**，A.9 rename 后客户端不再请求此路径）
- `/api/employees/*` → 无 route.ts → 走 rewrites → hub
- `/api/me/*` → `app/api/me/route.ts` 存在 → 命中 v0 Postgres（**已知 sprint A 内仍走 v0 Postgres，sprint B 删 route.ts 后才走 hub**；smoke test 需验证 v0 me route 行为与 hub 一致，或加进 A.9 rename 范围）

⚠️ **/api/me 路径冲突的处理决定**：sprint A 不 rename `/api/me`（hub 和 v0 都用此路径）。v0 route.ts 会先命中，行为可能不一致。**应对**：
- 选项 A（推荐）：A.9 内**删除** v0 `app/api/me/route.ts`（仅此一个 v0 route 删；不算违反 W1 因为是路径冲突解决，不是"全面清理"，记录到 plan 风险）
- 选项 B：把 v0 `/api/me` 重命名为 `/api/v0-me`（强名称，明确无意调用），并改所有客户端不再调
- 选项 C（保留 W1）：smoke test 验证 v0 me 返回兼容 shape，若不兼容再上选项 A

A.9 阶段决定选哪个。

### 2.3 删除 transpilePackages: ["@firefly-mesh/core"]（W8）

如果 v0 next.config 含 `transpilePackages: ["@firefly-mesh/core"]`，sprint A 删除该项。原因：v0 用 `@firefly-mesh/core` 是为了 server routes 直接 `import { db, auth } from "@firefly-mesh/core"`，sprint A 删 transpilePackages 后 Next.js 不再尝试编译这个包，避免触发 Postgres 编译错误。其他 transpilePackages 项（如 shadcn 相关）保留。

### 2.4 不需要改的（关键）

- **api-client.ts 的路径** — 保持相对路径 `/api/...`，rewrites 自动代理
- **api-client.ts 的 base URL** — 不需要 prefix hub URL
- **auth-client.ts 的 baseURL** — 保持 v0 默认（NEXT_PUBLIC_APP_URL = localhost:3000）
- 13 个 page.tsx (除 app/page.tsx) — **零改动**（除 A.9 路径 rename）
- 所有 zod schemas — 零改动

### 2.5 需要改的最小集合

- `app/page.tsx`：RSC → client component (W7 / A.0)
- `next.config.ts`：加 rewrites + 删 transpilePackages 中的 @firefly-mesh/core
- `api-client.ts`：credentials 'include' → 'same-origin'（实际上 v0 原来就是 'same-origin'，所以保持即可；如有 multipart fetch 用了 'include' 则改）
- 14 处路径字符串：单数 → 复数 / 加 -messages 后缀 / 加 /me 等
- 10 处 UI：禁用 banner / 隐藏按钮 / EmptyState
- `app/layout.tsx`：包 NextIntlClientProvider
- `lib/messages/zh.ts`：新增（从 services/pwa 抢救中文翻译）
- `components/language-switcher.tsx`：新增

## 3. app/page.tsx 替换（W7 / C1 fix）

### 3.1 v0 原文件做了什么

```typescript
// legacy/v0/packages/web/app/page.tsx (RSC)
import { auth } from "@firefly-mesh/core/auth"
import { db, employees } from "@firefly-mesh/core/db"
import { redirect } from "next/navigation"

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/login")
  const rows = await db.select().from(employees).where(eq(employees.userId, session.user.id))
  if (rows.length === 0) redirect("/onboarding")
  redirect("/inbox")
}
```

**问题**：sprint A 不能让 Next.js 试图加载 `@firefly-mesh/core/db`（指向 Postgres），否则启动时挂。

### 3.2 替换为客户端 auth gate

详见 plan.md A.0 章节代码。要点：
- `"use client"`
- useEffect + cancelled flag 防 race
- authClient.getSession() 判断登录态
- fetch `/api/me/agents`（走 rewrites）判断 onboarding 状态
- 显示 `<Skeleton />` 占位避免空白闪烁
- router.replace 而非 push（避免 history 污染）

### 3.3 grep 验证

```bash
# 替换后必须零 hit
grep -E "@firefly-mesh/core" services/web/app/page.tsx
# 0
```

如果 grep 在其他 page.tsx / components / lib 也找到 `@firefly-mesh/core`，那是另一个 RSC 调 db 的案例，加进 A.0 替换清单。

## 4. CORS + Cookie（rewrites 后退化为非关键）

### 4.1 rewrites 后的 cookie 流向

```
浏览器 localhost:3000 → POST /api/auth/sign-up/email
  ↓ (same-origin fetch)
Next.js dev server :3000
  ↓ (server-side fetch via rewrites)
hub :8787 /api/auth/sign-up/email
  ↓ Better Auth 处理 → set-cookie firefly_auth=...; Domain=localhost; SameSite=Lax
  ↑ Next.js dev server 转发 set-cookie 头
浏览器收到 set-cookie → 写入 localhost domain
后续请求 /api/me → 浏览器自动带 cookie → rewrites → hub /api/me 200
```

**关键**：cookie 写在浏览器认为是 same-origin 的 localhost:3000 domain，hub 通过 rewrites 看到的请求带的 cookie 是 Next.js dev server 转发的（因为 Next.js 把浏览器 cookie 透传到 hub）。

### 4.2 hub CORS 现状（不改）

```typescript
// services/hub/src/index.ts:20-27 (不改)
app.use("*", (c, next) =>
  cors({
    origin: c.env.PWA_URL,
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })(c, next),
)
```

rewrites 后浏览器不直接调 hub，**hub CORS 中间件甚至不会被浏览器触发**（preflight OPTIONS 是浏览器发的，Next.js server fetch 不触发 preflight）。

### 4.3 .dev.vars PWA_URL（备用）

仍然加 `PWA_URL=http://localhost:3000` 到 services/hub/.dev.vars，原因：
- 防其他来源（curl 测试 / 未来 WS 客户端 / 第三方测试工具）被 CORS 阻拦
- prod 环境 (sprint B) cookieDomain = `.firefly-mesh.com` 时 PWA_URL 也要设

### 4.4 OAuth callback 流程

GitHub / Google OAuth 流程**部分绕开 rewrites**：

```
浏览器 → /api/auth/sign-in/github → rewrites → hub → 302 重定向 → github.com/login/oauth/authorize?redirect_uri=http://localhost:8787/api/auth/callback/github
（注意 redirect_uri 是 hub 直接生成的，不走 next.js）
用户授权 → GitHub 直接跳到 localhost:8787/api/auth/callback/github
hub 处理 callback → set-cookie firefly_auth=...; Domain=localhost → 302 重定向回 /
浏览器收到 cookie 写入 localhost (注意：cookie domain 是 localhost 不带端口)
浏览器跳到 localhost:8787/ → ?? hub 没有前端，可能 404 或重定向回 /api/me
```

**风险**：OAuth callback 设的 cookie domain 是 `localhost`（不区分端口），所以 localhost:3000 也能读到该 cookie。但最后的重定向落到 localhost:8787，需要 hub 重定向到 localhost:3000（v0 dashboard URL）才能让用户回到 web 端。

**A.10 实测验证**：
- 如果 OAuth 流程完成后能回到 localhost:3000 且保持登录 → OK
- 如果回不去（卡在 localhost:8787 404）→ fallback：临时改 GitHub OAuth app 的 redirect_uri 为 `localhost:3000/api/auth/callback/github`，通过 rewrites 转回 hub 处理 callback

记录到 risks 文档。

## 5. workspace 集成

### 5.1 pnpm-workspace.yaml

```yaml
packages:
  - "packages/client"
  - "packages/crypto"
  - "packages/proto"
  - "packages/shared"
  - "services/hub"
  - "services/pwa"
  - "services/web"     # ← 新增
  - "scripts/scene"
```

### 5.2 services/web/package.json

cp 后改 `name`：`@firefly-mesh/web`。版本号 0.1.0。

依赖：保留 legacy 原样（next@16 / better-auth@1.6.9 / drizzle@0.x / shadcn / next-intl 等）。**不引入新 deps**（next-intl 已在 v0 deps，allowed）。如果与 monorepo root 有版本冲突，**保留 services/web 自己的版本**（不向上提升），避免破坏 hub 现有依赖。

### 5.3 .env.local

```bash
# services/web/.env.local (gitignored)
NEXT_PUBLIC_HUB_URL=http://localhost:8787
```

### 5.4 .env.example

```bash
# services/web/.env.example (in git as template)
NEXT_PUBLIC_HUB_URL=http://localhost:8787
# Optional: explicitly set NEXT_PUBLIC_APP_URL if not localhost:3000
# NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 6. i18n（W5' 修订）

### 6.1 不用 services/pwa 的 Zustand store

v0 已含 `next-intl@4.11.0`，已有 `lib/messages/en.ts`。把 pwa 的 Astro 多 island Zustand store cp 过来反而有 SSR hydration mismatch 风险。

### 6.2 next-intl 是从零 bootstrap，不是"集成已有"（M1 reviewer 澄清）

虽然 v0 `package.json` 已含 `next-intl@4.11.0`，但**从未激活**：
- 无 `i18n/request.ts`（next-intl v4 必需的 RSC config 文件）
- 无 middleware.ts（next-intl 路由匹配可选项）
- `app/layout.tsx` 无 NextIntlClientProvider、无 getLocale/getMessages 调用
- `lib/messages/en.ts` 是普通 TS object，13 个 page.tsx 用 `messages.nav.inbox` 直接访问，不通过 `useTranslations()` hook

所以 sprint A 是**从零 bootstrap next-intl**，4 个新增文件：
- `services/web/i18n/request.ts`（getRequestConfig）
- `services/web/lib/messages/zh.ts`（中文 messages，从 pwa 抢救 key-value）
- `services/web/components/language-switcher.tsx`
- next.config.ts 加 `withNextIntl()` 包装

**采用"without i18n routing"模式**：不加 middleware（无 path prefix /zh/*），locale 通过 `NEXT_LOCALE` cookie 持久化。最小集成成本。

**Sprint A 不迁移现有 13 page.tsx 的 `messages.x` 引用**到 `useTranslations()` hook。这些 page.tsx 继续用普通 TS object 访问（messages.en.ts 仍是 plain object，只是文件内容也作为 zh.ts 的 fallback）。LanguageSwitcher 只是切换 next-intl 的 provider locale，已有页面看到的 messages 不变（V0.2 sprint 再迁移到 useTranslations）。

### 6.3 i18n/request.ts

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

### 6.4 app/layout.tsx

```typescript
// services/web/app/layout.tsx (修改)
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages } from "next-intl/server"

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
```

### 6.5 中文 messages 抢救

```typescript
// services/web/lib/messages/zh.ts (新增)
// 从 services/pwa/src/i18n/zh.ts 抢救 key-value，整理成 next-intl 兼容格式
const zh = {
  common: {
    login: "登录",
    signup: "注册",
    // ... 全部 key 来自 pwa zh.ts ...
  },
  // ... domain-grouped namespaces ...
}
export default zh
```

### 6.6 LanguageSwitcher

```typescript
// services/web/components/language-switcher.tsx (新增 <50 行)
"use client"
import { useLocale } from "next-intl"
import { useRouter, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"

export function LanguageSwitcher() {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const toggle = () => {
    const next = locale === "zh" ? "en" : "zh"
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000`
    router.refresh()
  }
  return (
    <Button variant="ghost" size="sm" onClick={toggle}>
      {locale === "zh" ? "EN" : "中"}
    </Button>
  )
}
```

集成进 dashboard 顶部 nav（settings menu 旁）。

### 6.7 服务端国际化进阶（V1.1）

本 sprint 完成"客户端切换 + cookie 持久化 + provider 接入"即可。其他高级特性（路径前缀 /zh/*、中间件路由匹配、13 page.tsx 迁移到 useTranslations）推 V0.2 / V1.1。

## 7. 不动 hub（铁律）

本 sprint 100% 不改 hub 任何文件。如果发现 hub 端 cookie / CORS / 字段需要调整，**记录到 risks 文档**，留 sprint B 改。rewrites 策略让"hub 不动"真正可达。

## 8. 决策记录（v2 修订）

| ID | 主题 | 选 | 弃 | 原因 |
|---|---|---|---|---|
| W1 | 不删 v0 server route | yes | 立即删 | sprint A 只对接 hub；删 routes 留 B |
| **W2'** | **Next.js rewrites 代理** | **yes** | **fetch 绝对 URL prefix** | **跨域 cookie 噩梦实证不可行（C4 + H4 reviewer fix）** |
| W3 | 保留 v0 next@16 + monorepo 独立 deps | yes | 强制升级到统一版本 | 范围控制；升级 next 是独立 sprint |
| W4 | dev 时改 hub .dev.vars 而不是 hub 代码 | yes | 改 hub CORS 代码 | 不动 hub 铁律 |
| **W5'** | **i18n 用 v0 已有 next-intl** | **yes** | **cp pwa 的 Zustand store** | **SSR hydration mismatch + 已有 dep 不重复（H2 reviewer fix）** |
| W6 | better-auth cookieDomain 配置推 sprint B | yes | 现在配 | 跨子域只在 prod 部署后才用到 |
| **W7** | **app/page.tsx 替换为客户端 gate** | **yes** | **保留 RSC 调 db** | **v0 原文件直接 import @firefly-mesh/core/db（C1 reviewer fix）** |
| **W8** | **删 next.config transpilePackages 中的 @firefly-mesh/core** | **yes** | **保留** | **避免 Next.js 试图编译 Postgres 代码（H3 reviewer fix）** |
| **W9** | **缺失端点对应 UI 必须禁用 + banner** | **yes** | **silent fail** | **诚实优于偷懒；用户看到 banner 比看到 404 更好（H1 reviewer fix）** |

## 9. 已知遗留 + sprint B 提醒

### 9.1 sprint A 完成后 services/web 状态

- 13 个非 page.tsx 通过 api() + rewrites 调 hub /api/* — **能跑**
- app/page.tsx 客户端 gate — **能跑**
- 10 个 UI 禁用 banner — **诚实告知用户**
- app/api/* 下 48 个 route.ts — **存在但不被调用**（死代码，sprint B 删）
- next.config.ts 含 rewrites + 删了 transpilePackages 中的 @firefly-mesh/core，其他配置 v0 原样
- 数据库不再用（v0 Drizzle Postgres 配置文件 drizzle.config.ts 等仍在），sprint B 删
- @firefly-mesh/core 依赖 — sprint A 不卸（被 v0 server route 引用，sprint B 删）
- audit / knowledge live 实时更新失效（SSE silent fail），sprint B 改 WS
- multipart upload + 员工 CSV 导入 disabled，sprint B / V1.1 加 hub 端点

### 9.2 sprint B 任务（不在本 sprint）

- 删 45 个 server route，留 3 个（auth/[...all] + health + well-known/agent-card.json）
- 加 @cloudflare/next-on-pages
- next.config 改 edge runtime
- 部署 Cloudflare Pages → app.firefly-mesh.com
- hub `.dev.vars` 改 `PWA_URL=https://app.firefly-mesh.com`（prod）
- hub Better Auth 加 `cookieDomain: .firefly-mesh.com`
- 删 services/pwa
- SSE → WS：audit + knowledge live 实时更新改用 hub /ws WebSocket
- hub 加 multipart upload / bulk import / audit-read / org/graph 聚合端点（按优先级排）
- 端到端 QA 对真实生产 hub

## 10. 测试策略

### 10.1 sprint A 不加自动化测试

theme：本 sprint 是**集成**工作（不写新业务逻辑）。改动集中在：
- 1 个文件重写（app/page.tsx）
- 1 个文件加 rewrites（next.config.ts）
- 14 处路径字符串替换
- 10 处 UI 禁用
- i18n 3 个文件

做完后**手动 smoke test** 验证 happy path（注册 + 登录 + 看 dashboard + i18n 切换 + OAuth 流程）即可。Grep 验证 + 浏览器 console 无 error 是关键质量门。

### 10.2 sprint B 起加 E2E

playwright e2e 测全用户旅程 — 在 sprint B 部署完后做。

### 10.3 hub e2e 回归保护

sprint A 期间 hub 一行不动，所以 6 个 hub e2e 应全部不回归。每个 commit 后**必跑**：

```bash
pnpm --filter @firefly-mesh/hub test
```

如果 hub e2e 失败 → 检查是不是误改了 hub 文件（违反 Z1）。
