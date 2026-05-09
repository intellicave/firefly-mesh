# firefly-mesh edge — 文档地图（index）

> 这是 `2026-05-08-firefly-mesh-edge-*` 系列的入口。任何对 edge 项目的初次接触，从这里开始。
> 旧文档系列 `2026-04-28-firefly-mesh-*`（classic）已冻结，仅作历史参考。

---

## 1. 阅读路径

### 1.1 我是新加入团队的工程师 — 怎么入门？

按这个顺序读：

1. [ideation.md](2026-05-08-firefly-mesh-edge-ideation.md) — 我们要做什么、为谁做、什么不做
2. [meta.md](2026-05-08-firefly-mesh-edge-meta.md) — 跟 classic 什么关系、关键决策不可推翻
3. [design.md](2026-05-08-firefly-mesh-edge-design.md) — 架构、数据模型、关键流程
4. [plan.md](2026-05-08-firefly-mesh-edge-plan.md) — 当前在哪个 milestone、要做什么
5. [rules.md](2026-05-08-firefly-mesh-edge-rules.md) — 写代码前必读的红线

### 1.2 我是产品/运营/商业 — 怎么入门？

读 [ideation.md](2026-05-08-firefly-mesh-edge-ideation.md) 全篇 + [plan.md §3 时间总览](2026-05-08-firefly-mesh-edge-plan.md#3-时间总览) + [meta.md §3 资产盘点](2026-05-08-firefly-mesh-edge-meta.md#3-classic-资产盘点保留与丢弃)。

### 1.3 我是投资人/合作伙伴 — 5 分钟版

只读 [ideation.md §1-2、§7-8](2026-05-08-firefly-mesh-edge-ideation.md)。

---

## 2. 文档清单

| 文档 | 状态 | 篇幅 | 角色 |
|---|---|---|---|
| [meta.md](2026-05-08-firefly-mesh-edge-meta.md) | ✅ 完成 | ~300 行 | 项目元规则、决策记录、跟 classic 关系 |
| [ideation.md](2026-05-08-firefly-mesh-edge-ideation.md) | ✅ 完成 | ~250 行 | 用户画像、价值主张、商业模式 |
| [design.md](2026-05-08-firefly-mesh-edge-design.md) | ✅ 完成 | ~600 行 | 5 层架构、数据模型、流程、决策回顾 |
| [rules.md](2026-05-08-firefly-mesh-edge-rules.md) | ✅ 完成 | ~400 行 | 红线 + CI 检查清单 |
| [plan.md](2026-05-08-firefly-mesh-edge-plan.md) | ✅ 完成 | ~350 行 | M0-M8 milestone + 容量估算 |
| `2026-05-08-firefly-mesh-edge-api.md` | ⏳ TODO | - | 详细 endpoint + zod schema + 错误码 |
| `2026-05-08-firefly-mesh-edge-ui.md` | ⏳ TODO | - | 页面 wireframe + 配色 + 关键交互 |
| `2026-05-08-firefly-mesh-edge-oss-scan.md` | ⚠️ 跳过 | - | 选型 audit 已嵌入 meta.md §4 |

---

## 3. 关键决策速查（5 秒找到）

完整决策表见 [meta.md §5](2026-05-08-firefly-mesh-edge-meta.md#5-关键决策记录不可重新讨论)。这里只列**最常被新人质疑**的 5 条:

| 决策 | 选 | 弃 | 原因 |
|---|---|---|---|
| skill 连接 | HTTP 主路径（WebSocket 可选） | WebSocket 必须 / P2P | HTTP 兼容所有 runtime 含 MCP；WebSocket 是 OpenClaw 持久进程的实时升级 |
| PWA 连接 | WebSocket 长连接 | HTTP polling | 浏览器持久页面，实时 inbox；NAT 友好 |
| 拓扑 | All-through-hub + E2E 加密 | P2P 直连 | Signal 模型,离线兜底 |
| 数据栈 | Cloudflare 全栈(Workers/DO/D1) | Postgres/Node.js | 免费档 + 单 vendor |
| Auth | 自有账号 + 多 OAuth provider | 委托给 GitHub | 产品独立性 + 商业自由 |
| 加密层 | X3DH + AES-GCM(MVP)| 无加密 / Signal Protocol 完整版 | 隐私底线 + 工程量平衡 |

---

## 4. 关键架构图（一图速览）

```
┌────────────────────────────────────────────────────────────────────┐
│ ⑤ Experience  Astro PWA + Web Push + Email digest(Pages)         │
├────────────────────────────────────────────────────────────────────┤
│ ④ Identity    Better Auth(邮+多 OAuth) + Device Pairing           │
├────────────────────────────────────────────────────────────────────┤
│ ③ Protocol    A2A v1.0 wire + ed25519 sig                        │
│               skill→hub: HTTP(主) + WebSocket(可选)              │
│               pwa→hub:   WebSocket(主)                           │
├────────────────────────────────────────────────────────────────────┤
│ ② Delivery    Durable Object + WebSocket + X3DH + AES-256-GCM    │
│               + store-and-forward(D1 pending_messages, 14d TTL)   │
├────────────────────────────────────────────────────────────────────┤
│ ① Infra       Cloudflare Workers / DO / D1 / R2 / Pages          │
│               Self-host: Hono + Postgres + ws + Caddy             │
└────────────────────────────────────────────────────────────────────┘
```

---

## 5. 仓库结构（target）

```
firefly-mesh/
├── services/
│   ├── hub/             ← Cloudflare Workers + DO（生产）
│   ├── hub-selfhost/    ← Hono + ws + Postgres（self-host）
│   └── pwa/             ← Astro + React 岛屿
├── packages/
│   ├── client/          ← OpenClaw skill (agentskills.io v1)
│   ├── proto/           ← A2A wire format + ed25519 signing
│   ├── crypto/          ← X3DH + AES-256-GCM
│   └── shared/          ← types / errors / db schema
├── docs/
│   └── plans/           ← 当前文档系列
└── legacy/
    └── v0/              ← classic 代码归档
```

详见 [rules.md §3.1](2026-05-08-firefly-mesh-edge-rules.md#31-a1-仓库结构)。

---

## 6. milestone 当前状态

| Milestone | 状态 | 备注 |
|---|---|---|
| M0 工程初始化 | ⏳ 待开始 | 包含 classic → legacy 归档 |
| M1 身份层 | ⏳ 待开始 | Better Auth + 团队/邀请 |
| M2 投递层 | ⏳ 待开始 | DO + WebSocket + Hibernation |
| M3 加密层 | ⏳ 待开始 | X3DH + AES-GCM |
| M4 协议层 | ⏳ 待开始 | A2A wire 复用 classic |
| M5 体验层 | ⏳ 待开始 | PWA + Web Push |
| M6 P0 demo | ⏳ 待开始 | 5 分钟端到端 |
| M7 Hardening | ⏳ 待开始 | 负载/安全/docs |
| M8 V1.0 GA | ⏳ 待开始 | Stripe + 上线 |

详见 [plan.md §2](2026-05-08-firefly-mesh-edge-plan.md#2-milestone-详情)。

---

## 7. 跟 classic 的对照表

| classic 概念 | edge 对应 | 是否保留 |
|---|---|---|
| Next.js 16 全栈 | Cloudflare Workers + Astro PWA | 重写 |
| Postgres 17 + pgvector | Cloudflare D1 + Vectorize（V0.2） | 重写 |
| in-memory pub/sub → SSE | Durable Object + WebSocket | 重写 |
| `packages/web` Next dashboard | `services/pwa` Astro | 重写 |
| `packages/core/a2a/protocol.ts` | `packages/proto/a2a-wire.ts` | 直接 copy |
| `packages/core/a2a/signing.ts` | `packages/proto/signing.ts` | 直接 copy |
| `packages/core/a2a/broker.ts` | `services/hub/durable-objects/TenantHub.ts` | 概念保留,实现重写 |
| `packages/core/hitl/engine.ts` | `services/hub/hitl/engine.ts` | 概念保留,实现重写 |
| `packages/core/audit/log.ts` | `services/hub/audit/log.ts` | 概念保留,实现重写 |
| `packages/skill` | `packages/client` | 重写,但 SKILL.md 大部分可复用 |
| `packages/mcp` | `packages/client/mcp.ts`(同包) | 合并 |
| `packages/sdk` | `packages/proto`(部分) | 合并 |
| 21 表 schema | 9 表 schema | 重新设计 |
| 60+ 路由 | ~30 路由 | 重新设计 |
| Onboarding wizard CSV import | Device Pairing | 重做 |
| 自部署 docker compose(Next + Postgres) | docker compose(Hono + Postgres) | 重写 |

完整对照见 [meta.md §3](2026-05-08-firefly-mesh-edge-meta.md#3-classic-资产盘点保留与丢弃)。

---

## 8. 关键术语表

| 术语 | 定义 |
|---|---|
| **classic** | firefly-mesh 2026-04-28 ~ 2026-05-07 的版本，已冻结 |
| **edge** | firefly-mesh 2026-05-08 起的新版本（本系列） |
| **vibe coder** | 主用户画像：在家用、NAT 后、用 OpenClaw/Cursor 等 AI 工具的开发者 |
| **A2A** | Google Agent2Agent Protocol v1.0，agent 间通信标准 |
| **DO** | Cloudflare Durable Objects |
| **Hibernation API** | DO 的 idle 不计费机制 |
| **Device Pairing** | skill 用 OAuth Device Authorization 风格绑定到用户账号 |
| **X3DH** | Signal 的 Extended Triple Diffie-Hellman 密钥协商 |
| **OPK** | One-Time Pre-Key，X3DH 的一次性密钥 |
| **SPK** | Signed Pre-Key，X3DH 的中期密钥 |
| **IK** | Identity Key，agent 长期身份密钥 |
| **PWA** | Progressive Web App，Astro 部署到 Cloudflare Pages |
| **Tenant** | 团队（数据库表 `tenants`），多租户隔离单位 |

---

## 9. 怎么贡献？

### 9.1 修文档（任何人）

1. fork → 修改 `docs/plans/2026-05-08-firefly-mesh-edge-*.md`
2. PR → 标 `docs:` 前缀
3. tech lead review

### 9.2 改架构（需要决策）

1. 在 PR 描述里引用要改的文档章节
2. 明确：what / why / cost / alternatives 四段
3. 引用 [meta.md §5 决策表](2026-05-08-firefly-mesh-edge-meta.md#5-关键决策记录不可重新讨论)，确认是否撞了不可推翻的 D1-D8
4. 撞了 → 不接受
5. 没撞 → discussion → tech lead approve → merge

### 9.3 写代码（M0+）

1. 拿到分配的 ticket（对应 [plan.md](2026-05-08-firefly-mesh-edge-plan.md) 中的 acceptance criterion）
2. 创建 feature branch
3. 写代码必须遵守 [rules.md](2026-05-08-firefly-mesh-edge-rules.md)
4. PR → CI 全绿 + 1 个 reviewer approve → merge
5. 完成的 acceptance criterion 在 plan.md 标 `[x]`

---

## 10. 历史归档

| 文件 | 用途 | 是否仍引用 |
|---|---|---|
| [2026-04-28-firefly-mesh-meta.md](2026-04-28-firefly-mesh-meta.md) | classic meta | ❌ 不再加载 |
| [2026-04-28-firefly-mesh-ideation.md](2026-04-28-firefly-mesh-ideation.md) | classic 创意 | ❌ 不再加载 |
| [2026-04-28-firefly-mesh-design.md](2026-04-28-firefly-mesh-design.md) | classic 设计 | ❌ 不再加载 |
| [2026-04-28-firefly-mesh-rules.md](2026-04-28-firefly-mesh-rules.md) | classic 规则 | ❌ 不再加载 |
| [2026-04-28-firefly-mesh-plan.md](2026-04-28-firefly-mesh-plan.md) | classic 计划 | ❌ 不再加载 |
| [2026-04-28-firefly-mesh-api.md](2026-04-28-firefly-mesh-api.md) | classic API | ❌ 不再加载 |
| [2026-04-28-firefly-mesh-ui.md](2026-04-28-firefly-mesh-ui.md) | classic UI | ❌ 不再加载 |
| [2026-04-28-firefly-mesh-oss-scan.md](2026-04-28-firefly-mesh-oss-scan.md) | classic OSS audit | ❌ 不再加载 |
| [2026-04-28-firefly-mesh-index.md](2026-04-28-firefly-mesh-index.md) | classic 索引 | ❌ 不再加载 |

任何 sub-skill 调用、任何 PR 描述、任何 review 引用都**不应**指向上面这些文件。如果发现引用了，标 `legacy reference` 注释 + 创 issue 修复。

---

## 11. 仍未决（open questions）

写在这里的问题不阻挡 P0,但需要在 V1.0 前解决:

- 用户能否一个账号关联多个 OpenClaw 设备(同一台机器装两个 OpenClaw 实例)?如果可以,如何区分(device fingerprint?)
- HITL 状态机在 vibe coder 场景下是否过重?要不要简化(比如砍掉 escalate / block)?
- 多 thread 并行处理时,加密会话密钥是 thread 级还是 message 级?
- A2A `escalate` 类型在 vibe coder 场景下的语义(没有"上级"角色)
- Free tier 的 30 天 audit 限制怎么 enforce(物理删除还是 view 屏蔽)?
- Self-host 版怎么做"用户从 SaaS 迁移到自部署"?

这些放到下一份 `api.md` / `ui.md` 讨论时一并 resolve。
