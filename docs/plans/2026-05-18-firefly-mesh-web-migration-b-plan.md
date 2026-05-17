# Web Migration B — Plan (pre-CEO approval, v2 post-reviewer)

> **状态**：仅设计，未执行。本 sprint 包含 ralph-loop 红线禁止的操作（部署 + 删 legacy/services/pwa），需 CEO 显式批准后才执行。
>
> **v2 修订**：独立 reviewer 抓出 v1 plan 的 2 Critical + 4 High + 3 Medium 真实漏洞（B.4 WS 协议假设错 / B.4 audit 自相矛盾 / next.config standalone vs next-on-pages 冲突 / INTERNAL_SECRET 旋转窗口风险 / CF Pages cookie 转发未验证 等）。已修订到本版。
>
> **v3 修订**：v2 经第二轮 reviewer 又抓出 1 Critical（v2 引入的 "multipart upload" phantom — hub `POST /api/knowledge` 已存在 JSON-only，multipart 实际是 V1.1 范围）+ 3 High（B.6 pass count 5/7 vs 4/7 自相矛盾；B.3 CORS multi-origin 任务无 Option A/B 条件标注；B.0.1→B.3 之间 PWA_URL 过渡窗口未说明）+ 3 Medium。本版已全部修订。
>
> **依赖**：Sprint A 已 done（commit 7287099 → bec5a12 + hub round-3 加固 55e6021 → 4f48650）。Hub + web typecheck 全绿，6/6 hub e2e 全绿。

## 0. 范围

把 sprint A 留下的 "本地能跑但未部署" 状态推到 "Cloudflare Pages 上线 + v0 死代码清理 + cookieDomain prod"，让 dashboard 真正可被用户访问。

包含 5 个 sub-step，按依赖排序：

1. **B.0 hub 加补缺失端点**（前置；解锁 sprint A 禁用的 UI 功能）
2. **B.1 删 v0 死代码**（清理；删 43 routes + middleware + lib/middleware）
3. **B.2 Cloudflare Pages 适配**（next-on-pages + edge runtime）
4. **B.3 部署 + cookieDomain prod**（部署到 app.firefly-mesh.com）
5. **B.4 sprint A 禁用 UI 恢复**（SSE → WS、multipart upload、audit read 等）
6. **B.5 删 services/pwa**（彻底替换）
7. **B.6 端到端 QA**（playwright 完整用户旅程）

## 1. B.0 — Hub 加补缺失端点（按 sprint A AE1 表）

v2 修订：明确分 "Sprint B 必做高优" vs "V1.1 推迟"。原 v1 表里 "中/低" 混淆 + 11h 数学错位（reviewer M1），重写。

### Sprint B 必做（解锁 sprint A 禁用 UI 的最小集合）— v3 修订

v3 reviewer 抓出 v2 引入的 C1 phantom：hub `POST /api/knowledge` 已存在（JSON inline-only md/txt），sprint A 的 upload-dialog 已改成 inline 文本输入框，与 hub 现状一致 — **multipart upload 不是 sprint B 范围**，是 V1.1 Vectorize sprint 范围（涉及 pdf-parse + R2 + Vectorize 接入）。

| 端点 | 估时 | 解锁的 UI | 备注 |
|---|---|---|---|
| GET `/api/agents`（tenant-wide list，hub agentsRouter 加 `GET /`）| 1h hub + 0.5h UI un-ban | organization page agent 状态 badge（取代 sprint A `agents=[]` banner） | UI 在 sprint A 是 `agents: []` 硬编码 + Alert banner（lib/org-graph.ts）。sprint B 一并去掉硬编码 + banner |
| POST `/api/employees/bulk-import`（multipart CSV）| 4h hub + 0.5h UI un-ban | /onboarding/import 恢复（sprint A 已 Alert banner 禁用）| 真新端点；CSV 解析 + 行级 error report + dry-run/confirm 模式（参考 v0 实现） |
| **小计** | **6h（约 1 天）** | 2/5 sprint A 禁用 UI 恢复 |

