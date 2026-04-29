# firefly-mesh — 文档索引（autodev pipeline 末端）

> 地图式索引，供开发阶段的 task / agent 按需加载文档。

---

## 文档链（autodev pipeline 阶段产出）

| 阶段 | 文件 | 核心内容 |
|---|---|---|
| Pre | [meta.md](2026-04-28-firefly-mesh-meta.md) | 元规则 / 8 lock decision / 项目关系 / pipeline 顺序 / 团队约束 |
| 1 | [ideation.md](2026-04-28-firefly-mesh-ideation.md) | 产品定位 / 16 项 MVP（P1-P14 + W1+W2）/ 用户旅程 / 失败模式 |
| 2 | [oss-scan.md](2026-04-28-firefly-mesh-oss-scan.md) | 24 项技术 audit + R23 KB / R24 Skill versioning + 6 条 firefly upgrade-backlog |
| 3 | [design.md](2026-04-28-firefly-mesh-design.md) | 4 层架构 / 14 张 Drizzle 表 schema / 5 packages 拆分 / W1 数据流 |
| 4 | [ui.md](2026-04-28-firefly-mesh-ui.md) | 6 页面线框 / 复用决策矩阵 / 视觉/动效规范 / §9 数据需求汇总 |
| 5 | [api.md](2026-04-28-firefly-mesh-api.md) | 65 endpoints + 完整 zod schema / A2A 协议详细 / DB 操作产物 / SSE channels |
| 6 | [plan.md](2026-04-28-firefly-mesh-plan.md) | 11 milestones / 50+ tasks（带 acceptance_criteria + status）/ 红线自动化 |
| 7 | [rules.md](2026-04-28-firefly-mesh-rules.md) | 编码规则 17 节 / 红线 / GAN 触发 |
| 7 | [index.md](2026-04-28-firefly-mesh-index.md)（本文件） | 地图式索引 |

---

## 核心概念速查

| 概念 | 定义 | 文档位置 |
|---|---|---|
| **Employee** | 真实员工，稳定实体，1:1 绑定 user | design §6.1 |
| **Agent** | 员工的 AI 代表（**runtime 在客户端**），server 仅存元数据（runtimeKind / lastSeen） | design §6.2 |
| **Agent Token** | 一次性接入凭据，consume 后绑定到 agent_id | design §6.3 |
| **Skill** | agentskills.io 兼容包，3 层 scope（Company/Department/Personal） | design §6.5 |
| **Knowledge Document** | KB 文档，3 层 scope，自动 chunk + embed | design §6.7b |
| **Knowledge Chunk** | Markdown-aware semantic chunk + pgvector 嵌入 | design §6.7b |
| **Task** | 工作单元，goal ancestry（parent/root） | design §6.6 |
| **A2A Message** | 7 type 跨员工消息 + sender 签名 + 双向 HITL | design §6.7 / api §5 |
| **HITL Point** | 跨人决策强制人审批（12 点 from PRD） | api §4.5 双向 |
| **Representation Boundary** | agent JWT scope，server-side enforce | design §6.4 / api §2.4 |
| **Audit Log** | append-only，DB RULE 强制 no-update no-delete | design §6.8 |

---

## 技术栈速查

| 层 | 选型 | 文档 |
|---|---|---|
| 前端 | Next.js 16 + React 19 + Tailwind v4 + shadcn/ui | design §4.2 |
| 图引擎 | @xyflow/react v12 + Dagre | design §4.2 |
| 对话 UI | @assistant-ui/react | design §4.2 |
| 后端 | Next.js Route Handlers + Drizzle ORM | design §4.1 |
| 数据库 | PostgreSQL 17 + pgvector | oss-scan §R23 |
| 认证 | Better Auth（含 organizations） | oss-scan §R1 |
| AI | Vercel AI SDK v6（仅 toolless）+ AI Gateway | oss-scan §R11 |
| Embed | voyage-3-large（dim 2048）/ OpenAI v3-large 备选 | oss-scan §R23 |
| Chunking | Markdown-aware semantic | oss-scan §R23 |
| A2A | Google A2A Protocol v1.2 (LF) | oss-scan §R6 |
| Skill 标准 | agentskills.io + SemVer | oss-scan §R3 |
| MCP | @modelcontextprotocol/sdk-typescript | oss-scan §R20 |
| 实时 | SSE | api §3 |
| 部署 | docker-compose（MVP）+ Helm（V2） | design §3.2 |
| License | Apache 2.0 (core) + BSL (enterprise V2) | oss-scan §R22 |

---

## 业务场景（demo / 验收核心）

| # | 场景 | 涉及功能 | Milestone |
|---|---|---|---|
| W1 | CEO 任务扩散端到端 | P1-P11 全部 | M5 |
| W2 | Cyberautonomy Day-1 dogfooding 配置包 | 全部 16 项 + seed | M10 |

### 用户流程（来自 ui §3）

| # | 流程 | 入口 |
|---|---|---|
| F1 | Admin 首次部署 + 创组织 + 导员工 + 生成 token | docker-compose up 后浏览器 |
| F2 | 员工接入（外部 CLI） | 拿到 token → agent skill install |
| F3 | 员工处理 inbox | /inbox（默认主页） |
| F4 | 管理者审 A2A 追溯 | /audit |
| F5 | Admin 调员工/部门/项目 | /organization |

---

## 11 个 Milestones（来自 plan）

