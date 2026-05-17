# Web Migration A — API

> 本 sprint **零新 endpoint** — 只把 web 端 fetch 重定向到 hub 现有 ~80 endpoints，并显式禁用 hub 缺失的 ~10 个 endpoint 对应 UI。

## 1. 影响清单（hub 侧零变更）

| Hub endpoint | sprint A 是否被调用 | 备注 |
|---|---|---|
| 全部 hub 现有 ~80 endpoint | ✅ 是（部分用） | 通过 services/web 的 api() helper + 少数直接 fetch（multipart）调用，全部走 Next.js rewrites |
| 任何新 endpoint | ❌ 否 | 本 sprint 不加 |

## 2. 完整 v0 → hub 路径 diff 表（H1 fix，权威清单）

reviewer 第一版抓出 v0 用的 `/api/*` 路径与 hub 实际路径差异远不止 5-7 个。下面是**完整 20+ 行**清单，是 sprint A.9 执行依据。

| v0 path | hub path | 状态 | sprint A 处理 |
|---|---|---|---|
| /api/employee | /api/employees | rename | A.9 改调用方（grep + 替换）|
| /api/employee/{id} | /api/employees/{id} | rename | A.9 改调用方 |
| /api/employee/import | （hub 无）| missing | **AE1 禁用 banner** /onboarding/import 页面 |
| /api/department | /api/departments | rename | A.9 改调用方 |
| /api/department/{id} | /api/departments/{id} | rename | A.9 改调用方 |
| /api/skill | /api/skills | rename | A.9 改调用方 |
| /api/skill/{id} | /api/skills/{id} | rename | A.9 改调用方 |
| /api/skill/loaded | (hub 无) | missing | **AE1 禁用** loaded tab |
| /api/skill/{id}/dry-run | (hub 无) | missing | **AE1 隐藏 dry-run 按钮**（M9 P26：执行引擎 V2）|
| /api/a2a/inbox | /api/a2a-messages/inbox | rename | A.9 |
| /api/a2a/{id} | (hub 无 GET 单条 endpoint) | missing | inbox 详情视图改用 /api/a2a-messages?id={id} list filter（hub list 支持 id 过滤）|
| /api/a2a/{id}/approve | /api/a2a-messages/{id}/approve | rename | A.9 |
| /api/a2a/{id}/reject | /api/a2a-messages/{id}/reject | rename | A.9 |
| /api/a2a/{id}/accept | /api/a2a-messages/{id}/accept | rename | A.9 |
| /api/a2a/{id}/reject-receive | /api/a2a-messages/{id}/reject-receive | rename | A.9 |
| /api/task/{id}/review | /api/tasks/{id}/review | rename | A.9 |
| /api/task | /api/tasks | rename | A.9 |
| /api/org | /api/organizations/me | rename + 单数→/me | A.9 |
| /api/org/graph | (hub 无聚合 endpoint) | missing | A.9 改用客户端聚合：并发 /api/employees + /api/departments + /api/projects，前端拼装 graph |
| /api/token | /api/agent-tokens | rename | A.9 |
| /api/token/batch | (hub 无 batch) | missing | A.9 改用 N 次 /api/agent-tokens POST 循环 |
| /api/token/regenerate | /api/agent-tokens/{id}/regenerate | rename | A.9 |
| /api/boundary/{agentId} | /api/boundaries/{agentId} | rename | A.9 |
| /api/audit/threads | (hub 无 GET) | missing | **AE1 EmptyState** "审计读取端待 audit-read sprint" |
| /api/audit/log | (hub 无 GET) | missing | 同上 |
| /api/audit/threads/{id} | (hub 无 GET) | missing | 同上 |
| /api/onboarding/state | (hub 无) | missing | A.9 改用客户端聚合：/api/me + /api/organizations/me + /api/me/agents 拼装 onboarding 状态 |
| /api/knowledge/upload (multipart) | /api/knowledge POST (inline JSON) | mismatch | **AE1 禁用 multipart upload**；保留 inline md/txt 文本框 |
| /api/stream/{channel} (SSE) | (hub 无 SSE，未来 /ws WebSocket) | missing | **AE1 silent fail with console.warn**；sprint B 替换为 WS 客户端 |
| /api/projects | /api/projects | ok | 不动（路径已一致）|
| /api/me | /api/me | ok | 不动 |
| /api/me/agents | /api/me/agents | ok | 不动 |
| /api/me/push-subscription | /api/me/push-subscription | ok | 不动（v0 dashboard 没接，sprint B 视需补 UI）|

