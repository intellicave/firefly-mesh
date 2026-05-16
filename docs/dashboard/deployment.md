# 部署 Runbook

> 完整的 Cloudflare 部署清单。3 个域 → 3 个项目:1 个 Worker (hub) + 2 个 Pages (dashboard / pwa)。

---

## 1. Cloudflare 项目清单

| 项目 | 类型 | 域 | 源码 |
|---|---|---|---|
| `firefly-mesh-hub` | Worker | `hub.firefly-mesh.com` | `services/hub/` |
| `firefly-mesh-dashboard` | Pages | `app.firefly-mesh.com` | `services/dashboard/` |
| `firefly-mesh-pwa` | Pages | `firefly-mesh.com` | `services/pwa/` |

每个项目独立 `wrangler.toml`,独立部署。

---

## 2. DNS 配置

`firefly-mesh.com` 区在 Cloudflare 上,以下记录:

| Type | Name | Content | Proxied | 说明 |
|---|---|---|---|---|
| CNAME | `@` (apex / firefly-mesh.com) | `firefly-mesh-pwa.pages.dev` | ✅ | 营销页 |
| CNAME | `app` | `firefly-mesh-dashboard.pages.dev` | ✅ | Dashboard |
| CNAME | `hub` | `firefly-mesh-hub.<your-account>.workers.dev` | ✅ | Hub Worker |

Cloudflare 自动给每个 Proxied 子域签 DV 证书。

---

## 3. 第一次完整部署

### 3.1 Hub Worker

```bash
cd services/hub
pnpm install
```

`wrangler.toml`(关键 vars,详见仓内文件):

```toml
name = "firefly-mesh-hub"
main = "src/index.ts"
compatibility_date = "2026-05-01"
workers_dev = false
preview_urls = false

[vars]
APP_URL = "https://hub.firefly-mesh.com"
PWA_URL = "https://firefly-mesh.com"
DASHBOARD_URL = "https://app.firefly-mesh.com"
ALLOWED_ORIGINS = "https://firefly-mesh.com,https://app.firefly-mesh.com"
BETTER_AUTH_COOKIE_DOMAIN = ".firefly-mesh.com"

[[d1_databases]]
binding = "DB"
database_name = "firefly-mesh"
database_id = "522b31e6-7693-4cbf-a784-e5d86f9bf51c"

[[durable_objects.bindings]]
name = "TENANT_HUB"
class_name = "TenantHub"

[[ratelimits]]
name = "RL_AUTH"
namespace_id = "..."
simple = { limit = 10, period = 60 }

[[ratelimits]]
name = "RL_PAIR"
namespace_id = "..."
simple = { limit = 30, period = 60 }

[[ratelimits]]
name = "RL_MESSAGE"
namespace_id = "..."
simple = { limit = 60, period = 60 }

[[ratelimits]]
name = "RL_A2A"
namespace_id = "..."
simple = { limit = 120, period = 60 }
# 注:V1 不含跨 tenant A2A feature(详见 features/01)。该 binding 保留备用,
# 若后续完全确定不做,可删除。当前 hub 代码若仍引用该 binding,则保留即可。

[triggers]
crons = ["0 * * * *", "0 3 * * *"]

[[migrations]]
tag = "v1"
new_classes = ["TenantHub"]
```

Secrets (一次):
```bash
pnpm wrangler secret put BETTER_AUTH_SECRET     # 32 字节随机
pnpm wrangler secret put GOOGLE_CLIENT_ID
pnpm wrangler secret put GOOGLE_CLIENT_SECRET
pnpm wrangler secret put GITHUB_CLIENT_ID
pnpm wrangler secret put GITHUB_CLIENT_SECRET
pnpm wrangler secret put VAPID_PRIVATE_KEY      # Web Push
pnpm wrangler secret put VAPID_PUBLIC_KEY
pnpm wrangler secret put SECRETS_KEY            # 32 字节随机 base64,加密 tenant_secrets
```

D1 migration:
```bash
pnpm wrangler d1 migrations apply firefly-mesh --remote
# 0004 trigger 用脚本:
node scripts/install-audit-triggers.mjs
```

部署:
```bash
pnpm wrangler deploy
```

