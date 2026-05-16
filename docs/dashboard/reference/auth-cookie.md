# Reference — 跨域 Cookie 与 Session

> 这是 V1 部署最容易踩坑的地方。dashboard 在 `app.firefly-mesh.com`,hub 在 `hub.firefly-mesh.com`。一份 cookie 怎么同时被两边发出 / 接收。

---

## 1. 关键事实

| 概念 | 值 |
|---|---|
| dashboard origin | `https://app.firefly-mesh.com` |
| hub origin | `https://hub.firefly-mesh.com` |
| 共同 eTLD+1 (Site) | `firefly-mesh.com` |
| Cookie 域要设成 | **`.firefly-mesh.com`**(注意前导点) |
| Cookie SameSite | `Lax`(允许子域间发送) |
| Cookie Secure | `true`(生产 https) |
| Cookie HttpOnly | `true`(JS 不可读,XSS 防御) |

设成 `.firefly-mesh.com` 之后,**两个子域共享同一份 cookie**,无需复杂方案。

---

## 2. Better Auth 配置

在 `services/hub/src/auth.ts`(或等价位置):

```ts
import { betterAuth } from 'better-auth'

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'sqlite' }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.APP_URL,                   // = https://hub.firefly-mesh.com
  trustedOrigins: [
    'https://app.firefly-mesh.com',
    'https://firefly-mesh.com',
    // 本地开发:'http://localhost:3000', 'http://localhost:4321',
  ],
  socialProviders: { ... },
  advanced: {
    crossSubDomainCookies: {
      enabled: true,
      domain: env.BETTER_AUTH_COOKIE_DOMAIN,  // = .firefly-mesh.com
    },
    defaultCookieAttributes: {
      sameSite: 'lax',
      secure: true,
      httpOnly: true,
    },
  },
})
```

环境变量:`wrangler.toml` 中的 `[vars]`:
```toml
APP_URL = "https://hub.firefly-mesh.com"
BETTER_AUTH_COOKIE_DOMAIN = ".firefly-mesh.com"
PWA_URL = "https://firefly-mesh.com"
DASHBOARD_URL = "https://app.firefly-mesh.com"
```

`BETTER_AUTH_SECRET` 走 `wrangler secret put`。

---

## 3. CORS 配置

Hub 的 CORS middleware 必须:
- 接受 `Origin: https://app.firefly-mesh.com`(精确匹配,不能用 `*`)
- 响应头 `Access-Control-Allow-Credentials: true`
- 响应头 `Access-Control-Allow-Origin: <echo 原 origin>`

`services/hub/src/middleware/cors.ts` 已实现 allow-list:
```ts
const ALLOWED = (env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim())
if (ALLOWED.includes(origin)) {
  res.headers.set('access-control-allow-origin', origin)
  res.headers.set('access-control-allow-credentials', 'true')
}
```

`wrangler.toml`:
```toml
ALLOWED_ORIGINS = "https://firefly-mesh.com,https://app.firefly-mesh.com"
```

---

## 4. Dashboard 端 fetch

每个调 hub 的 fetch 都要带 `credentials: 'include'`:

```ts
// services/dashboard/lib/hub.ts
export async function hubFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_HUB_URL}${path}`, {
    ...init,
    credentials: 'include',          // ← 关键
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  if (!res.ok) {
    if (res.status === 401) {
      window.location.href = '/login'
      throw new Error('unauthorized')
    }
    const body = await res.json().catch(() => ({}))
    throw new HubError(body?.error?.message ?? res.statusText, res.status)
  }
  return res.json()
}
```

Better Auth 的 `createAuthClient` 内部自动 `credentials: 'include'`,无需手动。

---

## 5. WebSocket

WS handshake 是 HTTP upgrade,**自动带 cookie**(只要 origin 在 allow-list)。

dashboard 端代码:
```ts
const ws = new WebSocket(`${process.env.NEXT_PUBLIC_HUB_URL.replace('https://','wss://')}/ws`)
```

注意:浏览器会发送 `.firefly-mesh.com` 域下的所有 cookie 给 hub.firefly-mesh.com 的 WS handshake — 因为 WebSocket 走 HTTP upgrade,cookie 行为与普通 HTTP 相同。

Hub `services/hub/src/index.ts` 的 WS upgrade handler 走相同的 `requireSession` 或 `requireAgent`(根据 JWT query param 区分)。

---

## 6. 本地开发

dev 用 `localhost` 不同端口时:

| 项 | dev 值 |
|---|---|
| dashboard | `http://localhost:3000` |
| hub | `http://localhost:8787` (wrangler dev) |

