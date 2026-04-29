# firefly-mesh — 开源方案扫描 + firefly 选型 audit（Step 2 of autodev pipeline）

> **日期**：2026-04-28
> **方法**：基于 firefly 上级项目的 [oss-scan.md](../../../MultiAgent/docs/plans/2026-04-24-org-neural-mesh-oss-scan.md) 做 **audit-driven** 复用决策；3 次 `/last30days` + WebSearch
> **元规则**：见 [meta.md §2](2026-04-28-firefly-mesh-meta.md)（"参考但不盲信"）
> **原则**：MVP 涉及的关键技术选型必须经过 audit；基础设施 LTS 直接沿用；audit 发现更优方案 → firefly-mesh 用、写入 firefly upgrade-backlog

---

## Audit 摘要表（一图概览）

| R | 能力 | firefly 选型 | audit 结果 | firefly-mesh 决策 | upgrade-backlog 条目 |
|---|---|---|---|---|---|
| R1 | 身份 + RBAC + 组织 | Better Auth | 仍是 2026 默认 | ✅ 沿用 | - |
| R2 | Agent 实体（元数据，runtime 在客户端） | 自研 + Drizzle | 不重叠任何 OSS agent runtime | ✅ 沿用 | - |
| R3 | Skill 系统 / 包装 | agentskills.io + 自研 registry | **agentskills.io 已被 6 大平台采用** | ✅ 沿用 + verify 100% spec 兼容 | **B1**（P3 nice-to-have） |
| R4 | 任务系统 + goal ancestry | 自研 | 与 Paperclip 设计同源 | ✅ 沿用 | - |
| R5 | HITL 审批引擎 | Vercel AI SDK v6 HITL primitives | v6 仍主流 | ✅ 沿用 | - |
| R6 | A2A 协议 | Google A2A v1.2 (LF) | **150+ orgs production，事实标准** | ✅ 沿用 | - |
| R10 | 审计日志 | Postgres append-only | 业界 baseline | ✅ 沿用 | - |
| R11 | LLM 接入 + Gateway | Vercel AI SDK v6 + Vercel AI Gateway | v6 持续更新（Voyage / multimodal） | ✅ 沿用，**用法不同**（不跑 ToolLoopAgent） | **B2**（架构记录） |
| R14 | 组织可视化 | xyflow + Dagre | 仍是 React Flow 生态默认 | ✅ 沿用 | - |
| R15 | 对话 UI 组件 | assistant-ui + shadcn AI elements | 仍主流 | ✅ 沿用，MVP 极简 | - |
| R18 | 实时通信 | SSE | 沿用 firefly | ✅ 沿用 | - |
| R19 | 认证 / Session | Better Auth | 同 R1 | ✅ 沿用 | - |
| **R20** | **MCP server SDK**（firefly-mesh 新增） | — | `@modelcontextprotocol/sdk-typescript` 是事实标准 | ✅ 选用 | - |
| **R21** | **部署形态**（firefly-mesh 新增） | — | docker-compose / Helm 双轨 | ✅ MVP docker-compose；V2 加 Helm | - |
| **R22** | **License**（firefly-mesh 新增） | — | open-core 主流 (Apache + BSL) | ✅ Apache 2.0 (core) + BSL（enterprise V2 远期） | - |

V2/Future 涉及（暂不 audit，留后续阶段）：
- R7 审核链、R8 SOP DAG 引擎、R9 KB + RAG、R12 Per-user 记忆、R13 预算、R16/R17 任务流/工作流可视化

---

## R3 / R20 / R21（合并）— Skill 系统 + MCP server + 接入

### firefly 当前选型

- Skill 格式：Anthropic Skills 格式（agentskills.io 兼容）
- Skill 优先级：personal > company > public 三级冲突解决
- 三表模型：skill / skill_file / agent_skill
- Agent 接入：firefly 自己跑 ToolLoopAgent（agent runtime 在 firefly server 内）

### audit 调研（last30days "agent skills standard agentskills.io MCP"）

**关键发现：**