### V1.1 / 独立 sprint 推迟（不在 sprint B 范围，v3 reviewer 明确）

| 端点 | 推迟原因 |
|---|---|
| **multipart file upload** for knowledge (pdf/docx/html) | V1.1 Vectorize sprint —— 需 pdf-parse + R2 binding + 重新设计 chunker。当前 inline md/txt 上传已工作 |
| GET `/api/audit/threads` + `/api/audit/log` | audit-read sprint 独立做（V1.1）|
| TenantHub channel-based pub/sub | sprint B 不做 SSE→WS 替换；channel 路由协议 V1.1 |
| GET `/api/org/graph`（聚合）| 客户端 fan-out 替代可接受（sprint A 已实现 lib/org-graph.ts）|
| POST `/api/agent-tokens/batch` | 客户端 N 次 POST 可接受（sprint A 已实现）|
| GET `/api/onboarding/state` | 客户端聚合可接受（sprint A lib/onboarding.ts）|

### V1.1 / audit-read sprint 推迟（不在 sprint B 范围）

| 端点 | 推迟原因 |
|---|---|
| GET `/api/audit/threads` + `/api/audit/log` | audit-read sprint 独立做（V1.1）|
| TenantHub channel-based pub/sub（C1 fix）| sprint B 不做 SSE→WS 替换；channel 路由协议 V1.1 |
| GET `/api/org/graph`（聚合）| 客户端 fan-out 替代可接受（sprint A 已实现 lib/org-graph.ts）|
| POST `/api/agent-tokens/batch` | 客户端 N 次 POST 可接受（sprint A 已实现）|
| GET `/api/onboarding/state` | 客户端聚合可接受（sprint A lib/onboarding.ts）|

**红线突破**：动 hub 路由（增加端点，不动现有 6 路由对外契约）— 与 sprint A 红线一致，**不需要额外 CEO 批准**。

**验收**（v3 round-3 reviewer H1 fix — count 从 3 改为 2，移除 multipart 残留）：
- 2 个新端点（agents tenant-wide / bulk-import）都有 e2e test
- 6/6 现有 hub e2e + 2 个新 suite 全绿
- typecheck 全绿
- 接下来 hub 需要 prod 部署 — 见 **B.0.1**

### B.0.1 — hub `wrangler deploy --remote`（reviewer M2 fix）

B.0 加完的 3 个新端点要让 sprint B 后续步骤（B.6 playwright e2e against prod）能用，必须先部署到 prod hub。

**🚨 CEO 批准点 0**：hub `wrangler deploy --remote`（部署到 hub.firefly-mesh.com）。和 web 部署是不同的 deploy 动作但同样属于"红线"范畴。批准理由：
- 这是 hub 端的 prod 部署，必须在 web 端 prod 部署之前完成
- 否则 web prod 用户调 multipart upload / bulk-import 会 404
- 部署内容仅是新加的端点 + 现有路由（hub 现有 6 路由对外契约不变）

**验收**：
- `hub.firefly-mesh.com/api/agents` 返回 401（未认证），不是 404
- `curl -F file=@small.csv https://hub.firefly-mesh.com/api/employees/bulk-import` 返回 401（已部署），不是 404

## 2. B.1 — 删 v0 死代码（红线突破）

删的对象：
- `services/web/app/api/*/route.ts` 43 个剩余 v0 routes（sprint A 已删 5 个 W15 例外）
- `services/web/lib/middleware/{withAuth,withScope,withSenderSignature,withOrgGuard,withRBAC}.ts`（5 个文件，仅被 v0 routes 用，删 routes 后死代码）
- `services/web/lib/middleware/{types,index}.ts`（同上）

