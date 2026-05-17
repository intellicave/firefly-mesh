# product-layer M5-M7 — Ideation

> **本 sprint = 上 sprint（2026-05-16 product-layer M1-M4）的延续**。前置阅读：
> - [2026-05-16 meta.md](2026-05-16-firefly-mesh-product-layer-meta.md) §3 反转 vs 保留决策
> - [2026-05-16 design.md](2026-05-16-firefly-mesh-product-layer-design.md) §10 后续模块预览
> - [2026-05-16 api.md](2026-05-16-firefly-mesh-product-layer-api.md) §5 后续模块设计预览
>
> 本 sprint 的 meta / decisions / red lines 全部沿用上 sprint，仅追加 sprint-specific 项。

---

## 1. 一句话定位

把 hub 现有 agents 表从"挂在 user 上"升级为"挂在 employee 上"（M5），同时补回 v0 的两块基础能力 —— **agent 行为边界（boundary）+ admin 主动签发 token（agent_tokens 半成品）**。

---

## 2. 为什么这一档

上 sprint 完成了员工/部门/项目的产品层。但 **hub 现有的 agent 还不知道员工是谁** —— `agents.owner_user_id` 直接挂 Better Auth user.id，没有 employee 关联。这导致：

- agent 发的消息无法显示"谁的员工身份发的"（dashboard 展示需要 title / dept / avatar）
- agent JWT 没有 scope claim → 不能做服务端权限边界
- admin 无法在 dashboard "为某个员工预签 token" → 必须每个员工自己跑 device pairing（小公司 OK，企业版痛）

这三块在 v0 都有，edge 重构时被砍。本 sprint 全部补回。

---

## 3. 模块清单

### M5 — Agents 重归属

- ALTER `agents` 加 4 列：`owner_employee_id` / `runtime_kind` / `runtime_meta` / `activated_at`
- `owner_user_id` 保留（fallback / hub 现有代码不需要立即改）
- `/api/agents/register`（hub 现有 endpoint）内部扩展：注册时查当前 user 在 tenant 的 employee 记录，自动填 `owner_employee_id`；接收可选的 `runtimeKind` / `runtimeMeta` body 字段；写 `activated_at = now`
- 对外契约保持不变（添加可选字段不算 breaking）

### M6 — Boundary（agent 权限边界）

- 新表 `representation_boundaries(id, agent_id, scopes JSON, updated_at)`
- 新 lib `lib/scopes.ts`：scope catalog（直接迁移 v0 的 10 个 scope 定义 + 工具函数）
- 新路由 `routes/boundaries.ts`：
  - `GET /api/boundaries/:agentId` — 任意 tenant 成员可读
  - `PUT /api/boundaries/:agentId` — owner/admin 可改；危险 scope（send_external_email / sign_contract）必须 admin 显式 enable
- `/api/agents/register` 同时创建 `representation_boundaries` 行（默认 scope 集）
- `lib/jwt.ts::signAgentJwt` 新增 `scopes` 参数（caller 查 db 后传入），JWT 中加 `scope` claim
- `verifyAgentJwt` 向后兼容：缺失 scope claim → 返回 defaultScopes()
- agent 调 hub 业务 endpoint 时，对应业务可用 `enforceScope(payload.scope, 'submit_task')` 做服务端检查（hub 现有 endpoint 不强制接入，后续 sprint 按需）

### M7 — Agent Tokens（半成品 / 企业版预备）

- 新表 `agent_tokens(id, org_id, employee_id, token_hash, agent_id?, status, expires_at, consumed_at?, revoked_at?, created_at, created_by)`
- 新路由 `routes/agent-tokens.ts`：
  - `POST /api/agent-tokens` — admin 签发（返回 plain token 一次，DB 只存 SHA-256 hash）
  - `GET /api/agent-tokens` — 列出当前 tenant 全部
  - `POST /api/agent-tokens/:id/regenerate` — 失效旧的 + 签新的
  - `DELETE /api/agent-tokens/:id/revoke`
- **client side 不消费**：本 sprint 不改 `/register` 接受 token 入参。device pairing 仍是唯一激活路径。
- 这是 V1.1 enterprise SSO 模式预备的"管理面"，未来 client side 加 `/api/agents/activate-by-token` 时再用

---

## 4. 用户故事

### 4.1 Alice 完成 agent 配对，dashboard 立刻显示"Alice (Senior Engineer, Eng) 的 alice-claude-desktop"

- Alice 跑 `firefly-mesh pair <code>`
- skill 调 `/api/agents/register` 上传 X3DH bundle
- hub 内部反查：tenant_id + user_id → employees 表 → 找到 Alice 的 employee_id
- agents 行写入 `owner_employee_id = Alice's employee.id`
- 同时 representation_boundaries 写入 defaultScopes
- skill 拿到 JWT（含 scope claim）

