# Migration 05 — 缩减 PWA 为只剩营销页

> Dashboard 在 `app.firefly-mesh.com` 接管所有产品功能后,`services/pwa/`(Astro)只保留营销页 `/` 和配对回调 `/connect`。

预计耗时:**0.5 天**。

---

## 1. 前置条件

- [x] migration 01-04 完成
- [x] `app.firefly-mesh.com` 上 dashboard 已在线
- [x] 端到端验证通过 (migration 04 §8)
- [ ] Dashboard 上至少有 1 个 user 已经走通完整流程

---

## 2. 决策回顾

为什么把 PWA 切成只剩营销页(详见 [`../ARCHITECTURE.md`](../ARCHITECTURE.md) §D5):
- 营销页静态、SEO 敏感 → Astro 强项
- Dashboard 高交互、登录态 → Next.js 强项
- 分开后,改营销文案不会触发 dashboard 重新部署
- `/connect` 因为是 CLI 触发,要在公开域(无登录)能打开,放 PWA 或 dashboard 都行 — **决策**:放 dashboard(`app.firefly-mesh.com/connect`)即可,user 配对后续在 dashboard 内继续操作更连贯。所以本 migration 把 PWA 的 `/connect` 也删掉。

---

## 3. 哪些路由要从 PWA 删除

PWA 当前路由(`services/pwa/src/pages/`):

| URL | 处理 |
|---|---|
| `/` | 保留 (营销页) |
| `/signup` | **删除**(dashboard 接管,或 redirect 到 `app.firefly-mesh.com/signup`) |
| `/login` | **删除**(同上) |
| `/onboarding` | **删除**(dashboard 接管) |
| `/inbox` | **删除** |
| `/connect` | **删除** → redirect 到 `app.firefly-mesh.com/connect` |
| `/settings/devices` (若有) | **删除** |
| `/settings/members` (若有) | **删除** |

---

## 4. Astro redirect 配置

`services/pwa/astro.config.mjs`:

```js
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import tailwind from '@astrojs/tailwind'
import cloudflare from '@astrojs/cloudflare'

export default defineConfig({
  output: 'static',
  adapter: cloudflare(),
  integrations: [react(), tailwind()],
  redirects: {
    '/login':            'https://app.firefly-mesh.com/login',
    '/signup':           'https://app.firefly-mesh.com/signup',
    '/inbox':            'https://app.firefly-mesh.com/inbox',
    '/onboarding':       'https://app.firefly-mesh.com/onboarding',
    '/onboarding/[...rest]': 'https://app.firefly-mesh.com/onboarding/[...rest]',
    '/connect':          'https://app.firefly-mesh.com/connect',
    '/settings':         'https://app.firefly-mesh.com/settings',
    '/settings/[...rest]': 'https://app.firefly-mesh.com/settings/[...rest]',
  },
})
```

Astro 会生成 301 redirect。

---

## 5. 删文件

```bash
cd services/pwa
rm -rf src/pages/signup src/pages/login src/pages/inbox src/pages/onboarding src/pages/connect
rm -rf src/pages/settings 2>/dev/null
rm -rf src/components/app/InboxPage* src/components/app/ConnectPage* src/components/app/DevicesPage* src/components/app/MembersPage*
rm -rf src/components/auth   # 如果有
```

确认还在的:
```bash
ls src/pages/
# 期望:index.astro (营销页)
```

---

## 6. 删除 i18n 中的废弃 key (可选)

`services/pwa/src/i18n/messages.ts` 中的 `inbox_*`, `login_*`, `devices_*`, `members_*`, `connect_*`, `onboarding_*` 现在 PWA 不再用。**两种选择**:

- **保留**:简单,以防 SSR 时 redirect 前还要短暂渲染。
- **删除**:更干净。本步骤推荐**保留**(只在 dashboard i18n catalog 中维护新副本,PWA 这边历史保留)。

更彻底的做法:把 PWA i18n catalog 精简为只剩营销页用的 `landing_*` + `lang_switch_label` + `brand_name` + `cta_*` 等。

---

## 7. 测试 redirect

```bash
curl -I https://firefly-mesh.com/login
# 期望:HTTP/2 301
# Location: https://app.firefly-mesh.com/login
```

浏览器手测:
- `firefly-mesh.com/login` → 自动跳 `app.firefly-mesh.com/login`
- `firefly-mesh.com/onboarding/import` → 自动跳 `app.firefly-mesh.com/onboarding/import`
- `firefly-mesh.com/connect?code=XYZ` → `app.firefly-mesh.com/connect?code=XYZ`(query 保留)

**注意**:Astro `redirects` 配置中的 `[...rest]` 通配,需要 Astro v3.5+(我们用的版本)。如果通配不工作,降级为穷举具体路径或用 `_routes.json` 自定义 Pages Functions redirect。

---

## 8. 更新营销页 CTA

`services/pwa/src/components/landing/*` 中 `Get started free` / `Sign in` 按钮 href:

```diff
- href="/signup"
+ href="https://app.firefly-mesh.com/signup"

- href="/login"
+ href="https://app.firefly-mesh.com/login"
```

或者保留相对 `/signup`,让 redirect 兜底也行(但多一次 301)。**推荐**:直接绝对 URL,减少 redirect。

---

## 9. 部署 PWA

```bash
cd services/pwa
pnpm build
pnpm dlx wrangler pages deploy dist --project-name firefly-mesh-pwa --branch main
```

(Project name 沿用现有 PWA 部署项目名,见 [`../deployment.md`](../deployment.md) §PWA。)

---

## 10. 端到端验证

| # | 测试 | 期望 |
|---|---|---|
| 1 | 访问 `firefly-mesh.com/` | 营销页正常加载,Lighthouse Performance ≥ 95 |
| 2 | 点击 「Get started free」 | 跳到 `app.firefly-mesh.com/signup` |
| 3 | 点击 「Sign in」 | 跳到 `app.firefly-mesh.com/login` |
| 4 | `firefly-mesh.com/inbox` 直接访问 | 301 → `app.firefly-mesh.com/inbox`(→ login) |
| 5 | 已登录访问 `firefly-mesh.com/` | 右上角显示「Go to inbox」(选做,V2 加;V1 显示 Sign in 也可) |
| 6 | PWA 改营销文案 + redeploy | 不影响 dashboard |
| 7 | EN/中切换 | 营销页 i18n 仍然工作 |

---

## 11. 完成标志

- [ ] `services/pwa/src/pages/` 只剩 `index.astro`(营销页)和 redirect 配置
- [ ] 所有原 PWA 路由 301 → dashboard 域
- [ ] 营销页 Lighthouse Performance ≥ 95
- [ ] dashboard 完全接管所有产品功能
- [ ] **整个 dashboard 迁移完成**(README 中描述的 5 步全部完成)

---

## 12. 收尾清单

- [ ] 删除 `docs/dashboard/MIGRATION-NOTES.md`(若有,临时文件)
- [ ] 更新主仓 README,说明 monorepo 结构:`services/{hub, dashboard, pwa}/`
- [ ] 关闭 archive 相关的 GitHub issue(若有)
- [ ] 在 `acceptance.md` 中勾选完成项
- [ ] 走向 P1 / P2 迭代(详见 README §1 "我想看 …" 章节)