不删（保留）：
- `app/api/health/route.ts`（如果是 Cloudflare Pages 健康检查需要）— 待 B.2 确定
- `app/api/well-known/agent-card.json/route.ts`（A2A 协议发现端点）

后续 dep 清理：
- `services/web/package.json` 移除 `@firefly-mesh/core` workspace dep
- `pnpm-workspace.yaml` 移除 `legacy/v0/packages/core`
- `services/web/next.config.ts` 移除 `transpilePackages: ["@firefly-mesh/core"]`（W8 / W14 推迟到此）

**🚨 CEO 批准点 1**：删除 legacy 派生文件 + workspace 调整。这违反 ralph-loop 红线 "不删 legacy/services/pwa/packages/ 任何文件"。批准理由：
- v0 routes 是 sprint A AC4 明确登记 "sprint B 删全部"
- 不删 ≠ 安全 — 这些 routes 仍指向 v0 Postgres，意外被调用会暴露另一份数据
- 删除是 sprint B 的核心目标之一

**验收**：
- `services/web/app/api/` 只剩 well-known + auth + health
- `grep -r "@firefly-mesh/core" services/web/` 零 hit
- `pnpm install` 正常
- `pnpm --filter @firefly-mesh/web typecheck` 全绿（没了 @firefly-mesh/core dep + transpilePackages 后没编译报错）
- 6/6 hub e2e 不回归（hub 端没动）

## 3. B.2 — Cloudflare Pages 适配

新增 dep：
- `@cloudflare/next-on-pages` (devDep)

配置（v2 修订 — reviewer H2 fix）：
- **删除** `next.config.ts` 中的 `output: "standalone"` 和 `outputFileTracingRoot`（这两个是 standalone-mode 专用配置，与 next-on-pages 不兼容；保留会导致 build 失败或产出 broken 输出）
- `next.config.ts` 加 `export const runtime = 'edge'` 标记（或在每个 page.tsx 加）
- 加 build script: `npx @cloudflare/next-on-pages`
- 配置 `pages_build_output_dir = ".vercel/output/static"` 在 `wrangler.toml`

**前置实测验证**：在动 next.config.ts 之前，先 `cd services/web && npx @cloudflare/next-on-pages --help`，确认 next-on-pages 对 next@16 + react@19 的 compat note。如有阻塞 issue，必须先解决再继续 B.2。

潜在问题：
- v0 dashboard 用到的 Node API（`fs`, `path`, `crypto.subtle` 兼容等）需要审
- next-intl 的 server component messages 在 edge runtime 是否工作（实测需要）
- React 19 + next 16 + next-on-pages 兼容性（next-on-pages 仍是 beta）

**🚨 CEO 批准点 2**：引入新 dep `@cloudflare/next-on-pages`。违反 "不引入新依赖" 红线。批准理由：
- 部署到 Cloudflare Pages 的官方推荐方式
- 替代方案（Vercel 部署）违反 hub 在 Cloudflare Workers 的架构一致性