### 4.2 Carol（admin）调整 Alice agent 的权限边界

- Dashboard 进 `/me/devices?agentId=alice-claude-desktop` → 看到 scope 列表（10 项，分类显示）
- 默认开启的 6 项（绿色勾），危险的 2 项（红色锁），可选的 2 项（灰色待启用）
- Carol 勾选 "dispatch_task" → PUT /api/boundaries/:agentId → updated_at 更新
- 下次 Alice agent 调 `/api/tasks/dispatch` 时，hub 端 enforceScope 检查通过

### 4.3 Carol 预先为新员工 David 签发 token（企业 onboarding 流）

- Carol 进 Dashboard → "为 David 签 token" → POST /api/agent-tokens body `{ employeeId: david.id, expiresIn: '7d' }`
- 响应返回 `{ id, plainToken: 'ftk_...', expiresAt }` —— **plain token 仅这次返回**
- Carol 把 token 写信发给 David
- David 收到、未来用（client 侧消费 V1.1 才做）

---

## 5. 范围声明

**本 sleep run 内实现**：
- M5 schema + ALTER migration + agents.ts 内部 wiring
- M6 schema + lib/scopes.ts + routes/boundaries.ts + lib/jwt.ts 扩展（含向后兼容）
- M7 schema + routes/agent-tokens.ts（admin signing 端到端，client 不消费）
- e2e 测试覆盖 3 个模块

**本 sleep run 不做**：
- client 侧 `/api/agents/activate-by-token`（M7 后半段，V1.1）
- 对现有 hub 业务 endpoint（messages / a2a）强制接入 enforceScope（按需 sprint）
- 任何 web 层改造
- M8-M12 任何模块
- 部署（wrangler deploy / --remote）
- 现有生产 agents 的 owner_employee_id backfill 数据迁移（M2 改造时同步做）

---

## 6. 跟上 sprint 的衔接

| 上 sprint 产出 | 本 sprint 用到 |
|---|---|
| `employees` 表 | M5 反查 owner_employee_id |
| `orgGuard` 中间件 | M6 boundaries / M7 agent-tokens 全用 |
| `requireRole` 装饰器 | M6 PUT / M7 admin 端点 |
| `lib/employees.ts::syncEmployeeRole` | M7 创建 agent_tokens 时无需用（token 不影响 role）|
| `tenants.ts` 的 owner-employee bootstrap | M5 反查时确保至少 owner 永远有 employee 记录 |
| `lib/projects.ts` 状态机模式 | M7 token status 转移模仿（pending → consumed/revoked/expired） |

---

## 7. 跟 edge sprint 关系

**继续保留 D1-D8 全部技术决策**。本 sprint 不引入新依赖。

**新增设计选择**（不撞 D1-D8）：
- JWT scope claim 注入 → 复用 jose（hub 已有），无新依赖
- agent_tokens.token_hash 用 SHA-256 → 复用 crypto.subtle（Workers 内置）
- representation_boundaries.scopes → JSON 字符串列（D1 兼容）

---

## 8. 验收

### 8.1 本 sleep run（design + impl 全做）

- [ ] 8 份设计文档全部产出（meta / index / ideation / design / ui / api / plan / rules，按 2026-05-17 命名）
- [ ] migration 0006 + 0007 本地 apply 成功
- [ ] schema.ts 扩展 agents + 加 boundaries + 加 agentTokens
- [ ] lib/scopes.ts + lib/jwt.ts（scope claim 支持，向后兼容）+ 新 routes/boundaries.ts + routes/agent-tokens.ts
- [ ] agents.ts 内部 wiring（不改契约）
- [ ] e2e 覆盖：boundary CRUD / agent_token issuance lifecycle / scope claim 在 JWT 里 / agent 配对后 owner_employee_id 正确填
- [ ] 现有 e2e + 上 sprint product-layer.e2e 无回归
- [ ] typecheck pass
- [ ] 5 个 atomic commit（schema / scopes+jwt / boundaries route / agent-tokens route / agents wiring + tests / docs sync）

### 8.2 V1.0 GA

- [ ] M8-M12 全部实现（后续 sprint）
- [ ] services/web 搬迁
- [ ] 上线

---

## 9. 开放问题

继承上 sprint，本 sprint resolve 其中 1 个：

- ✅ Q3（agents.owner 改 employee）→ 本 sprint M5 实施

新增的：
- ⏳ Q7（admin 改 agent boundary 是否要 audit_log 记录）→ design.md 决定
- ⏳ Q8（agent_tokens 的 expiresIn 默认值）→ design.md 决定

---
