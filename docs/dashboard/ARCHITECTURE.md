# 架构与决策日志

## 1. 总体拓扑

```
                    用户浏览器
                        │
            ┌───────────┼────────────┐
            ▼           ▼            ▼
  firefly-mesh.com  app.firefly-mesh.com  hub.firefly-mesh.com
    (营销页)         (dashboard)            (API + WS)
    Astro            Next.js 14             Workers + DO + D1
    Pages            Pages (next-on-pages)  单 Worker
                        │                         ▲
                        └────── fetch (cookie) ───┘
                          credentials: 'include'
                          Origin → CORS allow-list
                          Cookie 域 .firefly-mesh.com
```

**3 个域,2 个 Pages 项目,1 个 Worker**。

- `firefly-mesh.com` (apex) — 营销页,Astro,静态。
- `app.firefly-mesh.com` — Dashboard,Next.js App Router,通过 next-on-pages 构建后部署。
- `hub.firefly-mesh.com` — Hub Worker,所有 API + WebSocket。

---

## 2. 关键决策

### D1. Dashboard 技术栈 = 保留 Next.js 14 App Router

**为什么不重写为 Astro**:
- Dashboard 是 SPA-grade 交互密度 (实时 inbox、表格、表单、抽屉),Astro 的 island 模型在这种密度下退化为"穿着 Astro 皮的 React SPA",失去了 Astro 的优势。
- v0 已经产出完整的 Next.js + shadcn/ui 代码 (`legacy/v0/packages/web/`),12+ 页 + 48 个 API route,共 8000+ 行。重写≈3 个月,无收益。
- Next.js App Router 在 Cloudflare Pages (next-on-pages) 上已生产可用。

**为什么不重写为 SvelteKit/SolidStart**:
- 同上,沉没成本。

**结论**:**还原** `legacy/v0/packages/web/` 到 `services/dashboard/`,只改数据访问层。

---

### D2. API 路由策略 = Dashboard 不持有 server route,全部走 Hub

**为什么**:
- v0 当前的 `app/api/*` 48 个 route 是当年单仓 Next.js 时代的产物,直接连数据库。
- Edge 化后,数据库 = D1,只能在 Worker (hub) 里访问 (D1 不暴露 HTTP API)。
- 在 dashboard 里再开 server route 转发一次会出现"双跳"(浏览器 → dashboard → hub),增加延迟 + 复杂度,且 next-on-pages 的 server route 也是 Workers,资源紧张。

**做法**:
- 删除 `services/dashboard/app/api/` 整个目录。
- Dashboard 中所有 fetch 改成 `fetch(\`${HUB_URL}${path}\`, { credentials: 'include' })`。
- Hub 补足缺失端点 (见 `api/hub-needed.md`)。

**例外**:None。一律走 Hub。

---

### D3. 跨域会话 = Better Auth cookie 域设 `.firefly-mesh.com`

**为什么**:
- Dashboard (`app.firefly-mesh.com`) 与 Hub (`hub.firefly-mesh.com`) 是同 Site (eTLD+1 = firefly-mesh.com) 不同 Subdomain。
- Better Auth 默认把 cookie 设给 hub 的子域。需要显式配置 `cookieOptions.domain = '.firefly-mesh.com'` 才能让 dashboard 把 cookie 一同发出。
- `SameSite=Lax` 已经满足跨子域 cookie 的发送 (Lax 不阻止子域)。

**详见**:`api/auth-cookie.md`。

---

### D4. WebSocket 跨域

**问题**:WS handshake 也需要带 session cookie 才能识别用户。

**做法**:
- Hub WS 端点 `/ws` 在 handshake 时检查 cookie (与 HTTP 同源同机制)。
- 浏览器 `new WebSocket('wss://hub.firefly-mesh.com/ws?token=...')` 会自动带上 `.firefly-mesh.com` 域的 cookie。
- Hub 的 `Upgrade` 处理器走与 HTTP 相同的 auth middleware。

**替代方案 (拒绝)**:
- 不用 query string 传 session token (易泄漏到日志/Referer)。
- 不用单独的 WS auth endpoint (引入额外往返)。

---

### D5. 营销页归位 Astro PWA,Dashboard 不承担落地页

**为什么**:
- 营销页内容低交互、SEO 敏感、静态化收益高 → Astro 强项。
- Dashboard 需要登录后状态、表单、实时 → Next.js 强项。
- 分开后,营销页改文案不会引起 dashboard 重新部署。