dev 模式下 cookie 不能用 `.firefly-mesh.com` 域(浏览器拒绝跨 origin)。两种方案:

**方案 A — 反代到同 origin**(推荐):
dashboard 的 `next.config.js` 加 rewrites:
```js
async rewrites() {
  return [{ source: '/api/:path*', destination: 'http://localhost:8787/api/:path*' }]
}
```
然后所有 fetch 用相对路径 `/api/...`,完全同 origin,无 cookie 问题。

**方案 B — 修改 cookie 配置仅 dev**:
Better Auth 的 `crossSubDomainCookies` 在 dev 关闭,cookie 自动用 host scope。要求 hub 也跑在 `localhost:3000` 的子路径(用 wrangler dev `--local --port 3000 --inspector-port 9229` + dashboard 用 4321 等)。复杂,不推荐。

**结论**:dev 用方案 A,prod 用 `.firefly-mesh.com` 域 cookie。

---

## 7. 验证 cookie 设置正确

部署后到 dashboard 域(`https://app.firefly-mesh.com`):

1. 登录一次。
2. 打开浏览器 DevTools → Application → Cookies → `https://app.firefly-mesh.com`
3. 检查 `firefly-mesh.session-token`(或 Better Auth 默认名 `better-auth.session_token`):
   - Domain = `.firefly-mesh.com`(**前导点**)
   - SameSite = `Lax`
   - Secure = `true`
   - HttpOnly = `true`
4. 切到 `https://hub.firefly-mesh.com`,在 Cookies 列表看到**同一份** cookie。
5. fetch test:在 dashboard 的 console 跑:
   ```js
   await fetch('https://hub.firefly-mesh.com/api/me', { credentials: 'include' }).then(r => r.json())
   ```
   返回 user 信息 = ✅。401 = cookie 没正确共享。

---

## 8. 调试清单

如果 dashboard 调 hub 拿到 401:

- [ ] dashboard fetch 是否带了 `credentials: 'include'`?
- [ ] hub 的 `ALLOWED_ORIGINS` 是否包含 dashboard origin?(精确匹配,不要末尾斜杠)
- [ ] hub 响应头是否有 `Access-Control-Allow-Origin: https://app.firefly-mesh.com` + `Access-Control-Allow-Credentials: true`?
- [ ] 浏览器 cookie 的 Domain 是否为 `.firefly-mesh.com`?
- [ ] `BETTER_AUTH_COOKIE_DOMAIN` env 是否注入到 hub Worker?(`wrangler tail` 看启动 log)
- [ ] Better Auth 的 `crossSubDomainCookies.enabled = true`?

如果 OAuth 回调跳到 hub 而不是 dashboard:

- [ ] 检查 `signIn.social({ callbackURL })` 参数 — 必须是**绝对 URL** `${window.location.origin}/onboarding`
- [ ] 不能传相对路径 `/onboarding`(会被 Better Auth 解析到 baseURL = hub 域)

---

## 9. 安全考虑

- **CSRF**:`SameSite=Lax` 已经防御大部分 CSRF。但 dashboard 域被攻破(XSS)时可读 cookie? 不,`HttpOnly=true`,JS 读不到。
- **子域劫持**:任何 `*.firefly-mesh.com` 的子域(包括将来的 marketing-experiment.firefly-mesh.com)都能读这份 cookie。所以**子域 DNS 管理必须严格**,不要给不可信第三方解析 firefly-mesh 子域。
- **token 泄漏**:cookie 是 session token,不是长寿 API key。Better Auth 默认 7 天过期,可续期。token 被盗 → 后端 revoke session 即时失效。
- **WS 鉴权**:WS handshake 走 cookie,但 WS 之后没有重新校验。session revoke 后已建立的 WS 不会自动断 — V2 加 server 端定期 re-check(每 1 分钟内存查 session 状态)。
