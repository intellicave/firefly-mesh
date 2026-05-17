# Web Migration A — API

> 本 sprint **零新 endpoint** — 只把 web 端 fetch 重定向到 hub 现有 ~80 endpoints。

## 1. 影响清单（hub 侧零变更）

| Hub endpoint | sprint A 是否被调用 | 备注 |
|---|---|---|
| 全部 hub 现有 ~80 endpoint | ✅ 是 | 通过 services/web 的 api() helper 调用 |
| 任何新 endpoint | ❌ 否 | 本 sprint 不加 |

## 2. Web → Hub endpoint 调用映射

v0 dashboard 14 页面通过 `api()` helper 调 `/api/*` 路径。Sprint A 改 api() base URL 后，自动调到 hub 的同名路径。对照表（覆盖了 hub 已实现的部分）：

| Page | v0 调用的 path | Hub 实现 |
|---|---|---|
| /onboarding/* | /api/onboarding/state, /api/me | ✅ /api/me, /api/organizations/me |
| /(dashboard)/organization | /api/employee, /api/department, /api/project | ✅ /api/employees, /api/departments, /api/projects |
| /(dashboard)/inbox | /api/a2a/inbox | ✅ /api/a2a-messages/inbox |
| /(dashboard)/knowledge | /api/knowledge, /api/knowledge/[id] | ✅ /api/knowledge, /api/knowledge/:id |
| /(dashboard)/skills | /api/skill, /api/skill/[id] | ✅ /api/skills, /api/skills/:id |
| /(dashboard)/audit | /api/audit/threads, /api/audit/log | ⚠️ M12 只做写入面，GET /api/audit 留 V1.1 |
| /(dashboard)/settings | /api/me, /api/token | ✅ /api/me, /api/agent-tokens |

⚠️ **路径不一致警告**：v0 用单数（`/api/employee` `/api/department` `/api/skill`），hub 用复数（`/api/employees` `/api/departments` `/api/skills`）。两层方案：

**方案 X1（推荐）**：sprint A 改 `api()` helper 的路径调用方加一层映射，把 v0 老路径映射到 hub 新路径。
**方案 X2**：在每个 page.tsx / hook 里手动改路径调用。

X1 路径映射示例：
```typescript
// services/web/lib/api-client.ts (扩展)
const PATH_MAP: Record<string, string> = {
  '/api/employee': '/api/employees',
  '/api/department': '/api/departments',
  '/api/skill': '/api/skills',
  '/api/a2a/inbox': '/api/a2a-messages/inbox',
  // ... etc
}
function rewritePath(path: string): string {
  for (const [old, neu] of Object.entries(PATH_MAP)) {
    if (path.startsWith(old)) return path.replace(old, neu)
  }
  return path
}
```

但这是隐式重写，调试痛苦。**最终采用方案 X2**（在每个调用方明确写 hub 路径），改起来量大但显式。本 sprint 因为 page.tsx 不动，所以 X2 = "什么都不做，等 X2 真正被触发时（调用 API 失败 404）再 case-by-case 修"。

**实际策略（sprint A 内）**：
- 改 api-client.ts + auth-client.ts 这两处 base URL
- 跑 dev，看哪些页面 404 → 列清单
- 推到 sprint A.5（本 sprint 子任务）case-by-case 修路径名

详细路径 diff 表见 design.md §A 后续补充（sprint A 实施期间生成）。

## 3. Better Auth endpoint

v0 用 `createAuthClient` 自动调 `/api/auth/sign-in/email` 等路径。hub 端 Better Auth 挂在同样的 `/api/auth/*` 路径。**base URL 一改完，全部直接工作**（已在 hub 原 6 路由阶段验证）。

## 4. WebSocket

v0 dashboard 是否有 WS 客户端？grep 一下：legacy/v0/packages/web 里搜 `WebSocket` 出现位置 — 主要在 inbox 实时刷新。改路径到 `wss://hub.firefly-mesh.com/ws` (prod) / `ws://localhost:8787/ws` (dev)。

**本 sprint 不强制接入 WS**（inbox 没有 WS 也能用 polling 看消息；ws 接入推 sprint B 或独立 sprint）。

## 5. Push notifications

v0 dashboard 是否有 Web Push 客户端？hub 已实现 `/api/me/push-subscription`。**本 sprint 不接**，sprint B 或独立。

## 6. 验证清单

sprint A 结束时：

- [ ] 启动 hub dev + web dev
- [ ] 浏览器打开 localhost:3000
- [ ] 访问 /signup → 注册成功（cookie 设到 localhost:8787）
- [ ] 跳转 /onboarding → 完成 create-org 流程
- [ ] 跳转 /(dashboard) → 看到主页骨架
- [ ] /(dashboard)/organization → 看到员工/部门/项目空状态
- [ ] 中英文切换按钮可用
- [ ] 列一份 "已发现 404 的页面 + path diff" → 转入 sprint A.5 / sprint B
