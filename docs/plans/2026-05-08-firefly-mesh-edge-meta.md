# firefly-mesh edge — autodev pipeline meta rules

> 本文件由 autodev pipeline 所有 sub-skill 在启动时加载。任何技术决策、复用、升级动作必须遵守。
> 来源：2026-05-08 重写决策（专家团队会议综合 8 角度评估后定稿）。
> 替代：2026-04-28 firefly-mesh classic meta（保留作为历史档案，不再被新 sub-skill 引用）。

---

## 1. 项目代号与命名

| | firefly-mesh classic（v0.1，2026-04-28） | firefly-mesh edge（v1.0，本系列） |
|---|---|---|
| 别名 | classic | edge |
| 文档系列前缀 | `2026-04-28-firefly-mesh-*` | `2026-05-08-firefly-mesh-edge-*` |
| 代码位置 | `packages/{web,core,sdk,skill,mcp}/` | `services/{hub,pwa}/` + `packages/{client,proto,crypto}/` |
| 状态 | M9 完成 → **冻结**，不再迭代 | 新主线 |
| 命运 | 归档保留 6 个月 → 删除 | 主分支 |

**对外品牌不变**：仍叫 firefly-mesh，仍 Apache 2.0，仍 GitHub 同一 repo（`intellicave/firefly-mesh`）。但**架构、技术栈、目标用户全部重写**。

> **不是 fork、不是子模块**。是同一个 GitHub repo 的下一个 major version。classic 代码挪到 `legacy/` 或专门 branch 保存,主分支 = edge。

---

## 2. 为什么重写——三个根因

### 2.1 用户画像变了

classic 设定的用户是 **企业 admin + 员工 + 部门**（W1 CEO 任务扩散 / W2 Cyberautonomy dogfooding）——它假设用户是"懂得部署 Postgres + 装 Docker + 做 onboarding wizard"的企业 ops。

edge 重新定位用户为 **vibe coder 个人 + 小团队（2-10 人）**：
- 在家用、在 NAT 后
- 无 CS 背景，不懂端口/IP/VPN
- 已经在 OpenClaw / Claude Code / Cursor 里干活
- 心理价位 ≤ $10/seat/月
- 懂的是 GitHub / Vercel / Stripe 这种 vibe coder 主流工具

这个用户画像差异是结构性的——整个产品形态都得重做。

### 2.2 网络模型错了

classic 的 A2A broker 是**hub 全量代理消息**（所有内容明文存 Postgres）。

后续社区调研（2026-05 期间）和专家会议明确两个事实：
1. **88% 的设备在 NAT 后**（Cloudflare 公开数据）—— P2P 直连失败率高
2. **Signal / WhatsApp / Telegram 都不是 P2P**——它们是**中心化 hub + 端到端加密**

classic 没做端到端加密 → 隐私拿不到 vibe coder 信任 → 商业模式天花板低。

**edge 的网络模型 = 两类客户端，两种连接方式，统一端到端加密**：
- **skill（packages/client）→ hub**：HTTP 主路径（所有 runtime 含 MCP 必须支持）+ WebSocket 可选优化（OpenClaw 等持久进程）
- **PWA（browser）→ hub**：WebSocket 长连接（实时 inbox 刷新）

详见 [design.md](2026-05-08-firefly-mesh-edge-design.md) §2。

### 2.3 部署模型重了

classic 假设"自部署 Docker Compose（Next.js + Postgres）"。这对企业合规友好，但对 vibe coder 是劝退——他们不会自部署。

edge 默认 **SaaS-first（Cloudflare 全栈）**：
- 用户视角：访问 firefly-mesh.com 注册即可
- 边际成本：每用户云费 $0.05-$0.15
- 自部署作为 Enterprise 选项（Docker Compose: Hono + Postgres + ws）

---

## 3. classic 资产盘点——保留与丢弃

### 3.1 保留（思想层面参考）

- HITL 双向状态机的语义（pending / approved / rejected / accepted）
- A2A 7 种消息类型（inform / sync / request / commit / handoff / escalate / block）
- 三层 KB / Skill 优先级（Personal > Department > Company）
- audit_log RULE 保护（append-only 在 DB 层）
- 多租户硬边界（每条 SQL 都 `eq(orgId, session.orgId)`）

