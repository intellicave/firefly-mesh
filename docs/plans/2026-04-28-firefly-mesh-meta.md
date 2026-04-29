# firefly-mesh — autodev pipeline meta rules

> 本文件由 autodev pipeline 所有 sub-skill 在启动时加载。任何技术决策、复用、升级动作必须遵守。
> 来源：2026-04-28 brainstorming 沉淀（与上级项目 firefly 拆分后建立）。

---

## 1. 项目关系

| | firefly（上级项目） | firefly-mesh（本项目） |
|---|---|---|
| 路径 | `d:/Dev/Projects/Intelli_cave/MultiAgent` | `d:/Dev/Projects/Intelli_cave/firefly-mesh` |
| 定位 | 闭源 / SaaS / Enterprise 全栈（B + A 路径） | 开源 / GitHub 引流（C 路径，bring-your-own-agent 协议层） |
| Codebase | 独立 | 独立 |
| Design 文档 | 完整 PRD / DESIGN / 架构图 | 参考 firefly，但每个选型必须独立 audit |

firefly-mesh **不是** firefly 的子模块、子目录、或 fork。是独立 repo、独立品牌、独立 GitHub。但思想上 firefly-mesh = firefly 的 C 引流路线。

---

## 2. 复用 firefly 的铁律——"参考但不盲信"

### 2.1 可以复用

- 产品思想（HITL 12 点 / A2A 横向通信 / 三层 KB / 三级 skill 优先级 / 代表权边界）
- UI 组件实现（参考 `MultiAgent/web/components/`，先 audit 后用）
- Drizzle schema 字段定义（参考 `MultiAgent/web/lib/db/schema/`）
- 设计系统 tokens（参考 `MultiAgent/DESIGN.md`：Claude 配色 / 字体 / spacing）
- autodev 文档命名规范（`YYYY-MM-DD-<代号>-<phase>.md`）
- 编码规则大部分（参考 `MultiAgent/docs/plans/2026-04-24-org-neural-mesh-rules.md`）

### 2.2 严禁直接复制技术选型

**关键铁律**：每一个关键技术选型必须经过：

1. **Audit**——6 个月内是否出现更优替代？
2. **调研（`/last30days`）**——跑 X / Reddit / web 看社区现状
3. **决策记录**——在 `oss-scan.md` 写明 "沿用 firefly 的 X / 升级到 Y / 自研 Z" + 理由 + 出处

### 2.3 audit 必要性判定表

| 类别 | 例子 | 是否 audit |
|---|---|---|
| 协议 / 标准 | Google A2A / MCP / agent skill 标准 / OpenAgents | ✅ 必须 |
| Agent runtime / SDK | Vercel AI SDK / OpenAI Agents SDK / Mastra | ✅ 必须 |
| 新兴框架（演进 < 12 月） | mem0 / Inngest / xyflow | ✅ 必须 |
| LLM 路由网关 | Vercel AI Gateway / OpenRouter / litellm | ✅ 必须 |
| Self-improving skill 框架 | Anthropic Skills 格式 / agentskills.io | ✅ 必须 |
| 基础设施 LTS | PostgreSQL / Next.js / TypeScript / Drizzle / pgvector | ❌ 直接沿用 |
| 设计语言 | shadcn/ui / Tailwind v4 / Lucide | ❌ 直接沿用 |
| Auth | Better Auth | ⚠️ 半 audit（看 v2.x 是否有重大变化） |

---

## 3. 双向升级记录（核心铁律）

若 firefly-mesh 选用了比 firefly 当前更好的方案：

1. firefly-mesh 立即采用新方案。
2. **必须**在 `d:/Dev/Projects/Intelli_cave/MultiAgent/docs/upgrade-backlog.md` 追加一条记录。
3. 字段：

| 字段 | 说明 |
|---|---|
| `date` | 发现日期（YYYY-MM-DD） |
| `选型` | X (firefly 现状) → Y (新方案) |
| `why` | 调研出处（last30days 关键词 / X 链接 / 文档）+ 关键理由 |
| `cost` | 迁移工作量（small / medium / large） |
| `priority` | P0 / P1 / P2 / P3 |
| `status` | open / in-review / accepted / rejected / done |