| # | 名称 | 时长 | 关联 P/W | 关键产出 |
|---|---|---|---|---|
| M0 | 工程初始化 | 0.5 周 | - | monorepo + docker-compose |
| M1 | 基础设施 | 1 周 | P1 / P6 / P10 | auth + RBAC + audit + SSE |
| M2 | 组织 + agent | 1 周 | P4 / P5 / P6 | org graph + agent activate |
| M3 | HITL + Inbox | 1 周 | P8 / P9 | inbox UI + HITL 状态机 |
| M4 | A2A 协议层 | 1.5 周 | P7 | 7 type + 签名 + thread |
| M5 | Task lifecycle + W1 demo | 1 周 | W1 | CEO 任务扩散端到端 |
| M6 | Audit 追溯 | 0.5 周 | P11 | /audit 页面 |
| M7 | KB pipeline | 1.5 周 | P12 | chunking + embed + 三层 RAG |
| M8 | Skill registry | 1 周 | P13 / P14 | 三层 skill + dry-run |
| M9 | Skill 包 + MCP | 1 周 | P2 / P3 | npm 包 + MCP image |
| M10 | 测试 / 文档 / W2 / 首发 | 1 周 | W2 + 全 MVP | GitHub 公开 |

**Total = 10 周 wall time**

---

## 关键文件路径（实施阶段）

```
firefly-mesh/
├── packages/
│   ├── core/                  # server-side 业务 lib
│   │   ├── db/schema/         # 9 个 Drizzle schema 文件
│   │   ├── auth/
│   │   ├── a2a/
│   │   ├── hitl/
│   │   ├── task/
│   │   ├── skill/
│   │   ├── knowledge/
│   │   ├── audit/
│   │   ├── boundary/
│   │   ├── llm/               # toolless helper
│   │   ├── events/            # SSE bus
│   │   └── middleware/        # 5 个 guard
│   ├── web/
│   │   ├── app/
│   │   │   ├── (dashboard)/
│   │   │   │   ├── inbox/
│   │   │   │   ├── organization/
│   │   │   │   ├── knowledge/
│   │   │   │   ├── skills/
│   │   │   │   ├── audit/
│   │   │   │   └── settings/
│   │   │   ├── onboarding/    # 4 step wizard
│   │   │   ├── api/           # Route Handlers（按 api §4 域分组）
│   │   │   ├── globals.css    # fork firefly tokens
│   │   │   └── layout.tsx
│   │   └── components/
│   │       ├── ui/            # shadcn 基础
│   │       ├── inbox/
│   │       ├── organization/  # fork-and-trim firefly
│   │       ├── audit/
│   │       ├── knowledge/
│   │       ├── skills/
│   │       └── settings/
│   ├── skill/                 # @firefly-mesh/skill npm 包
│   ├── mcp/                   # MCP server
│   └── sdk/                   # typed HTTP client
├── deploy/
│   ├── docker-compose/
│   ├── helm/                  # V2
│   └── seed/
│       └── cyberautonomy/     # W2 配置包
├── docs/plans/                # 本套 8 文档
└── .github/workflows/         # CI / red-line / skill-compat / mcp-compat
```

---

## 跨文档引用规则

实施阶段每个 task 加载相关文档：

- Task 涉及**数据模型** → 加载 `design §6` 对应表 + `api §6` SQL 模板
- Task 涉及**API 端点** → 加载 `api §4` 对应小节
- Task 涉及**UI 组件** → 加载 `ui §4` 页面 + `ui §5` 复用决策矩阵
- Task 涉及**OSS 集成** → 加载 `oss-scan` 对应 R
- Task 涉及**协议层** → 加载 `api §5`（A2A）/ `api §7`（skill 工具签名）
- Task 涉及**HITL 状态机** → 加载 `api §4.5` + `design §6.7`

---

## 阶段间契约（不可违反）

1. **Design 决定技术选型**：实现必须用 design 指定的库，不可替换（除非重走阶段 2）
2. **UI 决定视觉真值**：所有页面用 firefly globals.css 的 Claude tokens，不可另创
3. **API 决定接口**：endpoint URL + zod schema 按 api.md，不可擅改
4. **Plan 决定顺序**：按 M0→M10 顺序执行，可并行子 task 但不可跨 milestone 跳跃
5. **Rules 决定实施纪律**：红线 6+4 条不可破；每 PR 必过 GAN

---

## 双向同步

firefly-mesh 与 firefly 上级项目的同步在 [`MultiAgent/docs/upgrade-backlog.md`](../../../MultiAgent/docs/upgrade-backlog.md) 维护，目前 6 条：

| # | 选型 | priority |
|---|---|---|
| B1 | skill spec 100% agentskills.io 对齐 | P3 |
| B2 | server-side AI SDK toolless / tooled 分层 | P2 |
| B3 | agent-detail-drawer 拆 tab | P3 |
| B4 | KB 升 V1（3 层 namespace） | P2 |
| B5 | Skill registry 三层完整实现 | P2 |
| B6 | KB chunking 策略明确化（Markdown-aware semantic） | P2 |

---

## 当前状态

```
✓ Step 0: meta             pipeline 元规则
✓ Step 1: ideation         16 项 MVP
✓ Step 2: oss-scan         技术 audit + 6 条 backlog
✓ Step 3: design           14 张表 + 5 packages
✓ Step 4: ui               6 页面 + §9 数据需求
✓ Step 5: api              65 endpoints + DB 产物
✓ Step 6: plan             11 milestones + 50+ tasks
✓ Step 7: rules + index    编码规则 + 文档地图
─── autodev pipeline 全部完成 ───
○ 实施阶段从 M0 开始
```

---

**Index 完成。autodev pipeline 全部产出落地。**