**汇总**：
- 14 个 **rename**（A.9 grep + 替换执行）
- 10 个 **missing**（A.9 AE1 禁用 UI 或客户端聚合替代）
- 4-5 个 **ok**（不动）
- 部分 missing（org/graph, audit/*, onboarding/state, employee/import, token/batch, multipart upload, SSE）需要 sprint B 或 V1.1 在 hub 加端点

## 3. Better Auth endpoint

v0 用 `createAuthClient` 自动调 `/api/auth/sign-in/email` 等路径。hub 端 Better Auth 挂在同样的 `/api/auth/*` 路径。

**rewrites 后的真实流向**（W2'）：
- 浏览器 → `localhost:3000/api/auth/sign-in/email` (same-origin)
- Next.js dev server `next.config.ts rewrites` → 代理到 `localhost:8787/api/auth/sign-in/email`
- hub Better Auth 处理 → set-cookie `firefly_auth=...; Domain=localhost; SameSite=Lax`
- 浏览器收到 set-cookie 写到 `localhost` domain（注意：rewrites 代理后浏览器看到的响应来自 `localhost:3000`，所以 cookie domain = localhost：3000 视角 → 实际 cookie 写在 `localhost` host → 后续 `/api/auth/get-session` 自动带 cookie）

**关键验证（A.10 smoke test 必跑）**：
- `/api/auth/sign-up/email` → 200 + cookie 写入
- `/api/auth/get-session` → 200 + 返回 session（说明 cookie 被带上）
- `/api/me` → 200 + 返回 employee 数据（说明走 rewrites 也能带 cookie 到 hub）

**OAuth 流程**（GitHub / Google）：
- 浏览器 → `/api/auth/sign-in/github` → rewrites → hub 重定向到 `https://github.com/login/oauth/authorize?redirect_uri=http://localhost:8787/api/auth/callback/github`
- 用户授权 → GitHub 跳转回 `localhost:8787/api/auth/callback/github`（**绕开 next.js**）→ hub 处理 callback + 设 cookie + 重定向回应用
- **问题**：hub 设的 cookie domain = `localhost`（同主机不同端口），浏览器在 `localhost:3000` 也能读 → **应该工作**
- A.10 smoke test 必验证：能完成 GitHub OAuth 流程并保持登录

**fallback 方案**：如果 OAuth callback 设的 cookie 因端口差异在 dashboard 读不到 → sprint A 加 GitHub OAuth app 的 redirect_uri 临时配置成 `localhost:3000/api/auth/callback/github`（通过 rewrites 转回 hub）。这是已知的边角，记录到 risks。

## 4. WebSocket

v0 dashboard 是否有 WS 客户端？grep 一下：legacy/v0/packages/web 里搜 `WebSocket` 出现位置 — 主要在 inbox 实时刷新。改路径到 `wss://hub.firefly-mesh.com/ws` (prod) / `ws://localhost:8787/ws` (dev)。

**本 sprint 不强制接入 WS**（inbox 没有 WS 也能用 polling 看消息；ws 接入推 sprint B 或独立 sprint）。inbox page.tsx 里的 `new WebSocket(...)` 实例化可保留，连失败 silent fail。

## 5. SSE EventSource（C3 fix）

v0 dashboard 多页用 `new EventSource('/api/stream/...')` 做 live 更新（audit / knowledge indexing）。hub 无 SSE 端点。

**处理**（AE1）：
- 保留 EventSource 实例化代码（不删，sprint B 改 WS 时还要用同结构）
- 包 try/catch + onerror 显示 `console.warn('SSE not supported in sprint A — will use WS in sprint B')`
- UI 上 "Live" 绿点改为静态 "Indexing..." / "Audit log syncing..." 文案
- 不要让连接失败显示红错 toast / alert

## 6. Push notifications

v0 dashboard 是否有 Web Push 客户端？hub 已实现 `/api/me/push-subscription`。**本 sprint 不接**，sprint B 或独立 push UI sprint。

## 7. multipart upload（C2 fix）

3 个直接 fetch（不走 api() helper）：
1. `components/knowledge/upload-dialog.tsx:60` — multipart 上传知识库文档
2. `components/knowledge/upload-dialog.tsx:207` — JSON GET department 列表
3. `app/onboarding/import/page.tsx:39` — multipart CSV 员工导入

**rewrites 后 #2 (JSON GET department) 自动工作**（相对路径 + rewrites + hub 有 /api/departments，A.9 改路径名后即可）。

**#1 + #3 multipart 调用**：hub 端点未实现（design §4 C2-1 + AE1）。**禁用 banner**：
- /onboarding/import 顶部加 `<Alert variant="warning">` "员工批量导入将在 sprint B 上线"
- /(dashboard)/knowledge 的 upload-dialog 改成 inline 文本框（hub /api/knowledge POST 接 inline md/txt）

## 8. 验证清单

sprint A 结束时：

- [ ] 启动 hub dev + web dev
- [ ] 浏览器打开 localhost:3000
- [ ] **app/page.tsx 客户端 gate 正确**：未登录 → /login，已登录无 agent → /onboarding，已登录有 agent → /inbox
- [ ] 访问 /signup → 注册成功（cookie 设到 localhost domain，浏览器后续请求自动带）
- [ ] /api/me 返回 200（rewrites + cookie 都工作）
- [ ] GitHub OAuth 流程能完成并保持登录（OAuth callback fallback 已知边角）
- [ ] 跳转 /onboarding → 完成 create-org 流程（路径 rename 已修）
- [ ] 跳转 /(dashboard) → 看到主页骨架
- [ ] /(dashboard)/organization → 看到员工/部门/项目空状态（客户端聚合替代 org/graph）
- [ ] /(dashboard)/audit → 看到 EmptyState "Coming soon"
- [ ] /(dashboard)/knowledge → 看到 inline 文本输入框（multipart upload 已禁用）
- [ ] /(dashboard)/skills → dry-run 按钮 disabled + loaded tab 隐藏
- [ ] /onboarding/import → 看到 banner "员工批量导入将在 sprint B 上线"
- [ ] 中英文切换按钮可用（next-intl）
- [ ] grep `/api/(employee|department|skill|task|org|token|boundary|a2a)([/?'\"]|$)` services/web/ 应零 hit（除非命中新路径）
- [ ] 6 个 hub e2e 全部不回归