绑定 custom domain:`hub.firefly-mesh.com`(Workers Dashboard → firefly-mesh-hub → Triggers → Custom Domains)。

### 3.2 PWA (营销页)

```bash
cd services/pwa
pnpm install
pnpm build
pnpm dlx wrangler pages project create firefly-mesh-pwa --production-branch main
pnpm dlx wrangler pages deploy dist --project-name firefly-mesh-pwa --branch main
```

绑定 custom domain `firefly-mesh.com`(apex)。

env vars (Cloudflare Dashboard):
- `PUBLIC_HUB_URL = https://hub.firefly-mesh.com`

### 3.3 Dashboard

详见 [`migration/04-deploy.md`](migration/04-deploy.md) §3-5。

---

## 4. 日常迭代部署

每个项目独立,改一个不影响另两个。

### 仅 Hub

```bash
cd services/hub
pnpm test       # 跑 vitest
pnpm wrangler deploy
```

### 仅 Dashboard

```bash
cd services/dashboard
pnpm build      # next build
pnpm dlx @cloudflare/next-on-pages
pnpm dlx wrangler pages deploy .vercel/output/static --project-name firefly-mesh-dashboard --branch main
```

PR 自动创建 preview deployment(URL `https://<hash>.firefly-mesh-dashboard.pages.dev`)。

### 仅 PWA

```bash
cd services/pwa
pnpm build
pnpm dlx wrangler pages deploy dist --project-name firefly-mesh-pwa --branch main
```

---

## 5. Migration 滚动

D1 migration 顺序:0001-0008(详见 [`reference/data-models.md`](reference/data-models.md))。

应用:
```bash
cd services/hub
pnpm wrangler d1 migrations apply firefly-mesh --remote
```

含 trigger 的(如 0004)用脚本:
```bash
node scripts/install-audit-triggers.mjs
```

---

## 6. 回滚

### Worker 回滚

Cloudflare Dashboard → Workers → firefly-mesh-hub → Deployments → 选历史版本 → "Rollback"。

或:
```bash
pnpm wrangler rollback --message "rollback to <version>"
```

### Pages 回滚

Dashboard → Pages → firefly-mesh-dashboard → Deployments → 找前一个 deployment → "Rollback to this deployment"。

### D1 回滚

D1 没有原生 migration 回滚。需要手写 reverse SQL:
```sql
-- 例:回滚 0005
DROP TABLE onboarding_state;
```

并删除 `migrations_applied` 表对应行。**生产环境慎用**,优先 forward fix。

---

## 7. 监控

### 实时日志

```bash
# Hub
cd services/hub && pnpm wrangler tail

# Dashboard
pnpm wrangler pages deployment tail --project-name firefly-mesh-dashboard
```

### 健康检查

```
GET https://hub.firefly-mesh.com/  → { ok: true, version: "..." }
GET https://app.firefly-mesh.com/  → 200 (重定向到 /login 或 /inbox)
GET https://firefly-mesh.com/      → 200 营销页
```

### 关键指标

Cloudflare Dashboard 各项目页:
- Workers Analytics:requests / sub-requests / CPU time / errors
- Pages Analytics:page views / unique visitors / bandwidth
- D1 Analytics:queries / latency / rows read/written

报警阈值(V2 设):
- Hub error rate > 1%
- Hub p95 latency > 500ms
- D1 query failures > 10/min

---

## 8. 环境变量总表

### Hub `[vars]`

| Key | Value |
|---|---|
| `APP_URL` | `https://hub.firefly-mesh.com` |
| `PWA_URL` | `https://firefly-mesh.com` |
| `DASHBOARD_URL` | `https://app.firefly-mesh.com` |
| `ALLOWED_ORIGINS` | `https://firefly-mesh.com,https://app.firefly-mesh.com` |
| `BETTER_AUTH_COOKIE_DOMAIN` | `.firefly-mesh.com` |

### Hub Secrets

| Key | 来源 |
|---|---|
| `BETTER_AUTH_SECRET` | 随机 32 字节 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth App |
| `VAPID_PRIVATE_KEY` / `VAPID_PUBLIC_KEY` | `pnpm dlx web-push generate-vapid-keys` |
| `SECRETS_KEY` | 随机 32 字节 base64,加密 tenant_secrets |