1. **agentskills.io 是 Anthropic 在 2025-12-18 发布的开放标准**，规范在 [agentskills.io/specification](https://agentskills.io/specification)，已被 **Microsoft / OpenAI / Atlassian / Figma / Cursor / GitHub** 采用。
2. 格式：folder 含 `SKILL.md` 元数据 + 脚本/资源——agent 可发现、按需 lazy-load。
3. **agentskills.io + MCP 是互补关系**：skills = procedural knowledge（"怎么做"）/ MCP = connectivity（"接什么"）。不是替代。
4. 已有 [agentskills-mcp](https://github.com/zouyingcao/agentskills-mcp) 把 Anthropic skills 桥到任意 MCP-compatible agent——**双轨包装是行业共识**。
5. "agentic-stack / portable .agent folder" 模式（per @safakkayran）— skills + memory **跨 Claude Code / Hermes / OpenClaw 可移植**。
6. "Agent Skills 是 AI tooling 的 npm moment"（per @Mosss_OS）。
7. Google 2026-04-23 官方公布 Agent Skills repository（per @GoogleCloudTech, 5438 likes）"simple, open format for giving agents new capabilities"——表明 Google 也加入了 agentskills.io 阵营。

**MCP SDK 状态：**

- 官方 SDK：`@modelcontextprotocol/sdk-typescript`
- "Bring Your Own MCP" 是 Google Cloud Next 2026 announcement
- MCP 已是事实标准（"the protocol debate ended"，per @mycomradio）

### 替代评估

| 方案 | 评估 | 决策 |
|---|---|---|
| OpenAI Plugin format | 已被 Anthropic Skills 接收为子集 | ❌ 不单独支持 |
| 自建 skill 格式 | 不兼容生态，违反"开放标准"原则 | ❌ |
| 只做 MCP 不做 skill | 漏掉"在 OpenClaw/Hermes 里 install" 这一接入路径 | ❌ |
| **agentskills.io + MCP 双轨**（meta lock #4） | 行业共识 | ✅ |

### firefly-mesh 决策

1. **Skill 格式**：完全 agentskills.io 兼容 — `SKILL.md` + lazy-load 资源
2. **MCP server**：用 `@modelcontextprotocol/sdk-typescript` 包装同一组工具
3. **同 backend**：skill / MCP 都调用同一组 firefly-mesh HTTPS endpoints（`firefly.task.*` / `firefly.a2a.*` / `firefly.kb.*` / `firefly.skill.*`）
4. **接入路径**：
   - OpenClaw / Hermes / Claude Code 用户：`<agent> skill install firefly`
   - Cursor / Claude Desktop / ChatGPT 用户：MCP server URL 配置
5. **不做 agent runtime**：与 firefly 的核心区别——firefly 跑 ToolLoopAgent，firefly-mesh 不跑。Agent 在客户端跑。

### 对 firefly upgrade-backlog 的输入

→ **B1（P3 nice-to-have）**：verify firefly 的 skill 实现是否 100% 符合 agentskills.io spec；若有偏差，与 [anthropics/skills](https://github.com/anthropics/skills) 官方 repo 对齐。

---

## R6 — A2A 协议

### firefly 当前选型

- Google A2A Protocol **v1.2**（Linux Foundation 治理）
- JSON-RPC 2.0 + 签名 agent card

（来自 [架构图.md](../../../MultiAgent/架构图.md)）

### audit 调研（last30days "Google A2A protocol multi-agent communication standard 2026 vs alternatives"）

**关键发现：**

1. **A2A v1.2 是 2026-04 事实标准**——150+ orgs production（Salesforce / SAP / ServiceNow / Deutsche Bank），per [Linux Foundation press release](https://www.linuxfoundation.org/press/a2a-protocol-surpasses-150-organizations-lands-in-major-cloud-platforms-and-sees-enterprise-production-use-in-first-year)
2. **原生支持** 已入 Google ADK / LangGraph / CrewAI / LlamaIndex / Semantic Kernel / AutoGen / LangSmith（per @johniosifov, @Agentdailyai）
3. **v1.0 → v1.2 升级了**：multi-protocol support / enterprise multi-tenancy / modernized security flows / migration path
4. **强共识**："MCP + A2A 在一个框架里" = 2026 multi-agent 标准模式（per @saen_dev, @jjfleagle）—— MCP for tool ↔ agent, A2A for agent ↔ agent，**互补不竞争**。
5. **MIT 25,000-task 实验**：协议选择解释 44% 质量方差（per @godofprompt）—— 协议选对很关键。

### 替代评估

| 方案 | 评估 | 决策 |
|---|---|---|
| **ACP** (Agent Client Protocol) | 主要在 coding agents（Codex / Claude Code / Deep Agents），**不是通用 agent-to-agent**，per @LangChain_OSS / @onusoz | ❌ niche，不替代 A2A |
| **AXL** (Agent eXchange Layer, by Gensyn) | 完全 P2P 去中心化，**违反 firefly-mesh meta lock #2**（中心化 self-hosted server 单点真值） | ❌ |
| **AP2** (Agent Payments Protocol, Google) | 是 A2A 的支付子协议，互补不替代 | V2+ 考虑 |
| **OpenAgents Workspace** | 不是协议，是平台 | ❌ 不在同一抽象层 |

### firefly-mesh 决策

✅ **完全沿用 Google A2A v1.2**（与 firefly 一致）。理由：
- 行业事实标准、生态最广（LangGraph / CrewAI / LlamaIndex / Semantic Kernel 全部原生支持 → 接入门槛极低）
- Linux Foundation 治理，避免单一供应商锁定
- v1.2 specifically 支持 multi-tenancy + 现代安全流，正好匹配 self-hosted org 模型

### 对 firefly upgrade-backlog 的输入

→ **0 条**（firefly 已用 v1.2，且 v1.2 仍是当前最新稳定版）

---

## R11 — LLM 接入 + Gateway（agent runtime 这一层 firefly-mesh 不需要）

### firefly 当前选型

- Vercel AI SDK v6（`generateText` / `streamText` / `generateObject` / `embedMany`）
- **ToolLoopAgent** 跑 server-side agent loop
- AI Gateway 做多 provider 路由（Anthropic / Google / OpenAI）

### audit 调研（last30days "Vercel AI SDK v6 alternatives Mastra OpenAI Agents SDK LangGraph 2026"）

**关键发现：**

1. **Vercel AI SDK v6 仍是 2026 主流**——freeCodeCamp 在 2026-04-27 发新课程"Build a support agent with Vercel AI SDK"
2. v6 持续更新（Voyage AI provider 加入、multimodal embedding、generateImage 转正），per [vercel/ai releases](https://github.com/vercel/ai/releases)
3. **Mastra**（@calcsam, $22M Series A 2026-04-09）势头猛——是完整 agent platform（Mastra Studio / Server / Memory Gateway）
4. **OpenAI Agents SDK**（@snsf, 2026-04-15）major update for "long-running durable agents"，与 Vercel 合作做 sandbox execution
5. **LangGraph** 仍生产成熟（@LangChain_OSS, 分布式架构 with RemoteGraph）
6. @0x_Negative 给出当前共识分类（71 likes）：
   - 企业级 → AWS AgentCore + Strand
   - 快速搭建 → Mastra
   - 简单 LLM workflow + chat → **Vercel AI SDK**
7. @helloiamleonie 调查 136 回复："不存在 dominating stack"—— 多元化生态。

### 关键架构差异（firefly vs firefly-mesh）

| | firefly（B + A 路径） | firefly-mesh（C 路径） |
|---|---|---|
| Agent runtime 位置 | Server 端（Vercel ToolLoopAgent）| **客户端**（用户的 OpenClaw / Hermes / Cursor）|
| Server 端 LLM 用法 | 跑完整 agent loop + tool calls | **只做轻量调用**：语义 skill 匹配、任务拆解、死循环 topic 嵌入、KB embedding |
| 需要 ToolLoopAgent? | ✅ 是 | ❌ **否** |
| 需要 AI Gateway? | ✅ 是（多 provider） | ✅ 是（轻量调用仍要多 provider）|

### 替代评估

| 方案 | 评估 | 决策 |
|---|---|---|
| Mastra | 是完整 agent runtime，但 firefly-mesh 不需要 runtime | ❌ |
| OpenAI Agents SDK | 锁 OpenAI 生态，违反多 provider 原则 | ❌ |
| LangGraph | agent orchestration，比我们需要的复杂 | ❌ |
| AWS AgentCore + Strand | 企业级 SaaS，违反 self-hosted lock | ❌ |
| **Vercel AI SDK v6（轻量用法）+ AI Gateway** | 服务端只做 generateText/Object/embed | ✅ |

### firefly-mesh 决策

✅ **沿用 Vercel AI SDK v6 + AI Gateway**，但**用法精简**：
- 不引入 ToolLoopAgent（agent runtime 在客户端）
- Server 端只用：`generateText` / `generateObject` / `embedMany` / `streamText`（用于 SSE 推任务/审批通知）
- AI Gateway 沿用做 multi-provider routing（Anthropic / Google / OpenAI）

### 对 firefly upgrade-backlog 的输入

→ **B2（架构记录，P2 medium）**：firefly-mesh 的 Vercel AI SDK 用法对 firefly 是个**"减法"参考**——firefly 自己应保留 ToolLoopAgent（B/A 路径必需），但可记录 firefly-mesh 在 server 端只用轻量 API 这一架构差异，方便后续 firefly 与 firefly-mesh 对接时对齐 SDK 调用面。

---

## R21 — 部署形态（firefly-mesh 新增决策）

### 选项

| 部署 | 谁用 | 工具 | MVP? |
|---|---|---|---|
| docker-compose | 公司 admin self-host | Docker Compose v2 + Postgres image + pgvector image | ✅ MVP |
| Helm chart | enterprise on-prem (V2 路径) | Kubernetes + Helm 3 | V2（A 路径触发） |
| Vercel Cloud | 你的 SaaS（V2，B 路径） | 现有 firefly 部署经验 | V2 |
| AWS / Azure 一键模板 | 单云客户 | Terraform / CloudFormation | V3 |

### 决策

- **MVP：docker-compose**（一行起，门槛最低，符合"5 分钟接入"硬指标）
- **V2 加 Helm**（在第一个 enterprise 客户出现时再做，目前 lead 阶段不写）

### 对 firefly upgrade-backlog 的输入

→ **0 条**（firefly 自己当前 SaaS，部署形态不重叠）

---

## R22 — License 选择（firefly-mesh 新增决策）

### 选项分析

| License | 主要用途 | 优劣 | firefly-mesh 适用？ |
|---|---|---|---|
| **Apache 2.0** | 最大化引流；允许商业使用、修改、再发布 | + 生态最友好；- 云厂商可白嫖（GitLab / MongoDB 早年痛） | ✅ Core |
| **BSL (Business Source License)** | open source 但限制竞争性使用；4 年后转 OSI | + 防云厂商竞争；- 前 4 年技术上不是 OSI 开源 | ✅ Enterprise（V2 远期） |
| **SSPL** (Server Side Public License) | 强 copyleft；MongoDB / Elastic 用 | + 极强反白嫖；- OSI 不承认；社区有抵触 | ❌ |
| **Elastic License v2** | 类似 BSL | + 防 SaaS 竞争；- 类似 SSPL 争议 | ❌ |

### 决策

- **firefly-mesh core**: **Apache 2.0**（packages/core / packages/web / packages/skill / packages/sdk / deploy）
- **firefly-mesh enterprise**: **BSL**（V2 引入合规层时再决，V1 不写代码）

### 对 firefly upgrade-backlog 的输入

→ **0 条**（firefly 自己是闭源 SaaS，不冲突）

---

## R5 / R10 / R14 / R15 / R18 / R19 — 直接沿用 firefly（无 audit）

按 [meta.md §2.3](2026-04-28-firefly-mesh-meta.md) 的 audit 必要性表，下列选型属于"基础设施 LTS / 设计语言 / Auth"层级，**直接沿用 firefly 选型**，无需 last30days：

- **Better Auth**（R1 / R19）—— 2026 Next.js 项目默认
- **PostgreSQL 17 + pgvector**（基础设施）
- **Drizzle ORM**（R10 审计、R4 任务、R2 agent 元数据）
- **xyflow + Dagre**（R14 组织可视化）
- **shadcn/ui + Tailwind v4 + Lucide**（设计语言）
- **assistant-ui**（R15 对话 UI）
- **SSE**（R18 实时通信）
- **Inngest**（R7 审核链 / R8 SOP——但 MVP 不用，V2 决定）

---

## R23 — KB 实现（Audit #4，2026-04-28 范围扩展触发）

### 触发原因

用户选方案 Y，KB 从 V2 提到 MVP（P12 三层 KB），需要立即决定 chunking 策略 + embed pipeline。

### audit 调研（last30days "pgvector RAG chunking strategy 2026 agent knowledge base embedding agentskills versioning"）

19 X posts 强信号：

1. **pgvector 仍是 2026 主流**——per @Th3RealSocrates "I run RAG on 2M docs with Postgres + pgvector"；per @AIxHunter17791 production stack = pgvector + Docling parsing + hybrid search + reranking
2. **chunking 是 RAG 失败的关键**——per @katta_mukunda "Most RAG systems fail at chunking, not retrieval"
3. **2026 production RAG 标准模式**（per @thevivekwisdom Part 2 Series）：vector 单一已不够；hybrid search + GraphRAG + late chunking 共同使用
4. **Naive fixed-size chunking 已过时**——per @brrocode "Fixed chunks split context, cracks show fast"
5. **Markdown-aware / semantic chunking** 是当前最佳实践（per @saen_dev "AST-based chunking + hybrid search"）

### MVP 决策（firefly-mesh）

| 选项 | 决策 | 理由 |
|---|---|---|
| Vector DB | ✅ pgvector（沿用 firefly） | 2M doc 规模仍可用，符合 v1 self-host 简化 |
| Embed model | voyage-3-large（dim 2048）/ 备选 OpenAI text-embedding-3-large（dim 3072） | 通过 AI Gateway 路由，runtime 可切 |
| Chunking | **Markdown-aware semantic chunking**（保 heading / 段落 / 列表边界） | per @katta_mukunda 是 RAG 命脉；不做 fixed-size naive chunking |
| Hybrid search | ❌ MVP 不做（V2 加 BM25 + reranking） | per @thevivekwisdom 是 production 推荐，但 MVP 简化 |
| GraphRAG / RAPTOR | ❌ V2+ | 过度工程，agentskills.io scope 优先级已经做了类似分层 |
| Late chunking | ❌ V2 | 实现复杂；先看 MVP 反馈 |
| Reranking | ❌ V2 | cross-encoder 推理慢，self-host 不轻 |

### 对 firefly upgrade-backlog 输入

- **B6（P2 medium）**：firefly oss-scan §R9 KB 没明确 chunking 策略（只列 pgvector + embedMany）。建议 firefly 也升级到 Markdown-aware semantic chunking，否则在大文档场景检索质量明显劣化。

---

## R24 — Skill versioning（Audit #4）

### 决策

- **agentskills.io 标准 + SemVer**（manifest 必含 `version: "X.Y.Z"`）
- **不做** rolling latest / git-based versioning（MVP 简化）
- 升级 skill = 提交 + 自动 bump patch；major / minor 用户在 UI 选

### 替代评估

| 方案 | 评估 | 决策 |
|---|---|---|
| 纯 git tag | 复杂，员工要会 git | ❌ |
| Hash-based content addressing | 严苛但用户体验差 | V2+ |
| **SemVer (agentskills.io 兼容)** | 行业标准 | ✅ |

### 对 firefly upgrade-backlog 输入

- 0 条（firefly skill version 已经是 SemVer 同步）

---

## V2/Future 待 audit 列表（不在本次 oss-scan 范围）

下列选型在 V2 阶段触发时再 audit：

| ID | 能力 | firefly 当前 | V2 触发条件 | 待 audit 关键词 |
|---|---|---|---|---|
| R8 | SOP / Durable workflow | Inngest | V2 加 SOP DAG 编辑器 | "durable workflow inngest trigger.dev DBOS restate 2026" |
| R9 | KB + RAG 实现 | pgvector + embedMany | V2 加三层 KB | 实际上 pgvector 已成熟，可能不需要 audit |
| R12 | Per-user 记忆 | mem0 | V2 加个人记忆 | "agent memory mem0 letta memgpt 2026" |
| R13 | 预算系统 | 自研 + AI Gateway 计量 | V2 加分层预算 | 自研，无须 audit |
| - | Open-source billing | – | V2 加 SaaS 路径 | "open source SaaS billing stripe polar lemonsqueezy 2026" |
| - | 文档站框架 | – | V2 升级文档体验 | "docs framework mintlify fumadocs nextra 2026" |
| - | Self-improving skill 收纳 | F16 V2 功能 | V2 触发 | "self improving agent skills 2026" |

---

## firefly upgrade-backlog 同步

本次 audit 共产出 **2 条** 给 firefly 的升级建议（已写入 `MultiAgent/docs/upgrade-backlog.md`）：

| # | date | 选型 | why | cost | priority | status |
|---|---|---|---|---|---|---|
| **B1** | 2026-04-28 | firefly skill 实现 → 100% agentskills.io spec 对齐 | agentskills.io 已成 6 平台共采开放标准 (Microsoft/OpenAI/Atlassian/Figma/Cursor/GitHub)；firefly 应 verify 与 [anthropics/skills](https://github.com/anthropics/skills) 官方 repo 完全兼容；不兼容会让 firefly 跨 runtime 接入面变窄 | small | P3 | open |
| **B2** | 2026-04-28 | server-side AI SDK 用法粒度对齐 | firefly 跑 ToolLoopAgent 是必须的；firefly-mesh 不跑（agent 在客户端）；为后续两项目互通，建议 firefly 在 lib/ai 中拆 toolless / tooled 两层 API 边界 | medium | P2 | open |

---

## 阶段交接

下一步：**Step 3 (autodev-brainstorm)**——基于 ideation 13 项 MVP + 本次 oss-scan 的技术选型决策，产出 `2026-04-28-firefly-mesh-design.md`：
- 整体架构图（4 层）
- 数据模型（Drizzle schema 字段定义）
- 模块职责划分（packages/core / packages/web / packages/skill / packages/sdk）
- 部署 topology
- 关键 API 流水

**oss-scan 完成。**