### 3.2 直接丢弃（技术选型重做）

| classic | edge | 原因 |
|---|---|---|
| Next.js 16 App Router | Hono on Cloudflare Workers | runtime 换栈 |
| Postgres 17 + pgvector | D1 (SQLite) + Vectorize（KB 用） | 跟 Workers 同栈 |
| in-memory pub/sub → SSE | Durable Objects + WebSocket | 持久连接架构 |
| 21 表 schema | 7-9 表新 schema | 重新设计 |
| Better Auth on Node | Better Auth on Workers + D1 adapter | 适配 |
| HTTP A2A POST（hub 明文转发） | HTTP POST/GET（skill→hub 主路径）+ WebSocket（pwa→hub 实时）；hub 只存加密 blob | 双路分离 + E2E 加密 |
| Drizzle for Postgres | Drizzle for D1 | 适配 |
| ed25519 签名 only | ed25519 + X3DH + AES-256-GCM | E2E 加密新增 |
| Onboarding wizard CSV import | Device Pairing OAuth-style | 用户画像变 |

### 3.3 评估后保留的代码（少数）

- `packages/core/src/a2a/protocol.ts` 的 zod schema（A2A wire format 不变）
- `packages/core/src/a2a/signing.ts` 的 canonicalize 函数（RFC-8785）
- `packages/core/src/audit/log.ts` 的 audit 写入语义（不依赖 Postgres 的逻辑层）

这三处加起来 **< 200 行**，会被搬到 `packages/proto/`（与运行时无关的纯逻辑）。**其他全部重写**。

---

## 4. 技术选型 audit 表

| 类别 | classic | edge | audit 结论 |
|---|---|---|---|
| Runtime | Node.js (Next.js 16) | Cloudflare Workers (Hono) | 重选 — 边缘计算 + 全栈免费档 |
| DB | Postgres 17 + pgvector | Cloudflare D1 + Vectorize | 重选 — 跟 Workers 同栈 |
| 实时通信 | in-memory bus → SSE | Durable Objects + WebSocket Hibernation | 重选 — 持久连接 + idle 不计费 |
| Auth | Better Auth | Better Auth + D1 adapter | 沿用（库不变，adapter 换） |
| 邮件 | Resend | Resend | 沿用 |
| 推送 | 无 | Web Push（VAPID）+ PWA | 新增 |
| 加密签名 | ed25519 | ed25519 (`@noble/ed25519`) + canonicalize RFC-8785 + X25519 + AES-256-GCM (`@noble/ciphers`) | 加层 — 使用 @noble 族库，不自研密码学 |
| 前端 | Next.js SSR 同栈 | Astro + React 岛屿 + Pages | 重写 — PWA 必须 |
| Skill SDK | 自写 | 自写（agentskills.io v1） | 沿用 |
| Vector | pgvector | Cloudflare Vectorize（V0.2 KB 用） | 重选 |

每一个"重选"项必须在 [design.md](2026-05-08-firefly-mesh-edge-design.md) 决策章节写明 **rationale + 风险 + 退路**。

---

## 5. 关键决策记录（不可重新讨论）

以下决策已经在 2026-05-08 专家团队会议上做出。后续 sub-skill 调用、PR、code review 都**不可质疑**这些决策——可以质疑实施方式，不可质疑决策本身。