**验收**：
- `services/web/next.config.ts` 不再含 `output: "standalone"` 或 `outputFileTracingRoot`
- `npx @cloudflare/next-on-pages` 成功生成 .vercel/output（exit 0 + 无 warning）
- 本地用 `wrangler pages dev .vercel/output/static` 跑起来
- 浏览器访问 localhost:8788 → 看到 dashboard
- /api/* 通过 next-on-pages 内部 rewrites 转到 hub（local mode 应等同 `next dev`）

## 4. B.3 — 部署 + cookieDomain prod

新增配置：
- 创建 Cloudflare Pages project: `firefly-mesh-app`
- 绑定 custom domain: `app.firefly-mesh.com`
- 环境变量 (Pages dashboard)：
  - `NEXT_PUBLIC_HUB_URL=https://hub.firefly-mesh.com`
  - `NEXT_PUBLIC_APP_URL=https://app.firefly-mesh.com`
- Hub 端 (`wrangler secret put`)：
  - `INTERNAL_SECRET=<32-byte random>` — 替换 dev placeholder（sprint A W13 强制要求）
  - `PWA_URL=https://app.firefly-mesh.com`
- Better Auth `cookieDomain: ".firefly-mesh.com"`（hub 端配置，第一次真的部署 prod）

**INTERNAL_SECRET 旋转窗口（v2 reviewer H3 fix）**：

⚠️ TenantHub 在 INTERNAL_SECRET 缺失或不匹配时 hard-fail（500/403）。生产 cutover 期间如果有 in-flight HITL 流程（pending approval 的 a2a-messages，正在 WS-deliver 的消息），rotate 期间会 403。

策略：
- 选 maintenance window（dev 期间通知 0 用户 → 推荐 launch 前先 rotate）
- 或接受 V1 traffic 低 → "in-flight 失败窗口约 1-2 分钟，可接受"
- **不要在用户活跃时间 rotate**

**CORS / trustedOrigins / cookie 跨子域（v2 reviewer H4 + v3 reviewer H2 fix）**：

⚠️ 当前 hub CORS `origin: env.PWA_URL` 是**单值字符串**。两个 path 分支：

**Option A（保留 pwa 营销站）**：需要支持两个 origin。
- 改 hub CORS 为 `origin: (origin) => [env.PWA_URL, env.MARKETING_URL].includes(origin) ? origin : null`（hub 代码改一处 + 加 MARKETING_URL binding）
- Better Auth `trustedOrigins` 必须含**两个** URL：`["https://app.firefly-mesh.com", "https://firefly-mesh.com"]`
- 部署前 hub `wrangler secret put MARKETING_URL https://firefly-mesh.com`

**Option B（删 pwa，web 接管 marketing）**：单 origin 就够，hub CORS 代码不动。
- `PWA_URL=https://app.firefly-mesh.com`（web 接管 root domain）
- Better Auth `trustedOrigins` 含一个 URL: `["https://app.firefly-mesh.com"]`
- 不动 hub CORS 代码

**v3 reviewer H3**: PWA_URL 过渡窗口（B.0.1 → B.3 之间）：

⚠️ B.0.1 部署 hub 后，hub.firefly-mesh.com 的 `PWA_URL` 仍是旧值（当前 prod `https://firefly-mesh.com`）。如果 DNS 在 B.3 之前指 `app.firefly-mesh.com` 到 Pages，那段时间 app 调 hub 全部 CORS 403。
- **必须**：DNS 指向 Pages 只能在 B.3 `wrangler secret put PWA_URL` 完成后切换
- B.0.1 不动 DNS，仅部署 hub 新端点

**Pages rewrites cookie 转发验证（v2 reviewer H4 fix）**：

⚠️ `next dev` 本地模式 rewrites 转发 Cookie 是 well-tested 的。但 `@cloudflare/next-on-pages` 在 CF 边缘节点的 rewrites 实现可能与 next dev 不同 —— **必须实测**。

B.3 验收必须含：
- 注册 → 登录后 → 浏览器 DevTools → 检查 `/api/me` 请求的 Cookie header 是否真到达 hub（用 hub 端 `wrangler tail` 实时观察）

注意：
- Better Auth `trustedOrigins` 加 `https://app.firefly-mesh.com`（+ `https://firefly-mesh.com` 如选 A）
- hub CORS 改为接受多 origin（见上）

**🚨 CEO 批准点 3**：部署到 prod。违反 "不部署（wrangler deploy / --remote）" 红线。批准理由：
- 这是 sprint B 的最终目标
- 没部署 = 没用户能用 dashboard
- 此前所有迭代都为了 prod ready，部署是收尾

**验收**：
- `https://app.firefly-mesh.com` 可访问
- 注册 → 登录 → cookie 写入 `.firefly-mesh.com` domain
- /api/me 通过 rewrites 调 hub.firefly-mesh.com，cookie 正确传递（**实测验证 hub 端真的收到 cookie，via wrangler tail**）
- GitHub OAuth callback 流程完整（这是 sprint A 留的 known risk）
- INTERNAL_SECRET rotation 完成 + 验证 TenantHub deliver 不 403

## 5. B.4 — Sprint A 禁用 UI 恢复（v2 大幅 descope）

v1 reviewer 抓出 C1 (WS channel 不存在 — 完全错的假设) + C2 (audit endpoints 自相矛盾)。v2 删除这两类 deliverable，sprint B 只恢复 hub 端 B.0 真有的功能。

### Sprint B 范围（2/7 sprint A 禁用 + organization banner 去除）— v3 修订

| 禁用项 | 恢复条件 | 估时 |
|---|---|---|
| /onboarding/import banner → CSV upload UI | B.0 完成 bulk-import endpoint | 30m |
| organization page `agents=[]` banner → 真 agent 状态 badge | B.0 完成 GET /api/agents | 30m |

合计 1h。

### Sprint B 不做 / 推迟（v3 reviewer 重整理）

| 禁用项 | 推迟原因 | 推迟到 |
|---|---|---|
| /knowledge multipart file upload (pdf/docx) | hub 当前只支持 inline md/txt JSON（已工作），多媒体上传需 V1.1 Vectorize sprint | V1.1 |
| /audit "Coming soon" | hub 无 audit read endpoint | audit-read sprint (V1.1) |
| /knowledge SSE indexing 改 WS | hub TenantHub /ws 是 agent:/user: tag 点对点投递，**不支持 channel pub/sub** | TenantHub channel sprint (V1.1) |
| /audit SSE Live 改 WS | 同上 | 同上 |
| /skills loaded tab + dry-run | hub V2 skill 执行引擎 | V2 |

**Sprint A AE1 banner / silent fail 项**：
- 2 恢复（bulk import + organization agents，sprint B 完成）
- 5 保留 banner（multipart upload, audit "Coming soon", 2 SSE silent fail, skills 2 项）— 这些 banner 准确反映"functionality 未到位"，不动

**验收**：
- 2 个 UI 恢复完成（bulk import + organization agents badge）
- sprint A AE1 banner 保留 5 项，不动
- 浏览器 console 无 unhandled error

## 6. B.5 — 删 services/pwa

`services/pwa/` 已不被任何东西引用：
- Sprint A 抢救的中文 messages 已直接 cp 到 `services/web/lib/messages/zh.ts`
- 营销页 `firefly-mesh.com` 仍是 Astro pwa；sprint B 决定：
  - 选项 A：保留 pwa 作为 marketing site
  - 选项 B：把 marketing 移到 web (Next.js + 同一域名)，删 pwa

**🚨 CEO 决策点 4**：选 A 还是 B？建议 **A**（marketing 留 pwa）— 营销页改造是独立 sprint。

**如果选 B**：
- 删 `services/pwa/`
- `pnpm-workspace.yaml` 移除
- DNS：`firefly-mesh.com` 指向 Pages 新部署（或 web 内部加 `/` landing route）

**如果选 A**：
- 这一步只做"确认 services/pwa 还在用，不删"
- 留 sprint go-live 评估营销页

## 7. B.6 — E2E QA

新增 `services/web/e2e/`（playwright）：

| 场景 | 测试名 |
|---|---|
| Carol 注册创公司 → 邀 Alice | `register-invite.spec.ts` |
| Alice 加入 → 配对 agent | `pair-agent.spec.ts` |
| Alice agent 发 inform 给 Bob | `a2a-inform.spec.ts` |
| Bob 收到 + approve request | `hitl-approve.spec.ts` |
| Carol 派任务 → Bob 提交 → Dave 审核 | `task-lifecycle.spec.ts` |
| Bob 上传知识库（multipart）→ 搜索 | `knowledge-upload-search.spec.ts` |
| Audit 页查会话历史 | `audit-thread-view.spec.ts` |

`pnpm --filter @firefly-mesh/web e2e` 运行所有场景。

**验收**（v3 修订 — reviewer H1 fix）：

5/7 场景必须通过：
- register-invite ✓
- pair-agent ✓（含验证 agent badge 显示真状态）
- a2a-inform ✓
- hitl-approve ✓
- task-lifecycle ✓

2/7 场景非必须通过（测试 banner 显示正确即可）：
- audit-thread-view：v1.1 audit-read sprint 才有真功能。本 sprint 仅测"Coming soon" banner 在 audit page 正确显示
- knowledge-upload-search：sprint A inline md/txt 已能 upload + search。Playwright 场景测 inline POST 路径（**不**测 multipart — 那是 V1.1）

合计：5/7 真通过 + 2/7 测 banner / inline path。

- Lighthouse 评分 **Performance ≥ 80**（goal ≥ 90，V1.1 优化到 95+），Accessibility ≥ 95
- 0 console.error 在 happy path

## 8. 总估时（v3 修订）

| 阶段 | 估时 | CEO 批准点 |
|---|---|---|
| B.0 hub 加补端点（2 个：agents list + bulk-import）| 1 天 | 无（红线内）|
| B.0.1 hub `wrangler deploy --remote` | 0.25 天 | 批准点 0（hub prod 部署） |
| B.1 删 v0 死代码 | 0.5 天 | 批准点 1（删 legacy/workspace 项）|
| B.2 Cloudflare Pages 适配 + 删 standalone | 0.5-1 天 | 批准点 2（加新 dep） |
| B.3 部署 prod + cookieDomain + INTERNAL_SECRET 旋转 + Option A 含 CORS multi-origin | 1 天 | 批准点 3（web prod 部署 + secret rotation） |
| B.4 UI 恢复（2 项：bulk import + organization agents badge）| 0.25 天 | 无 |
| B.5 删 pwa (如选 B) | 0.5 天 | 决策点 4（选 A 跳过）|
| B.6 E2E QA（5 必过 + 2 banner/inline 测）| 1 天 | 无 |
| **Option A 合计**（推荐）| **4.5-5 天** | 4 个 CEO 批准点 |
| **Option B 合计**（含删 pwa）| **5-5.5 天** | 4 个 CEO 批准点 + 决策点 4 |

v3 修订：v2 5-6 天 → v3 4.5-5.5 天（v2 误把 multipart upload 6h 列入 B.0，v3 移除 — 实际只需 agents list 1h + bulk-import 4h = 5h，B.0 从 1.5d 缩到 1d；B.4 从 multipart 改为 organization banner 去除，估时不变）。

## 9. 红线突破汇总

| Sprint A loop 红线 | Sprint B 突破 | 批准 |
|---|---|---|
| 不部署 | B.3 部署 prod | 必须批 |
| 不删 legacy/services/pwa/packages/ 任何文件 | B.1 + 可能 B.5 | 必须批 |
| 不动 hub 现有 6 路由对外契约 | B.0 加新路由，不动旧 6 路由 | 不冲突 |
| 不引入新依赖 | B.2 加 @cloudflare/next-on-pages | 需批 |

## 10. 与 sprint go-live 接口

完成 sprint B 后 → 进入 sprint go-live：
- Stripe Checkout + Webhook + billing schema
- 法律页（ToS / 隐私 / Cookie / 退款）
- Sentry + 告警监控
- 营销页改造（如 B.5 选 B）
- soft launch + 初批用户邀请

## 11. 风险登记（v3 扩充）

| 风险 | 缓解 |
|---|---|
| `@cloudflare/next-on-pages` 仍 beta，next@16 + react@19 兼容性 | B.2 前先本地 build 验证；如挂选 Vercel 部署（违反架构一致性）|
| Better Auth cookieDomain `.firefly-mesh.com` 第一次配置 prod，OAuth callback 流程未实测 | B.3 后第一时间 smoke test OAuth；如挂用 sprint A 的 redirect_uri fallback |
| INTERNAL_SECRET 旋转后旧 dev placeholder 仍在 wrangler.toml [vars] — 优先级问题 | B.3 验证 `wrangler secret put` 真的覆盖 [vars]（应该会，secret 优先） |
| **INTERNAL_SECRET 旋转期间 in-flight HITL 流程 403**（v2 reviewer H3） | 选 maintenance window 或接受 V1 低流量下短窗口失败 |
| **CF Pages rewrites 是否在 prod 转发 Cookie header 到 hub**（v2 reviewer H4） | B.3 必做 `wrangler tail` 实测验证，否则用户登录但 /api/me 返回 401 |
| **hub CORS 只允许单 origin，多子域（app + marketing）冲突**（v2 reviewer H4） | Option A 选 改 hub CORS 为函数返回多 origin（列入 B.3 任务）；Option B 选 — 单 origin 即可，不动 hub CORS |
| **PWA_URL 过渡窗口**（v3 reviewer H3）：B.0.1 部署 hub 后 prod PWA_URL 仍是旧值，DNS 早切就 CORS 403 | B.0.1 不动 DNS；DNS 切换严格在 B.3 `wrangler secret put PWA_URL` 之后 |
| 删 v0 routes 后某 page.tsx 调用没被 sprint A grep 覆盖到 → 上线后 404 | B.6 playwright 全覆盖 |
| Playwright 找不到 element / 时机问题（async UI）| 标准 wait 模式，不接受 flaky |
| Lighthouse 性能不达标（next-on-pages cold start） | 接受 ≥ 80 也可上线，90 是 goal，95 留 V1.1 优化 |
| **B.2 next.config standalone vs next-on-pages 冲突**（v2 reviewer H2） | B.2 任务含删 `output: "standalone"` + `outputFileTracingRoot` |
| **hub B.0 端点未部署 prod，web prod 用户 404**（v2 reviewer M2） | 加 B.0.1 hub deploy step，强制依赖 B.3 之前完成 |
| **multipart upload phantom**（v3 reviewer C1）：v2 误把 multipart 列为 sprint B 范围，实际是 V1.1 Vectorize | v3 移除 multipart 任务；inline md/txt 上传保持 sprint A 现状（已工作）|

---

## 下一步：CEO 决策

请 CEO 选择一项（默认推荐：**option A — B.5 keep pwa**）：

**Option A（推荐）**：
- [ ] 批准 sprint B = B.0 + B.0.1 + B.1 + B.2 + B.3 + B.4 + B.6（**B.5 跳过 — pwa 保留为 marketing 站**）
- 估时 **4.5-5 天**
- 含 4 批准点：B.0.1 hub deploy + B.1 删 legacy + B.2 新 dep + B.3 web prod deploy
- 含 hub CORS multi-origin 改动（要支持 app + marketing 两个域名）
- 不含：audit endpoints / SSE→WS / multipart upload（推迟到 V1.1 audit-read / TenantHub channel / Vectorize sprint）

**Option B**：
- [ ] 批准 sprint B + 含 B.5 删 services/pwa（marketing 移到 web 内 / 或单独 marketing 改造 sprint）
- 估时 **5-5.5 天**
- 不需要 hub CORS multi-origin（单 origin 即可）

**Option C**：
- [ ] 推迟 sprint B，先做：
  - 独立 TenantHub channel sprint（解锁 audit / SSE→WS V1.1）
  - 或 audit-read sprint
  - 或 Vectorize sprint（解锁 multipart upload + 真 vector 搜索）
  - 或营销页改造 sprint
  - 或其他：

批准 A/B 后我会按 autodev 流水线产出剩余 7 个设计文档（meta / ideation / design / ui / api / rules / index），随后执行 B.0 → B.6。