firefly 后续迭代必须 review 此清单，决定是否吸收。

---

## 4. autodev sub-skill 调用顺序

按 memory 偏好"可见执行而非黑盒 orchestrator"——主会话顺序逐个调用，**禁止包成 general-purpose subagent**。

| # | sub-skill | 产物 | 备注 |
|---|---|---|---|
| 1 | `autodev-ideation` | `docs/plans/2026-04-28-firefly-mesh-ideation.md` | 产品定位 / 价值链 / MVP 功能 / 目标用户 |
| 2 | （手动）firefly audit + `/last30days` × N | `docs/plans/2026-04-28-firefly-mesh-oss-scan.md` | 关键技术选型 audit。同步更新 firefly 的 upgrade-backlog.md |
| 3 | `autodev-brainstorm` | `docs/plans/2026-04-28-firefly-mesh-design.md` | 架构 / 数据模型 / 技术栈最终版 |
| 4 | `autodev-ui` | `docs/plans/2026-04-28-firefly-mesh-ui.md` | 配色 / 页面线框 / HITL 视觉 |
| 5 | `autodev-api` | `docs/plans/2026-04-28-firefly-mesh-api.md` | REST 端点 / A2A schema / SSE 事件 |
| 6 | `autodev-plan` | `docs/plans/2026-04-28-firefly-mesh-plan.md` | Milestones / 契约式验收 |
| 7 | （生成）rules + index | `-rules.md` + `-index.md` | 编码规则 + 文档索引 |

每个 sub-skill 产物完成后**用户 review → commit git → 再走下一步**。

---

## 5. 已 lock 的 8 条 design 决策（前置 brainstorming 沉淀）

后续阶段**不可降阶**这 8 条；如要变更必须先回 brainstorming 重审。

1. ✅ **C 路线**：bring-your-own-agent 开源协议层（GitHub 引流，不做 agent runtime）
2. ✅ **中心化 self-hosted server**：单点真值（不是 P2P / 主节点漂移）
3. ✅ **BYO-agent**：员工自带 OpenClaw / Hermes Agent / Claude Code / Cursor / 任何 MCP-ready agent
4. ✅ **Skill + MCP 双轨包装**：兼容 agentskills.io + MCP 生态，底下同一组 HTTPS API
5. ✅ **Monorepo + open-core**：Apache 2.0 core + BSL enterprise（远期）
6. ✅ **Postgres + pgvector 单点真值**：org graph / a2a / audit / KB / skill registry 都在 server
7. ✅ **Day 1 Cyberautonomy 内部 dogfooding**：自己先用
8. ✅ **v1 standards = open-source v1 best-in-class**：PostHog / Cal.com / Plane / Sentry 早期为 benchmark

---

## 6. 团队约束

| 圈层 | 人数 | 角色 |
|---|---|---|
| Core team | **10**（已 lock） | 全职紧密协作。架构 / 核心模块 |
| Extended | 10–20 | tests / docs / examples / i18n / DevRel |
| Reviewers | ~25 | 保持原工作；PR review / Discussion 答疑 |
| **Tech Lead** | **Leo Wang** (wenxuan@cyberautonomy.io) | 架构拍板 / code review final say |

避免 Brooks's law。**禁止**把 50 人塞进 v1 core team。

---

## 7. 引用与跳转

- firefly 上级项目 PRD：`d:/Dev/Projects/Intelli_cave/MultiAgent/PRD.md`
- firefly 设计系统：`d:/Dev/Projects/Intelli_cave/MultiAgent/DESIGN.md`
- firefly 架构图：`d:/Dev/Projects/Intelli_cave/MultiAgent/架构图.md`
- firefly autodev 全套文档：`d:/Dev/Projects/Intelli_cave/MultiAgent/docs/plans/2026-04-24-org-neural-mesh-*.md`
- firefly 升级清单（双向通道）：`d:/Dev/Projects/Intelli_cave/MultiAgent/docs/upgrade-backlog.md`

---

**Meta 完成。**