**做法**:
- `services/pwa/` 缩减到只保留 `/` (营销页) 和 `/connect` (CLI 配对回调)。
- 其它原有路由 (`/inbox`、`/login` 等) 全部退出 → 移交给 dashboard。

---

### D6. 移除 `next.config.js` 中的 server-only 特性

next-on-pages 不支持的特性:
- `next/image` 默认 loader (Cloudflare 有自己的图片优化,或者用 `unoptimized: true`)。
- Edge runtime 是默认 → 每个 route 显式加 `export const runtime = 'edge'`。
- ISR / on-demand revalidate → 不支持,用 `revalidate = 0` (dynamic) 或纯 CSR。

**约束**:`migration/01-restore.md` 中列出所有需调整的文件。

---

### D7. 环境变量

| Key | dashboard | hub | pwa |
|---|---|---|---|
| `NEXT_PUBLIC_HUB_URL` | ✅ `https://hub.firefly-mesh.com` | — | — |
| `PUBLIC_HUB_URL` | — | — | ✅ |
| `APP_URL` | — | ✅ `https://hub.firefly-mesh.com` | — |
| `PWA_URL` | — | ✅ `https://firefly-mesh.com` | — |
| `DASHBOARD_URL` | — | ✅ `https://app.firefly-mesh.com` (CORS allow) | — |
| `BETTER_AUTH_SECRET` | — | ✅ secret | — |
| `BETTER_AUTH_COOKIE_DOMAIN` | — | ✅ `.firefly-mesh.com` | — |

Hub 的 CORS allow-list 需新增 `app.firefly-mesh.com`。

---

## 3. 决策日志 (按时间)

| 日期 | 决策 | 决策者 | 备注 |
|---|---|---|---|
| 2026-04-28 | v0 dashboard 完成,采用 Next.js + shadcn/ui | 设计阶段 | `docs/plans/2026-04-28-firefly-mesh-ui.md` |
| 2026-05-XX | edge 重构,误把 v0 dashboard 归档 | 之前的我 | **错误决策** |
| 2026-05-11 | 还原 v0 dashboard,只改连接方式 | 用户纠正 | "edge 只影响连接方式,用户的使用是一致的啊" |
| 2026-05-11 | 决定用 Cloudflare Pages + next-on-pages | 本文档 | 详见 deployment.md |
| 2026-05-11 | 决定 dashboard 不持有 server route,全走 hub | 本文档 | D2 |

---

## 4. 风险登记

| 风险 | 影响 | 缓解 |
|---|---|---|
| next-on-pages 在某些 v0 组件下构建失败 | 高 | 先用 `@cloudflare/next-on-pages` v1 试构,失败的页面降级为纯 CSR |
| Better Auth 跨子域 cookie 配置 | 中 | 见 D3,有完整方案 |
| Hub Worker CPU 限制 (Free plan 10ms) | 高 | 已知问题,需升级 Paid plan ($5/mo) |
| D1 在突发 inbox 查询下慢 | 中 | 加索引,见各 page doc 的 §Data Needs |
| 跨域 WS cookie 在某些浏览器策略下失效 | 中 | fallback: 临时 token,见 D4 |

---

## 5. 不变量 (invariants)

- 一份 cookie,一份 session。Dashboard 和 Hub 共享 Better Auth 数据库 (`auth_*` 表),不复制 session。
- 所有数据修改走 Hub。Dashboard 不持有写权限的本地存储。
- 跨 tenant 数据隔离在 Hub 中间件强制 (`requireTenant` middleware) — 多 tenant 之间互相不可见(默认安全设计,与 cross-tenant feature 无关)。
- V1 不做 E2E 加密:组织内 hub 是受信组件,message body 明文存储,inbox 列表 preview / push 文案 / 全文搜索都受益。跨 tenant 通信不在 V1 范围;若未来要做,会重新设计独立协议(那时才需要 E2E + 签名)。

---

## 6. 与 paperclip/multica 文档结构的对照

- **paperclip-docs** (`paperclipai/paperclip-docs`): `docs/{administration, guides, how-to, reference, user-guides}/` — 按"用户类型 × 任务类型"两维切分。
- **multica** (`multica-ai/multica`): README 是 index,旁边平铺 `SELF_HOSTING.md` / `AGENTS.md` / `CLI_AND_DAEMON.md` — 按"功能模块"扁平切分。
- **本文档**: 综合两者 — README 是 index (multica 风格),pages/api/migration 三个子目录按"领域 × 用途"切 (paperclip 风格)。每个文件独立可读 (paperclip 强约束)。
