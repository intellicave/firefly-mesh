# Migration 04 — Cloudflare Pages 部署

> 把 `services/dashboard/` 部署到 `app.firefly-mesh.com`。

预计耗时:**0.5 天**。

详细 runbook 见 [`../deployment.md`](../deployment.md);本文是 migration 步骤摘要。

---

## 1. 前置条件

- [x] migration 01-03 完成
- [ ] Cloudflare 账号有 Pages 权限 (`wrangler whoami` 验证)
- [ ] `firefly-mesh.com` DNS 在 Cloudflare 托管

---

## 2. 本地构建验证

```bash
cd services/dashboard
pnpm install
pnpm dlx @cloudflare/next-on-pages
```

产物在 `.vercel/output/static/`。本地预览:
```bash
pnpm dlx wrangler pages dev .vercel/output/static
```

访问 `http://localhost:8788`,主流程能跑(允许 hub 401,因为本地 dev 没登录)。

---

## 3. 创建 Pages 项目

第一次部署:
```bash
cd services/dashboard
pnpm dlx wrangler pages project create firefly-mesh-dashboard \
  --production-branch main \
  --compatibility-date 2026-05-01
```

---

## 4. 设置环境变量

通过 Cloudflare Dashboard 或 wrangler:

| Key | Value | 类型 |
|---|---|---|
| `NEXT_PUBLIC_HUB_URL` | `https://hub.firefly-mesh.com` | Plain (Production + Preview) |
| `NEXT_PUBLIC_PWA_URL` | `https://firefly-mesh.com` | Plain |
| `NODE_VERSION` | `20` | Plain |

(dashboard 不需要 secrets。所有数据走 hub,hub 自己持有 secrets。)

通过 wrangler:
```bash
pnpm dlx wrangler pages secret put NEXT_PUBLIC_HUB_URL \
  --project-name firefly-mesh-dashboard
# 但 NEXT_PUBLIC_* 应该是 plain var,不是 secret,所以走 Dashboard UI 更准确
```

---

## 5. 部署

```bash
cd services/dashboard
pnpm dlx @cloudflare/next-on-pages
pnpm dlx wrangler pages deploy .vercel/output/static \
  --project-name firefly-mesh-dashboard \
  --branch main
```

预期输出:
```
✨ Deployment complete!
View live deployment at:
https://<deployment-hash>.firefly-mesh-dashboard.pages.dev
```

---

## 6. 绑定自定义域

Cloudflare Dashboard → Pages → firefly-mesh-dashboard → Custom Domains → Add:
- Domain: `app.firefly-mesh.com`
- Cloudflare 自动添加 DNS CNAME 到 pages.dev,DV 证书自动签发。

验证:
```bash
curl -I https://app.firefly-mesh.com/
# HTTP/2 200,Server: cloudflare
```

---

## 7. 同步 Hub 配置

Hub 的 `ALLOWED_ORIGINS` 必须包含 `https://app.firefly-mesh.com`。

```bash
cd services/hub
# 编辑 wrangler.toml:
# [vars]
# ALLOWED_ORIGINS = "https://firefly-mesh.com,https://app.firefly-mesh.com"
pnpm wrangler deploy
```

同时检查 `BETTER_AUTH_COOKIE_DOMAIN = ".firefly-mesh.com"`(详见 [`../reference/auth-cookie.md`](../reference/auth-cookie.md))。

---

## 8. 端到端验证

| # | 测试 | 期望 |
|---|---|---|
| 1 | 访问 `app.firefly-mesh.com/` | 重定向到 `/login`(未登录) |
| 2 | 点击 「Sign up」 | 显示 `/signup` 页 |
| 3 | 邮箱密码注册 | 跳到 `/onboarding/create-org` |
| 4 | DevTools Cookie | 看到 `*.firefly-mesh.com` 域 cookie |
| 5 | 创建 tenant | 跳到 `/onboarding/import` |
| 6 | Skip → tokens | 显示 step 3 三 runtime 卡片 |
| 7 | Skip → done → inbox | 进入 `/inbox`,空态正常显示 |
| 8 | DevTools Network | 所有 fetch 走 `hub.firefly-mesh.com`,credentials: include |
| 9 | WS 连接 | `wss://hub.firefly-mesh.com/ws` handshake 成功,状态点 Live |
| 10 | 跨页跳转 | 侧边栏 Inbox / Organization / Knowledge / Skills / Audit / Settings 都能加载(允许空数据) |
| 11 | OAuth 登录 | Google / GitHub 回跳到 `app.firefly-mesh.com/onboarding`(**不是 hub 域**) |
| 12 | 登出 | cookie 清空,跳 `/login` |

如果第 11 项跳错,检查 `signIn.social({ callbackURL })` 必须是**绝对 URL**(详见 feature 07 §7)。

---

## 9. 性能 baseline

```bash
pnpm dlx lighthouse https://app.firefly-mesh.com/login \
  --output html --output-path ./lighthouse-login.html
```

预期(login 是简单页):
- Performance ≥ 90
- Accessibility ≥ 95

`/inbox`(需登录,Lighthouse 自动 fail)用 Chrome DevTools Performance 手测,目标 FCP < 1.5s。

---

## 10. CI 自动部署 (可选)

`.github/workflows/dashboard-deploy.yml`:

```yaml
name: dashboard-deploy
on:
  push:
    branches: [main]
    paths: ['services/dashboard/**']
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install
        working-directory: services/dashboard
      - run: pnpm dlx @cloudflare/next-on-pages
        working-directory: services/dashboard
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy services/dashboard/.vercel/output/static --project-name firefly-mesh-dashboard
```

PR 触发 preview deployment(Pages 默认行为),可在 PR comment 中拿到预览 URL。

---

## 11. 完成标志

- [ ] `https://app.firefly-mesh.com/` 可访问,SSL 正常
- [ ] 全部 12 项端到端验证通过
- [ ] Lighthouse Performance ≥ 90(login 页)
- [ ] CI 自动部署工作(若开启)
- [ ] 走向下一步:[`05-pwa-retire.md`](05-pwa-retire.md)

---

## 12. 故障排查

| 症状 | 处理 |
|---|---|
| `wrangler pages deploy` 报 "project not found" | `wrangler pages project list` 看,可能要先 create |
| 部署后访问 → next-on-pages 错误页 "Edge function failed" | wrangler tail 看实时日志,通常是某个 route 用了 server-only API,加 `export const runtime = 'edge'` |
| OAuth 跳到 hub 域不是 dashboard | `callbackURL` 必须用 `${window.location.origin}/...` 绝对 URL |
| 401 一直循环 | cookie 域不对,检查 hub 的 `BETTER_AUTH_COOKIE_DOMAIN=.firefly-mesh.com` |
| WS 连不上 | `wrangler tail` hub Worker,看 handshake 是否被 CORS 拦截 |
| Lighthouse Performance 低 | 检查 bundle size (`pnpm dlx @next/bundle-analyzer`),把 lucide-react 改为按图标 import (`import { Mail } from 'lucide-react'` 而非 `import * as`) |
