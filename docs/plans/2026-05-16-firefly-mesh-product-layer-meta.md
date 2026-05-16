# firefly-mesh product-layer — Meta

> 本文件由 autodev pipeline 所有 sub-skill 在启动时加载。本 sprint 的所有技术决策、复用、升级动作必须遵守。
> 替代：本 sprint 的设计权威来自本系列文档 `2026-05-16-firefly-mesh-product-layer-*`。
> 关系：本 sprint **部分反转** edge sprint（`2026-05-08-firefly-mesh-edge-*`）的设计决策，详见 §3。

---

## 1. 项目代号与命名

| | edge（2026-05-08） | product-layer（2026-05-16，本系列） |
|---|---|---|
| 别名 | edge | product-layer |
| 文档系列前缀 | `2026-05-08-firefly-mesh-edge-*` | `2026-05-16-firefly-mesh-product-layer-*` |
| 状态 | 已完成 phase 1-5.9 + 部分 6（hub 加密通信底座生产稳定） | 进行中 |
| 关系 | **被本 sprint 部分反转 + 大部分保留** | 主线，**v0 产品语义 + edge 技术底座** |

**注意**：edge sprint 没有被"作废"。它的技术底座（D1 / DO / WS / 加密 / Better Auth / Hono）**继续作为本 sprint 的实现基础**。被反转的只有 §2.1 用户画像 + §3.2 schema 简化 + §8 反范围"不做企业级 IAM" 三处。

---

## 2. 本 sprint 的根因（为什么要反转部分 edge 决策）

### 2.1 edge sprint 的偏差

edge sprint 在 2026-05-08 决定从 v0 重写时，**同步把用户画像换成"vibe coder 个人/小团队"**。这个决策的直接后果：

- hub schema 从 21 表简化到 15 表（去掉 employees / departments / projects / knowledge / skills / tasks / boundary）
- hub API 从 60+ 路由简化到 ~30 路由
- v0 dashboard 整体归档到 `legacy/v0/packages/web/`，前端只剩极简 PWA

### 2.2 用户真实意图重新对齐（2026-05-16）

经过 2026-05-12 ~ 2026-05-15 的产品复盘 + 路演反馈，CEO 黄文轩明确：

> 产品是"公司里员工用 agent 协作"，不是 vibe coder 个人 agent mesh。
> hub 通信架构是对的，但产品层（员工/部门/项目）必须补回。

具体诉求：
- 保留 v0 的**产品语义**（employees / departments / projects / knowledge / skills / tasks）
- 保留 edge 的**技术架构**（D1 + DO + WS + E2E 加密 + Better Auth + Hono）
- 重新建模：agent 是员工的 runtime/设备，不是顶层实体

### 2.3 vibe coder 方向的归宿

vibe coder 个人/小团队**不是错的方向**，但它是 V2 的产品线延伸（小团队也是"小公司"，可以套用 employees+departments，只是 admin 和 employee 是同一个人）。

V1 起点必须是组织协作（v0 路径），V2 再向小团队/个人扩展。

---

## 3. 跟 edge sprint 的关系——决策反转 vs 决策保留

### 3.1 反转的决策（3 处）

| edge 决策 | 本 sprint 态度 | 反转理由 |
|---|---|---|
| §2.1 用户画像 = vibe coder 个人 | ❌ **反转** → 企业员工 + admin + auditor | CEO 路演后明确产品方向 |
| §3.2 21 表 → 9 表 | ❌ **反转** → 15 表 → ~26 表（补回 v0 产品层）| 上述用户画像变化的必然结果 |
| §8 反范围"不做企业级 IAM" | ⚠️ **部分反转** → 不做 Okta/Auth0 替代，但内置组织/部门/RBAC | 中小公司即开即用 |

### 3.2 保留的决策（D1-D8 全部）

| ID | 决策 | 本 sprint 态度 |
|---|---|---|
| D1 | 不做 P2P / mesh VPN | ✅ 保留 |
| D2 | 所有消息走 hub + E2E 加密 | ✅ 保留 |
| D3 | 全栈 Cloudflare（Workers + DO + D1 + R2 + Pages）| ✅ 保留 |
| D4 | Auth 自有账号 + 多 OAuth provider | ✅ 保留 |
| D5 | Device Pairing OAuth-style | ✅ 保留（与 v0 admin-issued agent_tokens 并存方案：V1 用 device pairing，V1.1 加 enterprise token）|
| D6 | A2A v1.0 wire format + skill HTTP 主 + pwa WebSocket | ✅ 保留 |
| D7 | Self-host Docker Compose（Hono + Postgres + ws）| ✅ 保留 |
| D8 | 不做 Double Ratchet（MVP 用 X3DH 单层）| ✅ 保留 |

### 3.3 不动的资产

