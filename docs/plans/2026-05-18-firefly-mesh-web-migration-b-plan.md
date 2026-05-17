# Web Migration B — Plan (pre-CEO approval)

> **状态**：仅设计，未执行。本 sprint 包含 ralph-loop 红线禁止的操作（部署 + 删 legacy/services/pwa），需 CEO 显式批准后才执行。
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

| 端点 | 估时 | 优先级 |
|---|---|---|
| GET `/api/agents`（tenant-wide list，给 org-graph 用）| 1h | 高 |
| POST `/api/employees/bulk-import`（multipart CSV）| 4h | 高 |
| POST `/api/knowledge/upload`（multipart file，触发解析+分块）| 6h | 中 |
| GET `/api/audit/threads` + GET `/api/audit/log`（读端）| 4h | 中 |
| GET `/api/org/graph`（聚合 employees+departments+projects+agents）| 2h | 低（客户端 fan-out 替代可接受）|
| POST `/api/agent-tokens/batch`（N 次合一）| 1h | 低 |
| GET `/api/onboarding/state`（替代客户端聚合）| 1h | 低 |

合计 ~19h（2.5 天）。**仅做高优先级 3 个**（~11h, 1.5 天）即可解锁 sprint A 的 50% 禁用 UI；中/低留 V1.1。

**红线突破**：动 hub 路由（增加端点，不动现有 6 路由对外契约）— 与 sprint A 红线一致，**不需要额外 CEO 批准**。

**验收**：
- 新端点都有 e2e test
- 5/5 hub e2e + 2 个新 suite（agents-list-tenant-wide + bulk-import）全绿
- typecheck 全绿

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

配置：
- `next.config.ts` 加 `export const runtime = 'edge'` 标记（或在每个 page.tsx）
- 加 build script: `npx @cloudflare/next-on-pages`
- 配置 `pages_build_output_dir = ".vercel/output/static"` 在 `wrangler.toml`

潜在问题：
- v0 dashboard 用到的 Node API（`fs`, `path`, `crypto.subtle` 兼容等）需要审
- next-intl 的 server component messages 在 edge runtime 是否工作（实测需要）
- React 19 + next 16 + next-on-pages 兼容性（next-on-pages 仍是 beta）

**🚨 CEO 批准点 2**：引入新 dep `@cloudflare/next-on-pages`。违反 "不引入新依赖" 红线。批准理由：
- 部署到 Cloudflare Pages 的官方推荐方式
- 替代方案（Vercel 部署）违反 hub 在 Cloudflare Workers 的架构一致性

**验收**：
- `npx @cloudflare/next-on-pages` 成功生成 .vercel/output
- 本地用 `wrangler pages dev .vercel/output/static` 跑起来
- 浏览器访问 localhost:8788 → 看到 dashboard

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

注意：
- Better Auth `trustedOrigins` 加 `https://app.firefly-mesh.com`
- hub CORS `origin: env.PWA_URL` 应能自动覆盖（PWA_URL 改 prod 后）

**🚨 CEO 批准点 3**：部署到 prod。违反 "不部署（wrangler deploy / --remote）" 红线。批准理由：
- 这是 sprint B 的最终目标
- 没部署 = 没用户能用 dashboard
- 此前所有迭代都为了 prod ready，部署是收尾

**验收**：
- `https://app.firefly-mesh.com` 可访问
- 注册 → 登录 → cookie 写入 `.firefly-mesh.com` domain
- /api/me 通过 rewrites 调 hub.firefly-mesh.com，cookie 正确传递
- GitHub OAuth callback 流程完整（这是 sprint A 留的 known risk）

## 5. B.4 — Sprint A 禁用 UI 恢复

按 sprint A AE1 表，配合 B.0 加补的端点，恢复禁用 UI：

| 禁用项 | 恢复条件 | 估时 |
|---|---|---|
| /onboarding/import banner | B.0 完成 bulk-import endpoint | 30m |
| /knowledge upload-dialog multipart | B.0 完成 knowledge/upload endpoint | 1h |
| /audit "Coming soon" | B.0 完成 audit read endpoints | 1h |
| /knowledge SSE indexing | 替换为 WS 连 hub `/ws` channel | 2h |
| /audit SSE Live | 同上 | 1h |
| /skills loaded tab | hub /api/skills/loaded（V2 推迟，不在 sprint B 范围）| - |
| /skills dry-run button | hub /api/skills/:id/dry-run（V2 推迟）| - |

SSE → WS 改造：
- `useEffect` 中替换 `new EventSource(...)` 为 `new WebSocket(...)`
- 订阅 channel name 通过 WS query string 传：`/ws?channel=knowledge.indexing.${docId}`
- Hub `/ws` 已就绪，只需 server-side router to broadcast on channel

**验收**：
- 5 个 UI 恢复完成（除 skills 2 个 V2 项）
- Sprint A AE1 banner 全部移除
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

**验收**：
- 7/7 playwright 场景通过（against prod hub.firefly-mesh.com）
- Lighthouse 评分 Performance ≥ 90, Accessibility ≥ 95
- 0 console.error 在 happy path

## 8. 总估时

| 阶段 | 估时 | CEO 批准点 |
|---|---|---|
| B.0 hub 加补端点 | 1.5 天 | 无（红线内）|
| B.1 删 v0 死代码 | 0.5 天 | 批准点 1（删 legacy/workspace 项）|
| B.2 Cloudflare Pages 适配 | 0.5 天 | 批准点 2（加新 dep）|
| B.3 部署 prod | 0.5 天 | 批准点 3（部署 + INTERNAL_SECRET 旋转）|
| B.4 UI 恢复 | 0.5 天 | 无 |
| B.5 删 pwa (如选 B) | 0.5 天 | 决策点 4（选 A 跳过）|
| B.6 E2E QA | 1 天 | 无 |
| **合计** | **4-4.5 天** | 3-4 个 CEO 批准点 |

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

## 11. 风险登记

| 风险 | 缓解 |
|---|---|
| `@cloudflare/next-on-pages` 仍 beta，next@16 + react@19 兼容性 | 先本地 build 验证；如挂选 Vercel 部署（违反架构一致性）|
| Better Auth cookieDomain `.firefly-mesh.com` 第一次配置 prod，OAuth callback 流程未实测 | B.3 后第一时间 smoke test OAuth；如挂用 sprint A 的 redirect_uri fallback |
| INTERNAL_SECRET 旋转后旧 dev placeholder 仍在 wrangler.toml [vars] — 优先级问题 | B.3 验证 `wrangler secret put` 真的覆盖 [vars]（应该会，secret 优先） |
| 删 v0 routes 后某 page.tsx 调用没被 sprint A grep 覆盖到 → 上线后 404 | B.6 playwright 全覆盖 |
| Playwright 找不到 element / 时机问题（async UI）| 标准 wait 模式，不接受 flaky |
| Lighthouse 性能不达标（next-on-pages cold start） | 接受 ≥ 80 也可上线，95 留 V1.1 优化 |

---

## 下一步：CEO 决策

请 CEO 在以下选项打勾：

- [ ] 批准 sprint B 全部 7 个 sub-step（含 4 个红线突破点）
- [ ] 批准 sprint B 但暂缓 B.5（pwa 保留为 marketing 站）
- [ ] 推迟 sprint B，先做某个独立任务（请说明）
- [ ] 其他：

批准后我会按 autodev 流水线产出剩余 7 个设计文档（meta / ideation / design / ui / api / rules / index），随后执行 B.0 → B.6。
