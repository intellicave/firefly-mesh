<div align="center">

# firefly-mesh

**自带 agent，组织我们来给。**

为任何 agent 运行时打造的开源组织化底座。
让 OpenClaw、Hermes、Claude Code、Cursor 或任意 MCP 兼容 agent
成为真实组织里的真实同事 —— 拥有员工、部门、任务、A2A 消息、共享知识、人在回路审批。

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24-43853d?logo=node.js)](package.json)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D10-f69220?logo=pnpm&logoColor=white)](pnpm-workspace.yaml)
[![A2A v1.2](https://img.shields.io/badge/protocol-Google_A2A_v1.2-4285F4)](docs/plans/2026-04-28-firefly-mesh-design.md)
[![agentskills.io v1](https://img.shields.io/badge/spec-agentskills.io_v1-7c3aed)](packages/skill/SKILL.md)
[![Status](https://img.shields.io/badge/status-alpha-orange)](docs/plans/2026-04-28-firefly-mesh-plan.md)

[文档](#文档) · [快速开始](#快速开始) · [架构](#架构) · [路线图](#路线图) · [贡献](#贡献)

[English](README.md) · **简体中文**

</div>

---

## firefly-mesh 是什么？

今天，每个 agent 框架 —— OpenClaw、Hermes Agent、Claude Code、Cursor、Claude Desktop、自研 MCP server —— 解决的都是**单 agent 问题**。它们各自给一个人一个强大的 agent。

但**组织不靠个体运转，组织靠团队 —— 共享上下文、共享规则、共享问责。**

**firefly-mesh 就是把一群独立 agent 变成一个组织的底座。**

它提供四个原语，是任何单 agent 框架都不掌握的：

- **🏢 组织结构** —— 员工、部门、角色，以及它们之间的强类型边界
- **📡 Agent-to-Agent (A2A) 消息** —— 兼容 Google A2A v1.2 协议，ed25519 签名，每条消息可挂 HITL 审批闸门
- **🧠 三层共享知识 + Skill** —— Personal > Department > Company 优先级合并，RAG 检索 + agentskills.io 兼容打包
- **✅ 人在回路问责** —— 每一次跨员工动作都被门控、被签名、被 append-only 审计

你出 agent，我们出组织。

---

## 为什么要做这个

| 场景 | 单 agent 框架的做法 | firefly-mesh 多干了什么 |
|---|---|---|
| CEO 要协调 7 位同事完成 Q3 计划 | 一个 agent 在长上下文里硬扛整个 Q3 计划 | LLM 把任务拆成 7 个子任务，按部门 / 角色路由到对应员工的 agent，跟踪进度，审计每一次 handoff |
| 销售 agent 要找工程团队帮忙 | agent 给人发邮件然后等 | 发一条 `request` 类型 A2A 消息 → 工程经理收件箱 → 一键审批 → 整条 thread 留痕 |
| 每个员工都要从零训自己的 agent | 技能在个人手里，重复、脆弱 | Company / Department / Personal 三层 skill，自动按角色合并，装一个 skill 包就有一切 |
| 团队不知道 agent 们在干什么 | 日志散落在各个运行时里 | 单一组织级 audit feed，append-only，数据库层 RULE 强制保护 |
| 每个框架都有自己的接入面 | 选定一家就锁死 | 协议优先：A2A v1.2 + agentskills.io v1 + MCP —— 装一个 skill，任何运行时都得到同样的同事体验 |

**不需要换掉你的 agent。** Skill 装进你现有的运行时，不替代它。

---

## 功能

- **🏢 多租户组织 + 部门 + 角色** —— owner / admin / manager / employee / auditor。组织边界在 SQL 层强约束（每条查询都带 `eq(orgId, session.orgId)`）。
- **🔐 双认证模式：Better Auth Cookie（人）+ ed25519 签名 JWT（agent）** —— 同一套路由，认证模式自动识别。
- **📨 Google A2A v1.2 消息** —— 7 种消息类型（inform / sync / request / commit / handoff / escalate / block），ed25519 签名 + RFC-8785 规范化 JSON，发送侧 + 接收侧都可挂 HITL。
- **🤝 HITL 状态机** —— 审批列双向流转，**仅由** `core/hitl/engine.ts` 修改，状态图被代码而非约定锁死。
- **🧠 三层 KB + RAG** —— Markdown 感知语义切片，voyage-3-large 嵌入（1024 维），pgvector HNSW 余弦检索，scope OR 在 SQL 层（不靠后过滤 —— 边界可审计）。
- **⚡ Skill 注册表 + 优先级合并** —— Personal > Department > Company 一次 SQL 解决；agentskills.io v1 manifest 格式。
- **📋 Onboarding 向导** —— 4 步流程：创建组织 → CSV 导入员工（预览 + 确认）→ 一次性 agent token 批量发放 → 完成。Token 仅显示一次。
- **📊 Audit 时间线 UI** —— Threads 视图 + 原始日志流，SSE 实时更新，CSV 导出供合规取证。
- **🛰️ 实时 SSE** —— `inbox.{employeeId}`、`audit.org.{orgId}`、`org.graph.{orgId}`、`knowledge.indexing.{docId}` 等通道，每通道独立 ACL。
- **🚫 服务端无 ToolLoopAgent** —— 服务端只跑无状态的 `generateText` / `generateObject` / `embedMany`。Agent 运行时活在**你的** OpenClaw / Hermes / Cursor 进程里。我们托管组织，你托管大脑。

---

## 快速开始

### 1. Docker Compose 自托管（5 分钟）

```bash
git clone https://github.com/intellicave/firefly-mesh.git
cd firefly-mesh/deploy/docker-compose

cp .env.example .env
# 必填环境变量：
#   BETTER_AUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
#   AI_GATEWAY_API_KEY=vck_...   （从 vercel.com/dashboard/ai/gateway 获取）
#   POSTGRES_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(16).toString('base64url'))")

docker compose up -d
```

打开 **http://localhost:3000** → 注册账号 → onboarding 向导带你走完剩下的步骤。

### 2. 把 agent 接入组织

任何 agentskills.io 兼容运行时一行命令接入：

```bash
# OpenClaw
openclaw skill install @firefly-mesh/skill

# Hermes Agent
hermes skill add @firefly-mesh/skill

# Claude Code（或任何 agentskills.io v1 运行时）
claude skill install @firefly-mesh/skill

# 仅支持 MCP 的运行时（Cursor、Claude Desktop、自研）
npm install -g @firefly-mesh/mcp
# 在你的 mcp.json 里加：
#   "firefly-mesh": {
#     "command": "firefly-mesh-mcp",
#     "env": { "FIREFLY_MESH_BASE_URL": "...", "FIREFLY_MESH_TOKEN": "..." }
#   }
```

把管理员发给你的一次性 token 粘贴进去，你的 agent 就成了同事。Host LLM 拿到这些工具：

| Tool | 描述 |
|---|---|
| `firefly.task.dispatch` | 提一个高层目标；服务端 LLM 拆成 2–7 个子任务，自动路由到合适的人 |
| `firefly.task.list` / `submit` | 读取分配给你的任务，提交工作产出 |
| `firefly.a2a.send` / `inbox` | 在 agent 之间发送强类型消息；读收件箱 |
| `firefly.a2a.approve` / `accept` | 发送侧批准待发消息；接收侧接受请求 |
| `firefly.skill.loaded` | 列出对你生效的组织 skill（Personal > Department > Company 合并） |
| `firefly.kb.search` | 跨 Company / Department / Personal 文档的 RAG 检索 |

### 3. 本地开发

```bash
pnpm install
pnpm --filter @firefly-mesh/core migrate   # 跑 drizzle 迁移 + post-migrate RULE
pnpm dev                                    # 在 :3000 跑 next dev
pnpm typecheck                              # 5 个包全过
```

---

## 架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        你的运行时                                    │
│  ┌───────────┐  ┌──────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ OpenClaw  │  │ Hermes   │  │ Claude Code  │  │ Cursor / MCP   │  │
│  └─────┬─────┘  └────┬─────┘  └──────┬───────┘  └───────┬────────┘  │
│        └────────────┬├──────────────┬┘                  │           │
│                     ▼▼              ▼                   ▼           │
│              @firefly-mesh/skill              @firefly-mesh/mcp     │
│              (agentskills.io v1)              (MCP server)          │
└─────────────────────┼─────────────────────────────────┼─────────────┘
                      │  HTTPS + ed25519 签名的 A2A      │
                      │  Bearer JWT (agent)              │
                      ▼                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       firefly-mesh server                           │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  packages/web — Next.js 16 App Router                       │    │
│  │  • 30+ HTTP 路由  • SSE 通道  • shadcn/ui 仪表盘             │    │
│  │  • 5 个中间件 HOF (Auth / OrgGuard / RBAC / Scope / Sig)    │    │
│  └────────────────────────────┬────────────────────────────────┘    │
│                               │                                     │
│  ┌────────────────────────────▼────────────────────────────────┐    │
│  │  packages/core — 服务端业务逻辑                              │    │
│  │  • Drizzle schema (21 张表)                                 │    │
│  │  • A2A broker + ed25519 签 / 验 + 规范化 JSON                │    │
│  │  • HITL 状态机（唯一审批列写者）                             │    │
│  │  • 任务 dispatcher（LLM 拆解 + 部门 / 角色路由）             │    │
│  │  • KB pipeline（解析 → 切片 → 嵌入 → 检索）                 │    │
│  │  • Skill loader（Personal > Department > Company 合并）     │    │
│  │  • Better Auth + agent JWT (HS256)                          │    │
│  │  • Audit log（DB 层 RULE 保护，append-only）                │    │
│  │  • 内存事件总线 → SSE                                        │    │
│  └────────────────────────────┬────────────────────────────────┘    │
└────────────────────────────────┼────────────────────────────────────┘
                                 │
                  ┌──────────────▼───────────────┐
                  │  Postgres 17 + pgvector      │
                  │  • 21 张表，HNSW 余弦索引    │
                  │  • RULE 阻止 audit_log 上的  │
                  │    UPDATE/DELETE             │
                  └──────────────────────────────┘
```

### 几个值得注意的设计选择

- **BYO-agent —— 服务端没有 `ToolLoopAgent`。** 组织是底座，不是运行时。我们只做 `generateText` / `generateObject` / `embedMany`。这条规则（R7）被硬编码进规则文档，防止漂移。
- **Audit log 在数据库层 RULE 保护。** 没有任何服务代码路径能 `UPDATE` 或 `DELETE` 一条审计记录，连 bug 也不行。合规姿态是**结构性的**，不是流程性的。
- **HITL 状态变更过单一函数。** `core/hitl/engine.ts` 是审批列的唯一写者。状态图本地可推。
- **多租户边界在每条 WHERE 子句里。** 每条查询都从 `eq(orgId, session.orgId)` 开始。不靠 row-level security 这种"应该"过滤的把戏 —— SQL 自身就不返回跨租户行。
- **Skill 优先级一次 SQL 解决。** Personal > Department > Company 不是在代码里多次查询合并，是单次确定性求解，审计可重放。

完整设计文档见 [docs/plans/2026-04-28-firefly-mesh-design.md](docs/plans/2026-04-28-firefly-mesh-design.md)。

---

## 包

这是一个 pnpm monorepo。每个包都有自己的 README，独立的发布节奏。

| 包 | 描述 | 发布状态 |
|---|---|---|
| [`@firefly-mesh/core`](packages/core) | 服务端业务逻辑库（DB schema、A2A broker、HITL 引擎、任务 dispatcher、KB pipeline、skill loader）。无 HTTP。 | private |
| [`@firefly-mesh/web`](packages/web) | Next.js 16 App Router 服务 + 仪表盘 UI。可部署的本体。 | private |
| [`@firefly-mesh/sdk`](packages/sdk) | 强类型 HTTP client + zod schema。给 skill / mcp / 第三方开发者复用。 | npm（计划中）|
| [`@firefly-mesh/skill`](packages/skill) | agentskills.io v1 包 —— 装在任何兼容运行时里。 | npm（计划中）|
| [`@firefly-mesh/mcp`](packages/mcp) | MCP stdio server，把同一组工具暴露给 Cursor / Claude Desktop 等。 | npm（计划中）|

---

## 应用场景

- **分布式 Q3 规划。** CEO 提一段话级别的目标，LLM 拆成 5–7 子任务，每条进对应负责人的收件箱，全程签名 + 审计。
- **跨团队 handoff。** 销售 agent 找研发要一次方案验证 —— 发一条 `request`，研发经理一键批准，整条 thread 保留供以后复盘。
- **合规级自治。** 每一次跨员工动作都被发起 agent 签名 + append-only 审计。审计员有组织级 feed + 单 thread CSV 导出。
- **有角色感的知识。** 销售看销售部门文档；新员工看公司级 playbook；每个人看自己的笔记 —— 不需要谁去手工配每一份文件的权限。
- **Skill 入职。** 新员工到岗 → 一个 token 激活 agent → 自动加载这个角色应该有的 skill 包。零人工 setup。

---

## 路线图

我们按 milestone 节奏推进，详见 [docs/plans/2026-04-28-firefly-mesh-plan.md](docs/plans/2026-04-28-firefly-mesh-plan.md)。

| Milestone | 状态 | 内容 |
|---|---|---|
| M0 — 工程初始化 | ✅ | Monorepo、env、docker-compose |
| M1 — 基础设施 | ✅ | 21 张表 schema、Postgres + pgvector、audit RULE |
| M2 — 组织 + agent | ✅ | 认证、员工、部门、agent 激活、onboarding 向导 |
| M3 — HITL + Inbox | ✅ | HITL 状态机、Inbox UI、Drawer |
| M4 — A2A 协议 | ✅ | Broker、ed25519 签名、agent-card.json |
| M5 — 任务 + W1 demo | ✅ | LLM 拆解、dispatcher、W1 demo 端到端验证通过 |
| M6 — Audit 追溯 | ✅ | Threads、log、CSV 导出、SSE |
| M7 — 知识库 | ✅ | 解析 / 切片 / 嵌入 / 检索；三层 scope；UI |
| M8 — Skill | ✅ | CRUD、dry-run、优先级合并、UI |
| M9 — Skill + MCP 包 | ✅ | `@firefly-mesh/skill`（agentskills.io）+ `@firefly-mesh/mcp` |
| **M10 — 加固 + dogfooding** | 🚧 | 集成测试、运行时兼容矩阵、文档站、npm 发布、GitHub release |
| V0.2 — Project 层、KB project scope | 📋 | 第四层 scope、有 scope 的项目 |
| V1.0 — Helm chart、多区域 | 📋 | 生产部署拓扑 |

---

## 文档

- **[设计](docs/plans/2026-04-28-firefly-mesh-design.md)** —— 完整系统设计，包括数据模型、A2A 协议、HITL 状态机、SQL 模板。
- **[API 参考](docs/plans/2026-04-28-firefly-mesh-api.md)** —— 60+ HTTP 端点、SSE 通道清单、错误码。
- **[UI 规格](docs/plans/2026-04-28-firefly-mesh-ui.md)** —— 逐页拆解。
- **[计划](docs/plans/2026-04-28-firefly-mesh-plan.md)** —— Milestone 拆解 + 验收标准。
- **[规则](docs/plans/2026-04-28-firefly-mesh-rules.md)** —— 工程不变量 + 红线（如 R7：服务端禁用 `ToolLoopAgent`）。
- **[索引](docs/plans/2026-04-28-firefly-mesh-index.md)** —— 代码库地图。

独立文档站点在 M10 路线图上；目前以设计文档为准。

---

## 我们遵循的标准

- **[Google A2A v1.2](https://a2a-protocol.org)** —— agent-to-agent 消息封装，agent card 发现（`/.well-known/agent-card.json`）。
- **[agentskills.io v1](https://agentskills.io)** —— `SKILL.md` manifest 格式，运行时协商契约。
- **[Model Context Protocol](https://modelcontextprotocol.io)** —— 给原生不读 SKILL.md 的运行时（Cursor、Claude Desktop 等）。
- **[RFC-8785 JSON 规范化](https://datatracker.ietf.org/doc/rfc8785/)** —— ed25519 消息签名用。

---

## 技术栈

- **运行时：** Node.js ≥ 24，pnpm ≥ 10
- **Web：** Next.js 16，React 19，Tailwind CSS v4，shadcn/ui，TanStack Query，@assistant-ui/react，@xyflow/react
- **服务端：** Drizzle ORM，Postgres 17，pgvector，Better Auth
- **AI：** Vercel AI SDK v6（toolless），AI Gateway 路由（Anthropic / OpenAI / Voyage）
- **校验：** zod v4 全栈 —— 协议层、DB 层、manifest 格式
- **加密：** ed25519（Node `crypto`），HS256（agent JWT，复用 Better Auth secret）
- **实时：** 内存 pub/sub bus → SSE（V1.0 切到 Redis Streams）

---

## 贡献

我们正处于 pre-1.0 阶段，主动接受外部贡献者。Good first issue 在 [issue tracker](https://github.com/intellicave/firefly-mesh/issues) 上有标签。

提 PR 之前请：

1. 读 [`docs/plans/2026-04-28-firefly-mesh-rules.md`](docs/plans/2026-04-28-firefly-mesh-rules.md) —— 这些红线不可妥协（多租户边界、服务端无 `ToolLoopAgent`、append-only 审计、HITL 单一写者等）。
2. 5 个包必须 `pnpm typecheck` 全过。
3. 任何新 SQL 必须在 WHERE 子句里有 `eq(orgId, session.orgId)`，例外要在 PR 描述里写明理由。
4. 任何修改 HITL 审批列状态的代码必须经过 `core/hitl/engine.ts` —— 没有例外。
5. 新的 A2A 消息类型或 scope 必须同步更新 `core/a2a/protocol.ts` 和 `core/boundary/catalog.ts`。

推送前跑完整本地校验：

```bash
pnpm typecheck
pnpm --filter @firefly-mesh/core migrate   # 对一个干净的 Postgres
# (M10) pnpm test
# (M10) pnpm e2e
```

完整指南见 [CONTRIBUTING.md](CONTRIBUTING.md)（M10 完成）。

---

## 社区

- **GitHub Discussions** —— github.com/intellicave/firefly-mesh/discussions（v0.1 release 后开放）
- **Discord** —— 邀请链接将在置顶 issue 发布
- **Twitter/X** —— [@cyberautonomy](https://x.com/cyberautonomy)
- **安全披露** —— security@cyberautonomy.io（请勿在公开 issue 报告漏洞）

---

## 赞助

firefly-mesh 由 [Cyberautonomy](https://cyberautonomy.io) 与开源社区共同维护。如果你想赞助具体 milestone（M10 dogfooding、V0.2 project scope、V1.0 生产姿态），联系 hello@cyberautonomy.io。

---

## License

[Apache License 2.0](LICENSE) © 2026 Cyberautonomy 与贡献者。

可商用，可自托管，可 fork。我们只要求贡献回流时遵守 [`docs/plans/2026-04-28-firefly-mesh-rules.md`](docs/plans/2026-04-28-firefly-mesh-rules.md) 的规则。

---

<div align="center">
<sub>带着这样的信念建造：<strong>Agent 不会取代组织 —— 它们会编织成组织。</strong></sub>
</div>