| ID | 决策 | rationale | 不允许提议的 |
|---|---|---|---|
| **D1** | 网络层不做 P2P / mesh VPN | NAT 88% 在后；用 WebSocket 反向连接彻底绕过 | 提议加 Tailscale / Cloudflare Mesh / WebRTC P2P |
| **D2** | 所有消息走 hub；端到端加密保证 hub 看不到内容 | Signal 模型；hub 是邮局不是窃听者 | 提议"hub 缓存明文以方便搜索" |
| **D3** | 全栈 Cloudflare（Workers + DO + D1 + R2 + Pages） | 单 vendor 简化 + 免费档撑 ~2000 用户 | 提议"双云冗余""加 AWS 备份" |
| **D4** | Auth 自有账号 + 多 OAuth provider | 产品独立性 + 商业化自由 | 提议"完全委托给 GitHub" |
| **D5** | Device Pairing OAuth-style，不允许 token 粘贴 | UX 一等公民 + token 安全 | 提议"用户复制粘贴 invite token" |
| **D6** | A2A v1.0 wire format 不变；skill→hub HTTP 主路径（所有 runtime 含 MCP 兼容）+ WebSocket 可选优化；pwa→hub WebSocket 长连接 | 协议生态 + MCP runtime P0 兼容 + 内部解耦 | 提议"自定义 wire 协议"或"skill 强依赖 WebSocket（排除 MCP 客户端）" |
| **D7** | 自部署 Docker Compose 用 Hono + Postgres + ws，**不**复用 Cloudflare 路径 | 自部署用户=企业，他们的需求是"标准开源栈" | 提议"自部署也跑 Workers"（Cloudflare 不开源） |
| **D8** | 不做 forward secrecy in MVP（Double Ratchet 留 P1） | X3DH 单层加密对 MVP 足够；Double Ratchet 工程量大 | 提议"必须 day-1 上 Signal Protocol 完整版" |

---

## 6. autodev sub-skill 调用顺序（edge 系列）

| # | sub-skill | 产物 | 备注 |
|---|---|---|---|
| 1 | autodev-ideation | [ideation.md](2026-05-08-firefly-mesh-edge-ideation.md) | 已完成（专家会议综合） |
| 2 | autodev-brainstorm | [design.md](2026-05-08-firefly-mesh-edge-design.md) | 已完成 |
| 3 | autodev-ui | `2026-05-08-firefly-mesh-edge-ui.md` | TODO 下一会话 |
| 4 | autodev-api | `2026-05-08-firefly-mesh-edge-api.md` | TODO 下一会话 |
| 5 | autodev-plan | [plan.md](2026-05-08-firefly-mesh-edge-plan.md) | 已完成 |
| 6 | autodev-rules | [rules.md](2026-05-08-firefly-mesh-edge-rules.md) | 已完成 |
| 7 | autodev-compress | [index.md](2026-05-08-firefly-mesh-edge-index.md) | 已完成 |

**跳过 oss-scan**：edge 的所有技术选型在专家会议 + 社区调研中已经做完，audit 信息直接嵌入 §4 表格。如果后续选型有变（比如发现新的 mesh 框架），再补 oss-scan。

---

## 7. 跟 firefly（上级 SaaS 项目）的关系

classic 的 meta 写过"firefly = SaaS 闭源 / firefly-mesh = 开源引流"。这条仍然成立——edge 不改变这个关系。

**edge 对 firefly 的反向价值**：
- WebSocket + Durable Objects 这个网络模型是 edge 的创新，firefly 后续如果做"团队版"可以参考
- E2E 加密层是 edge 全新引入，firefly 没做（因为 firefly 是企业内 SaaS，不需要对自己 SaaS 加密）

upgrade-backlog（在 firefly 仓库 `docs/upgrade-backlog.md`）追加一条：
- date: 2026-05-08
- 选型: hub 全量明文 → hub + 端到端加密
- why: vibe coder 信任建立必需；Signal 模型成熟
- cost: large（如果 firefly 要做团队版的话）
- priority: P2
- status: open

---

## 8. 不可破坏的产品边界

无论后续怎么迭代，**edge 都不能变成**：

- ❌ 一个 LLM 推理平台（不要做 generation API）
- ❌ 一个 IM 即时通讯（不要做 vibe coder 闲聊）
- ❌ 一个 Slack/Discord 替代（不抢这个市场）
- ❌ 一个企业级 IAM（不抢 Okta/Auth0）
- ❌ 一个 git 协作工具（不抢 GitHub）

**edge 只做一件事**：让 vibe coder 的 AI agent 跨用户协作，端到端加密 + 推送可靠 + 零网络配置。

任何超出这个范围的"想法"在 ideation 阶段就要被拒。
