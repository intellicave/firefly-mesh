# Migration 02 — 改写数据访问层走 Hub

> v0 当年自带 48 个 `app/api/*/route.ts` server route。Edge 化后这些 route 全部删,所有数据走 hub.firefly-mesh.com。

预计耗时:**1-2 天**。

---

## 1. 前置条件

- [x] migration 01 完成,`services/dashboard/` 已就位
- [ ] 阅读 [`../ARCHITECTURE.md`](../ARCHITECTURE.md) §D2(为什么不在 dashboard 留 server route)
- [ ] 阅读 [`../reference/auth-cookie.md`](../reference/auth-cookie.md)(跨域 cookie 细节)

---

## 2. 删除 server route

```bash
rm -rf services/dashboard/app/api
```

(48 个 route 文件全删。如果有怀疑漏掉的逻辑,先 grep:`grep -r 'app/api' services/dashboard/`,确认外部对这些 route 无引用。)

---

## 3. 新建 hub fetch helper

`services/dashboard/lib/hub.ts`:

```ts
const HUB_URL = process.env.NEXT_PUBLIC_HUB_URL!

export class HubError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message)
  }
}

export async function hubFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${HUB_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`
      throw new HubError('unauthorized', 401, 'unauthorized')
    }
    const body = await res.json().catch(() => ({}))
    throw new HubError(
      body?.error?.message ?? res.statusText,
      res.status,
      body?.error?.code,
    )
  }
  return res.json()
}
```

---

## 4. 新建 auth client

`services/dashboard/lib/auth-client.ts`:

```ts
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  baseURL: `${process.env.NEXT_PUBLIC_HUB_URL}/api/auth`,
})