- hub 现有 15 表全部保留
- hub 现有 6 路由文件全部保留（tenants / invitations / agents / messages / a2a / me）
- hub 现有中间件（auth / rateLimit）保留
- hub 现有 DO（TenantHub）保留
- hub 现有 cron lease 机制保留
- hub 现有 e2e.ts 测试保留

---

## 4. 技术选型 audit（沿用 edge + 新增）

| 类别 | 选型 | 备注 |
|---|---|---|
| Runtime | Cloudflare Workers (Hono) | edge 决定，保留 |
| DB | Cloudflare D1 (SQLite) | edge 决定，保留 |
| ORM | Drizzle | edge 决定，保留 |
| 实时通信 | DO + WebSocket Hibernation | edge 决定，保留 |
| Auth | Better Auth + D1 adapter | edge 决定，保留 |
| 加密 | X3DH + AES-GCM + ed25519 | edge 决定，保留 |
| ID 生成 | nanoid(21) | 沿用 hub 现有 |
| 时间序列化 | TEXT (ISO8601) for 业务表 / INTEGER (timestamp mode) for Better Auth 表 | 沿用 hub 现有 |
| JSON 字段 | TEXT + 应用层 JSON.parse | D1 无 JSONB |
| Vector 字段 | 推迟到 M8：先 TEXT 存序列化，V0.2 迁 BLOB + Vectorize | 新决策 |
| 测试 | wrangler dev local + miniflare D1 + e2e test | edge 沿用 |
| 部署 | wrangler deploy + D1 remote migrations | edge 沿用 |

无新依赖引入。

---

## 5. 本 sprint 的关键决策（不可重新讨论）

| ID | 决策 | 理由 |
|---|---|---|
| **P1** | v0 产品语义权威，hub 通信底座保留 | 见 §2 |
| **P2** | organizations 物理表复用 tenants（仅 API 层 alias） | 风险 < 收益；物理重命名 V1.1 再决 |
| **P3** | employees 与 memberships 并存（系统层 + 产品层） | 见 design.md §2.1 |
| **P4** | employees.role 5 角色（owner/admin/manager/employee/auditor） | v0 一致，已验证 |
| **P5** | agents 重归属（owner_user_id → owner_employee_id）推迟到 M5 sprint | 本 sprint 不动 agents 表 |
| **P6** | 首 sprint 实现范围 = M1+M2+M3+M4，其余只规划 | 控制 sleep run 范围 |
| **P7** | services/web 搬迁不在本 sprint | 等 hub 产品层补齐再搬 |
| **P8** | 不立即清理 packages/{core,mcp,sdk,skill} 空壳 + 根目录 PNG + .playwright-mcp（红线） | sleep 禁止额外破坏性操作 |

---

## 6. autodev sub-skill 调用顺序

| # | sub-skill | 产物 | 备注 |
|---|---|---|---|
| 1 | autodev-add (主调用) | 全 8 文档 | 本 sleep run |
| 2 | autodev-plan (内嵌) | plan.md 契约式 acceptance + 降阶扫描 | 已完成 |
| 3 | autodev-review (M2 / M3 / M4 实现后) | code review iterations | 实施期间触发 |
| 4 | autodev-verify (实现后) | typecheck + test + 冒烟 | 实施期间触发 |
| 5 | autodev-sync (sleep run 结束) | state.yaml 更新 + task status 更新 | 最后一步 |

**跳过 autodev-ideation 独立调用**：本 sprint 走 autodev-add 已嵌入完整 ideation。

**跳过 autodev-ui 独立调用**：本 sprint 主战场是后端，UI 推迟到 services/web 搬迁 sprint。

---

## 7. 跟上级 SaaS 项目 firefly 的关系

无变化。继承 edge meta §7：firefly = SaaS 闭源 / firefly-mesh = 开源引流。

upgrade-backlog 追加一条：
- date: 2026-05-16
- 选型变化：产品定位从"vibe coder 个人"回到"企业员工协作"
- why: 路演反馈 + CEO 重新对齐
- cost: small（之前 edge 工程量都保留作为底座）
- priority: P0
- status: in_progress

---

## 8. 不可破坏的产品边界（继承 edge 并修订）

无论后续怎么迭代，**本产品都不能变成**：

- ❌ 一个 LLM 推理平台
- ❌ 一个 IM 即时通讯
- ❌ 一个 Slack/Discord 替代
- ❌ ~~一个企业级 IAM（不抢 Okta/Auth0）~~ **修订**：不做完整 IAM 替代，但内置"够用"的组织/部门/RBAC，让中小公司即开即用
- ❌ 一个 git 协作工具
- ❌ 一个完整项目管理工具（不抢 Linear / Jira / Asana） **新增**：projects 表只为 agent 协作的协调单元

**本产品只做一件事**：让公司内员工通过 AI agent 跨员工/跨部门协作，端到端加密 + 推送可靠 + admin 管理友好。

---