### Dashboard env

| Key | Value |
|---|---|
| `NEXT_PUBLIC_HUB_URL` | `https://hub.firefly-mesh.com` |
| `NEXT_PUBLIC_PWA_URL` | `https://firefly-mesh.com` |
| `NODE_VERSION` | `20` |

### PWA env

| Key | Value |
|---|---|
| `PUBLIC_HUB_URL` | `https://hub.firefly-mesh.com` |
| `PUBLIC_DASHBOARD_URL` | `https://app.firefly-mesh.com` |

---

## 9. CI/CD (GitHub Actions)

`.github/workflows/`:
- `hub-deploy.yml` — push 到 main + 路径 `services/hub/**` → deploy Worker
- `dashboard-deploy.yml` — push 到 main + 路径 `services/dashboard/**` → deploy Pages
- `pwa-deploy.yml` — push 到 main + 路径 `services/pwa/**` → deploy Pages
- `red-line.yml` — 每次 PR 跑红线扫描(audit_log 直改禁止等)

需要 secrets:
- `CLOUDFLARE_API_TOKEN` (Edit Workers + Edit Pages + D1 access)
- `CLOUDFLARE_ACCOUNT_ID`

---

## 10. OAuth Callback URL 配置

### Google Cloud Console

OAuth 2.0 Client → Authorized redirect URIs:
- `https://hub.firefly-mesh.com/api/auth/callback/google`

### GitHub OAuth App

Settings → Authorization callback URL:
- `https://hub.firefly-mesh.com/api/auth/callback/github`

**注意**:OAuth callback 落在 hub(不是 dashboard),hub 完成 token 交换后 302 回 dashboard 的 `callbackURL`(详见 [`reference/auth-cookie.md`](reference/auth-cookie.md))。

---

## 11. 域名验证

部署完成后:

```bash
# 检查 SSL
curl -I https://hub.firefly-mesh.com/
curl -I https://app.firefly-mesh.com/
curl -I https://firefly-mesh.com/

# 检查 cookie
# 在浏览器登录 dashboard → DevTools → Application → Cookies
# 应该看到 .firefly-mesh.com 域的 session cookie

# 检查 CORS preflight
curl -X OPTIONS https://hub.firefly-mesh.com/api/me \
  -H "Origin: https://app.firefly-mesh.com" \
  -H "Access-Control-Request-Method: GET" \
  -i
# 期望 200,响应头有:
# access-control-allow-origin: https://app.firefly-mesh.com
# access-control-allow-credentials: true
```

---

## 12. 已知坑

- **Wrangler version**:用 `wrangler@^3.50` 起。早期版本 `[[ratelimits]]` 语法不同。
- **next-on-pages CPU 限制**:Workers Free plan 限 10ms,Better Auth 的 argon2id 哈希会超时。**必须升级 Workers Paid plan ($5/mo)**,生产可用。
- **D1 trigger 应用**:`wrangler d1 migrations apply` 按 `;` 切割 SQL,会破坏 BEGIN/END 触发器。必须用 `scripts/install-audit-triggers.mjs` 通过 `--file` API 发送整个文件。
- **D1 `migrations_applied` 表追踪**:手动执行 SQL 也要写入,否则下次 `migrations apply` 会重复跑。
- **WS 跨域**:浏览器 WS handshake 默认带 cookie(`.firefly-mesh.com` 域),无需特殊处理;但 hub 必须在 ALLOWED_ORIGINS 中明确列出 dashboard origin。
- **Astro redirect 通配语法**:`[...rest]` 在配置和目标 URL 中都要写,Astro v3.5+ 才支持。

---

## 13. 应急流程

如果 dashboard 挂了但 hub 正常:
- PWA `firefly-mesh.com` 仍可用(独立部署)
- user 可以暂时通过 hub API 直接操作(`curl` 或 CLI),但失去 UI
- Rollback dashboard 到上一个 working deployment

如果 hub 挂了(更严重):
- dashboard 和 PWA 都会 401 / 404
- 立即检查 wrangler tail
- 如果是 D1 慢/挂:Cloudflare Status Page
- Rollback hub 到上一个 working version
- 数据本身在 D1 上,不会丢