export const { signIn, signUp, signOut, useSession } = authClient
```

---

## 5. 改 fetch 调用 (按 feature 批改)

策略:每个 feature 一个 commit。先简单功能(auth / inbox),再复杂(organization / knowledge)。

### Feature 07 (Auth) — 改 `app/login` 和 `app/signup`

v0 代码常见模式:
```tsx
const res = await fetch('/api/auth/login', { method: 'POST', body: JSON.stringify(...) })
```

改成:
```tsx
const res = await signIn.email({ email, password })
// 或:
await fetch(`${HUB_URL}/api/auth/...`, { credentials: 'include', ... })
```

OAuth callbackURL 必须**绝对 URL**:
```tsx
await signIn.social({
  provider: 'google',
  callbackURL: `${window.location.origin}/onboarding`,
})
```

### Feature 01 (Inbox) — 改 `app/(dashboard)/inbox/*`

所有 `/api/messages`、`/api/inbox` → `hubFetch('/api/inbox')` 等。

新增 WS hook `lib/use-inbox-ws.ts`:
```ts
'use client'
import { useEffect, useState } from 'react'

export function useInboxWS(tenantId: string, onEvent: (e: any) => void) {
  const [status, setStatus] = useState<'connecting'|'live'|'offline'>('connecting')
  useEffect(() => {
    let retries = 0
    let ws: WebSocket | null = null
    let cancelled = false

    function connect() {
      ws = new WebSocket(`${process.env.NEXT_PUBLIC_HUB_URL!.replace('https://','wss://')}/ws`)
      ws.onopen = () => {
        retries = 0
        setStatus('live')
        ws?.send(JSON.stringify({ type: 'subscribe', topic: 'tenant', id: tenantId }))
      }
      ws.onmessage = (m) => {
        try { onEvent(JSON.parse(m.data)) } catch {}
      }
      ws.onclose = () => {
        if (cancelled) return
        setStatus('offline')
        const delay = Math.min(30000, 1000 * Math.pow(2, retries++))
        setTimeout(connect, delay)
      }
      ws.onerror = () => ws?.close()
    }
    connect()
    return () => { cancelled = true; ws?.close() }
  }, [tenantId, onEvent])

  return status
}
```

### Feature 02 (Devices / Connect)

参考 PWA 现有 `DevicesPage.tsx` 和 `ConnectPage.tsx`,换成 Next.js 客户端组件,改 `fetch` 走 `hubFetch`。

### Feature 03/04/05/06 (Org / Knowledge / Skills / Audit)

V1 的 hub 端点大多数还没实现(详见 [`../reference/api-needed.md`](../reference/api-needed.md))。本 migration 02 阶段先把 fetch URL 写好(指向 P0 端点),hub 实现是 migration 03 的事。

为了让 dashboard 在 hub 端点完成前能"跑起来",可以:
- 临时给这些页面加一个 feature flag,默认显示 "Coming soon"
- 或者:让页面正常调 hub,hub 返回 404 时显示 ErrorState

**推荐**:正常调 hub,后端 P0 端点优先实现,二者会合。

### Feature 08 (Onboarding)

`/onboarding/*` 4 个页 + middleware 跳转。`middleware.ts` 见下节。

---

## 6. middleware

`services/dashboard/middleware.ts`:

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/signup', '/connect']
const ONBOARDING_PATHS_PREFIX = '/onboarding'

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname

  // 1. fetch session from hub (走 cookie)
  const sessionRes = await fetch(`${process.env.NEXT_PUBLIC_HUB_URL}/api/auth/session`, {
    headers: { cookie: req.headers.get('cookie') ?? '' },
  })
  const session = sessionRes.ok ? (await sessionRes.json()).data : null

  const isAuth = !!session
  const isPublic = PUBLIC_PATHS.some(p => path.startsWith(p))
  const isOnboarding = path.startsWith(ONBOARDING_PATHS_PREFIX)
  const isAccept = path.startsWith('/onboarding/accept')

  // 2. 未登录 + 非公共 → /login
  if (!isAuth && !isPublic && !isAccept) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(path)}`, req.url))
  }

  // 3. 已登录 + login/signup → /inbox (或 /onboarding)
  if (isAuth && (path === '/login' || path === '/signup')) {
    return NextResponse.redirect(new URL('/inbox', req.url))
  }

  // 4. onboarding 跳转规则 (需要 /api/me — P0 hub 端点)
  if (isAuth && !isPublic) {
    const meRes = await fetch(`${process.env.NEXT_PUBLIC_HUB_URL}/api/me`, {
      headers: { cookie: req.headers.get('cookie') ?? '' },
    })
    if (meRes.ok) {
      const { data } = await meRes.json()
      const onboardingDone = data?.onboarding?.completed ?? false
      if (!onboardingDone && !isOnboarding) {
        return NextResponse.redirect(new URL('/onboarding', req.url))
      }
      if (onboardingDone && isOnboarding && !isAccept) {
        return NextResponse.redirect(new URL('/inbox', req.url))
      }
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
```

**注意**:middleware 在 Edge runtime 跑,每次都 fetch hub 两次有性能影响。V2 优化用 cookie 中携带 hashed user_id + 客户端缓存 onboarding 状态。

---

## 7. i18n 移植

```bash
mkdir -p services/dashboard/lib/i18n
cp services/pwa/src/i18n/{messages,en,zh,store}.ts services/dashboard/lib/i18n/
cp services/pwa/src/i18n/LanguageSwitcher.tsx services/dashboard/components/
```

调整:
- `services/dashboard/lib/i18n/messages.ts` 加 `dash_*` 前缀的 key(沿用 PWA 现有 key 也行,无冲突)
- 在 `app/(dashboard)/layout.tsx` 顶部挂载 LanguageSwitcher

---

## 8. 检查没有遗漏的 fetch

```bash
grep -rn "fetch(['\"]\(/api/\|http://localhost\)" services/dashboard/ --include='*.tsx' --include='*.ts'
```

预期输出:**0 行**。如果有,说明还有 fetch 没改。

排除项:`lib/auth-client.ts`(走 Better Auth)、middleware 中直接 fetch hub(已加 HUB_URL)。

---

## 9. 本地 dev 反代

`services/dashboard/next.config.js` 加 rewrites(详见 [`../reference/auth-cookie.md`](../reference/auth-cookie.md) §6):

```js
async rewrites() {
  if (process.env.NODE_ENV !== 'development') return []
  return [{ source: '/api/:path*', destination: 'http://localhost:8787/api/:path*' }]
}
```

dev 时 hub 跑 `pnpm wrangler dev --port 8787`,dashboard 跑 `pnpm next dev --port 3000`。fetch 用相对 `/api/...` 路径在 dev 自动反代到 hub,prod 用 `NEXT_PUBLIC_HUB_URL`。

---

## 10. 提交

按 feature 分开 commit:

```
feat(dashboard): rewire auth + signup to call hub
feat(dashboard): rewire inbox to call hub + add WS hook
feat(dashboard): rewire devices + connect to call hub
feat(dashboard): rewire onboarding 4-step to call hub
feat(dashboard): rewire organization to call hub  (此时 hub 端点未完成,UI 显示 ErrorState 正常)
feat(dashboard): rewire knowledge / skills / audit to call hub
feat(dashboard): add middleware for auth + onboarding redirects
feat(dashboard): port i18n from PWA
```

---

## 11. 完成标志

- [ ] `services/dashboard/app/api/` 已删
- [ ] 全部 fetch 走 `hubFetch` 或 `authClient`
- [ ] middleware 实现跳转规则
- [ ] i18n 可用,EN/中切换正常
- [ ] dev 反代工作 (`pnpm dev` 启动后访问 `/inbox` 能看到 UI,即使没数据)
- [ ] hub /api/me 调用通过 (此时 hub 还没实现,会 404,**migration 03 才补**)
- [ ] 走向下一步:[`03-hub-extend.md`](03-hub-extend.md)
