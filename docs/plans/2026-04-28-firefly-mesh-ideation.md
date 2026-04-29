# firefly-mesh — 功能发现（Ideation）

> 时间：2026-04-28 | 领域：multi-agent 团队协作 / open-source agent mesh 协议层
> 目标用户：20–200 人 AI-native 公司（咨询、研究、媒体、软件工作室、AI engineering team）
> 上级项目：firefly（`d:/Dev/Projects/Intelli_cave/MultiAgent`，闭源 SaaS / Enterprise 全栈）
> 商业角色：open-source GitHub 引流（C 路径）；B/A 路径由 firefly 承接
> 元规则：见 `2026-04-28-firefly-mesh-meta.md`（已 lock 8 条 design 决策）

---

## 本质任务分析

### 本质任务

```
N 名员工 × N 个异构 agent（OpenClaw / Hermes / Claude Code / Cursor / 任意 MCP-ready）+ 组织目标
        │
        ▼
[组织协议化 + HITL 治理 + 共享认知 + 审计归责]
        │
        ▼
可治理、可审计、跨人/跨 agent 的协同产出
```

**一句话**：把"每个员工各自用 agent 干活"变换成"组织级 agent mesh 协同"——关键不在让 agent 干更多事，在让 agent 之间能**协议化通信**且**人类持续仲裁**。

### 核心价值链（7 个不可跳过的环节）

1. **身份归属** — agent ↔ employee 1:1 + org graph 中位置 + 代表权边界
2. **接入认证** — 员工本地 agent 装 skill / MCP + token 认证 + 协议握手
3. **任务路由** — 下达 → 拆解 → 分派到合适员工 agent（按 SOP / skill 匹配）
4. **A2A 协议通信** — 跨员工 agent 结构化消息 + sender / receiver 双向 HITL + 死循环检测
5. **共享认知** — agent 跨组织检索 KB / skill registry / SOP（不再各自孤岛）
6. **审计追溯** — 所有 action append-only、可回看、可归责
7. **观察治理** — 管理者实时看到任务流 / 健康度 / 异常红旗 / 预算

### 用户旅程

**管理员侧：**
1. GitHub 发现 firefly-mesh
2. `docker-compose up -d` 部署 server
3. 创建 org，导入员工列表（CSV / 手动 / Slack 同步）
4. 生成员工接入 token，分发
5. 配 RBAC / 代表权边界 / 预算
6. 上传公司 KB（可选）
7. web UI 监控任务流 / 健康度
8. 处理异常告警（死循环 / 超额 / 升级）
9. 处理审批升级
10. 调整 SOP / skill

**员工侧：**
1. 收到 admin 发的接入 token
2. 在自己的 OpenClaw / Hermes / Cursor 等 agent 里 `skill install firefly` 或配 MCP
3. 用 token 完成认证
4. 看到自己的任务队列（agent 对话内或 firefly web UI）
5. 接收任务，与 agent 协作完成
6. agent 想发 A2A 消息时先发给自己审核（HITL 点 4：批准发送）
7. 提交完成（HITL 点 2：员工点"提交审核"）
8. 收到审核结果（通过 / 退回）
9. 收件箱有 commit / request 类 A2A 消息时决定接受 / 拒绝（HITL 点 5）
10. 死循环时被召唤，做仲裁决策（HITL 点 6）

**交叉对照发现：**

| 用户旅程有 | Q2 价值链没明示 | 补漏到功能清单 |
|---|---|---|
| 管理员部署 server | — | **首次部署体验**（docker-compose 一行起） |
| 接入 token 生成 / 分发 / 撤销 | — | **接入凭据生命周期** |
| 员工 inbox 处理跨人请求 | — | **HITL inbox UI** |

### 失败模式

| # | 失败场景 | 触发条件 | 后果 |
|---|---|---|---|
| 1 | **接入门槛太高** | 员工不会装 skill / 配 token | 0 天就用不上 → 死 |
| 2 | **HITL 摩擦过重** | 每动作 5 次确认 | 员工放弃用 agent → 退回手敲 |
| 3 | **A2A 死循环吞 token** | agent 反复对齐不收敛 | 钱烧光 / 任务卡住 |
| 4 | **数据驻留焦虑** | 公司不愿对话上传外部 | 拒绝采用，尤其是合规敏感行业 |
| 5 | **agent 兼容性碎片** | 4+ 种 agent 各自实现差异 | 接入分支太多没法维护，开发停滞 |

### 成功标准（可观测）

1. **首次接入耗时** ≤ 5 分钟（员工首次到收到第一个任务）
2. **跨部门协调时间** 较手工方式 ≥ 50% 降幅
3. **Day-1 dogfooding 持续** ：Cyberautonomy 内部连续 30 天活跃使用、不卸载

### 直觉方案差距

**直觉方案**：搭 web 后端 + REST API，员工的 agent 调 API 发任务。

**会漏掉的关键**：
- A2A 不是 REST：sender 签名 / 7 种消息类型 / 双向 HITL
- HITL 协议化：必须 server 拦住、强制人类点击、记审计——不能让 agent 自报完成
- 代表权边界 server-side enforce：不是写在 prompt 里，是 server 端 JWT scope 检查
- 死循环检测：thread 长度 + 同 topic 重复，server 主动监控
- 共享 KB / Skill registry 命名空间：3 层（公司 / 部门 / 项目）+ 检索权限
- 多 runtime 兼容是第一公民：不是"先支持一个，以后加"——首发就 4+ 种适配

---

## 产品定位

**firefly-mesh 是给 AI-native 团队的开源 agent mesh 协议层**——员工自带任意 agent runtime（OpenClaw / Hermes / Claude Code / Cursor / 任意 MCP-ready），通过 firefly skill 或 MCP server 接入中心化 firefly-mesh server，统一获得组织图、A2A 通信、HITL 仲裁、共享 KB、审计追溯能力。

**Tagline:** *Bring your own agent. We bring the org.*

**与同类产品的差异**：
- vs Clawith / SwarmClaw：**强 HITL 治理派**（不是 agent 自治派）
- vs ClawTeam：**完整组织协议层**（org graph / RBAC / KB / 审计）
- vs Hermes Agent / OpenClaw：**不做 runtime，只做协议**
- vs firefly（上级）：**bring-your-own-agent 而不是内置 runtime**；**开源**而不是 SaaS

---

## 用户画像

### 主要目标用户：20–200 人 AI-native 公司

| 行业 | 典型场景 | 现状痛点 |
|---|---|---|
| 咨询 | consultant × deliverable | 跨人复盘上下文丢失 |
| 媒体 | 编辑 / 记者 / 设计师 | 跨稿协作 + 审稿没法 trace |
| 软件工作室 | dev 用 Cursor / Claude Code | PR review + 跨服务协调零自动 |
| AI 研究机构 | researcher × 论文 / 数据 | 多人合作版本 / 引用混乱 |

### 当前替代方案（用户今天怎么 hack）

1. Slack + 手工 prompt 复制 → 上下文搬运痛苦
2. 共享 ChatGPT Team → agent 不是个人专属，记忆混乱
3. 每人自己 agent 但孤岛 → 无组织视角
4. Cursor Bugbot / Coderabbit → 只针对 PR，不是组织级
5. Multica / Paperclip → 半成品（1 人多 agent 或 0 人公司）

### 5 大核心痛点

1. **上下文搬运**：跨员工 context 丢失 → 重复解释、误读
2. **agent 孤岛**：单 agent 不知道公司其他动态 → 决策片面
3. **责任不清**：agent 做错，不知道哪个人最终决策 → 审计不能
4. **跨工具碎片**：员工 A 用 OpenClaw、员工 B 用 Cursor，输出格式 / 风格 / 接入点全不同
5. **HITL 缺失**：放任 agent 自动跑，跨人决策出错代价高

### 新手 vs 老手差异

- 新手：装好就用、不配 RBAC / 预算 / SOP
- 老手：自定义 skill / SOP / 集成内部工具 / 调严格度

---

## 市场现状

### 主要竞品

| 竞品 | 卖点 | 做得好 | 短板 / 缺口 |
|---|---|---|---|
| **Clawith** (`dataelement/Clawith`) | OpenClaw for Teams | 持久身份 / KB / org graph | **agent 自治哲学（无强 HITL）**；只锁 OpenClaw runtime |
| **SwarmClaw** | self-hosted multi-agent runtime | 23+ LLM / memory 生态 | 是 runtime 不是协议层 |
| **ClawTeam (HKUDS)** | swarm 协调，多 runtime | 后端任选 OpenClaw / Hermes / Claude Code | 没有 org 建模 / RBAC / KB / 审计 |
| **Hermes Agent** (NousResearch) | 自我改进单 agent + 118 skills | agentskills.io 标准 | 单 agent，团队协作非核心 |
| **Multica** | N 人共享 agent 池 + Kanban | 多人 workspace | agent 不归属个人；无 A2A |
| **Paperclip** | 0 人公司 agent 自治 | goal ancestry / budget | 0 人哲学，不放大协作 |

### 市场空白（= 进入机会）

1. **强 HITL 治理 + multi-agent 协作** — 没人做"治理派"，全是"自治派"
2. **BYO-agent + 完整组织协议层** — ClawTeam 沾边但缺组织建模 / RBAC / KB
3. **协议层 + 治理层 + 共享认知一站式开源** — 没有人做

---

## 调研发现

### 用户洞察

调研基础：前期 `/last30days`（OpenClaw / Hermes / 团队协作平台主题）+ `WebSearch`（Clawith / SwarmClaw / ClawTeam / Hermes Agent docs）+ firefly PRD 的市场分析。

**关键发现**：
- 市场上目前所有 agent 协作平台**都是 agent 自治派**（Clawith / SwarmClaw / Multica / Paperclip）→ "治理派"是真空地带
- 用户最常用的 hack 是 "Slack + 手工 prompt 复制"——表明**结构化跨 agent 通信**的需求已经存在但没被满足
- BYO-agent 思路在 ClawTeam 已被验证（HKUDS 的 swarm coordinator 可接 OpenClaw / Hermes / Claude Code），但**没有组织建模能力**——这是 firefly-mesh 的核心机会

### 前沿研究（可转化为功能）

| 技术 | 状态 | 转化为功能 |
|---|---|---|
| **Google A2A Protocol v1.2 (LF)** | 开放标准 | 协议层底座（已 lock） |
| **agentskills.io + Anthropic Skills 格式** | 跨 runtime 兼容标准成型 | skill 包装一种（已 lock） |
| **MCP (Model Context Protocol)** | 事实接入标准 | skill 包装另一种（已 lock） |
| **Self-improving agent skills** | Hermes / Anthropic 主推 | server 提供 skill registry 接收 agent 自创 |
| **Semantic skill matching** | LLM 一次调用做岗位 ↔ 技能匹配 | 替代字符串匹配，准确率高 |
| **mem0 / Letta / MemGPT** | 竞争中 | per-user/agent 记忆抽象层（留 oss-scan） |
| **Inngest / Trigger.dev / DBOS / Restate** | 选型扩散 | 任务 / SOP / HITL workflow 引擎（留 oss-scan） |

---

## 功能清单

### 平台层 MVP（所有场景共享的基础能力）

| # | 功能 | UV | MD | TF | IN | 总分 | 来源 |
|---|---|---|---|---|---|---|---|
| P1 | docker-compose self-host server | 5 | 4 | 5 | 3 | 22 | F01 |
| P2 | firefly skill 包装（OpenClaw / Hermes / Claude Code 通用） | 5 | 5 | 4 | 5 | 24 | F02 |
| P3 | MCP server 包装（Cursor / Claude Desktop / 任意 MCP-ready） | 5 | 5 | 4 | 5 | 24 | F03 |
| P4 | 接入凭据管理（token 生成 / 撤销 / 一次性） | 4 | 3 | 5 | 2 | 18 | F22 |
| P5 | Org graph CRUD（员工 / 部门 / 项目 / Role） | 4 | 3 | 5 | 2 | 18 | F04 |
| P6 | 代表权边界（JWT scope server-side enforce） | 5 | 4 | 4 | 4 | 22 | F06 |
| P7 | A2A 协议层（7 种类型 + sender 签名） | 5 | 4 | 4 | 4 | 22 | F07 |
| P8 | A2A sender / receiver 双向 HITL 引擎 | 5 | 5 | 4 | 5 | 24 | F08 |
| P9 | 员工 HITL inbox UI（"待我审批" / "待我处理"） | 5 | 4 | 5 | 3 | 22 | F11 |
| P10 | append-only 审计日志 | 5 | 3 | 5 | 2 | 20 | F18 |
| P11 | A2A 对话追溯页面（filter + 回放） | 5 | 5 | 5 | 4 | 24 | F19 |

#### 平台层功能详细描述

**P1 — docker-compose self-host server**
- 用户故事：作为公司 admin，我想 `docker-compose up` 一行起 server，以便 5 分钟内得到可用的组织协作中枢
- 核心交互：clone repo → `docker-compose up -d` → 启动 Postgres + pgvector + firefly-mesh server。访问 `https://localhost:3000` 看到 org 创建 wizard
- 技术关键词：Docker / Docker Compose / Postgres + pgvector / 多阶段 build

**P2 — firefly skill 包装**
- 用户故事：作为员工，我想在自己的 OpenClaw 里 `skill install firefly`，以便 30 秒接入组织
- 核心交互：员工拿到 admin 发的 token → 在 agent shell 里 `skill install firefly` → `firefly init --server=... --token=...` → agent 自动注入 firefly.task / firefly.a2a / firefly.kb / firefly.skill 工具集
- 技术关键词：agentskills.io 标准 / 跨 runtime 兼容性 / skill manifest

**P3 — MCP server 包装**
- 用户故事：作为员工，我想在 Cursor 里加一个 MCP server URL，以便不切换工具就能接入组织
- 核心交互：在 Cursor / Claude Desktop / ChatGPT 的 MCP 配置里加一行 `firefly-mesh` server URL + token → agent 通过 MCP 协议获得同一组工具集
- 技术关键词：@modelcontextprotocol/sdk / JSON-RPC / SSE / OAuth-style auth

**P4 — 接入凭据管理**
- 用户故事：作为 admin，我想为每个员工生成一次性接入 token，以便控制谁能加入组织
- 核心交互：admin 在 web UI 选员工 → 点"生成接入 token" → 拿到一次性 token（链接 / QR）→ 分发给员工 → 员工接入后 token 自动绑定到员工身份。可随时撤销
- 技术关键词：JWT / 一次性 token / 短链分发 / 撤销 list

**P5 — Org graph CRUD**
- 用户故事：作为 admin，我想动态增删员工、部门、项目，以便组织变化时及时更新
- 核心交互：web UI 的"组织"页 + xyflow Dagre 布局可视化 + 节点 drawer CRUD。CSV / Slack 批量导入
- 技术关键词：Drizzle ORM / xyflow + Dagre / CSV 解析

**P6 — 代表权边界**
- 用户故事：作为 admin，我想约束每个 agent 能做哪类动作，以便防止 agent 越权
- 核心交互：admin 为每个 agent 配置 scope 列表（read_customer_data / propose_deal / send_external_email 等）。agent 调用 firefly tool 时 server 中间件 verify scope。越权时 server 拒绝并 emit "approval needed" 事件，要求 agent 让员工提权
- 技术关键词：JWT scope / RBAC middleware / scope catalog

**P7 — A2A 协议层**
- 用户故事：作为 agent，我想给跨员工的 agent 发结构化消息，以便不再依赖人工复制
- 核心交互：agent 调 `firefly.a2a.send(to, type, content)`，type ∈ {inform, sync, request, commit, handoff, escalate, block}。message 自带 sender 签名（员工 + 部门 + agent_id）。server 路由到 receiver agent 的 inbox，按 type 决定是否触发 HITL
- 技术关键词：Google A2A v1.2 / JSON-RPC 2.0 / agent card 签名 / message routing

**P8 — A2A 双向 HITL 引擎**
- 用户故事：作为员工，我想 agent 发 commit / request / handoff 前必须我点确认，以便不被 agent 代签
- 核心交互：sender agent 调 `firefly.a2a.send(type=commit, ...)` → server 标记为 `pending_sender_approval` → 推送通知到 sender 员工 web UI → 员工点"批准发送"或"拒绝" → 通过则路由到 receiver → receiver 端同样 HITL
- 技术关键词：状态机 / SSE 推送 / approval UI / inform/sync 自动通过；commit/request/handoff 双向必批

**P9 — 员工 HITL inbox UI**
- 用户故事：作为员工，我想在一个地方处理所有跨人请求和审批，以便不漏接、不重复
- 核心交互：web UI "我的 Inbox" 双 tab：①"待我批准发送"（sender 侧 pending）②"待我处理"（receiver 侧 pending）。每条带 quick action 按钮（批准 / 拒绝 / 退回 + 批注）
- 技术关键词：shadcn Tabs / SSE 实时刷新 / quick actions

**P10 — append-only 审计日志**
- 用户故事：作为 admin，我想所有 action 不可删、可追溯到具体员工，以便事后追责
- 核心交互：每个写入操作（任务、A2A 消息、审批、agent 激活、skill 变更）都自动写入 audit_log 表。表层禁止 update / delete（DB constraint）。导出为 CSV / JSON
- 技术关键词：append-only constraint / actor identity / structured audit / 导出

**P11 — A2A 对话追溯页面**
- 用户故事：作为 admin / auditor，我想查询任何 agent-to-agent 对话，以便审计与归责
- 核心交互：web UI 全量 A2A 对话时间线 + filter（参与方 / 类型 / 时间 / 任务关联）+ 点击进入对话详情（完整消息链 / 每条审批状态 / 关联任务）
- 技术关键词：filter UI / 时间轴 / cursor-based 分页 / 跳转关联

### 平台层 MVP（追加 — 范围扩展 2026-04-28，来自用户决策方案 Y）

| # | 功能 | UV | MD | TF | IN | 总分 | 来源 |
|---|---|---|---|---|---|---|---|
| **P12** | **三层 KB + RAG（Company / Department / Personal）** | 5 | 4 | 4 | 4 | 22 | F14 升 MVP |
| **P13** | **三层 Skill registry（Company / Department / Personal）+ 优先级** | 5 | 4 | 4 | 4 | 22 | F15 升 MVP |
| **P14** | **Personal scope 跨设备同步**（员工换 agent runtime / 换电脑不丢自己的 KB / skill） | 4 | 5 | 4 | 5 | 22 | F14 / F15 衍生 |

**附 P12-P14 详细描述：**

**P12 — 三层 KB + RAG**
- 用户故事：作为员工/管理员，我想给 agent 提供分级的共享认知（公司 wiki + 部门资料 + 我自己的笔记），以便 agent 检索时按权限拉到相关内容
- 核心交互：admin 上传 Company KB；dept manager 上传 Department KB；员工自己上传 Personal KB；agent 通过 `firefly.kb.search(query, scope?)` 调用，scope 默认 = company + 自己 dept + personal
- 技术关键词：pgvector / chunking / embedMany / RBAC 多 scope filter
- 不做 V1：Project scope（依赖项目动态组织 V0.2）/ 文档版本控制 / 协作编辑

**P13 — 三层 Skill registry + 优先级**
- 用户故事：作为员工/管理员，我想给 agent 装载分级的 skill（公司通用 + 部门特化 + 我自创），以便 agent 在不同场景调用合适工具
- 核心交互：3 层 skill 各自 CRUD；agent 接入时 server 推送 = 所有 Company + 所属 Dept + 该员工 Personal；优先级 Personal > Department > Company（员工可在自己 scope 覆盖上层）
- 技术关键词：agentskills.io 标准 / scope-aware loader / 冲突解决策略
- 不做 V1：Self-improving skill 收纳（F16 V2）/ public scope（用户社区 skill 市场）

**P14 — Personal scope 跨设备同步**
- 用户故事：作为员工，我想换 agent runtime（OpenClaw → Hermes）或换电脑后我的 KB 和 skill 不丢
- 核心交互：Personal KB / Skill 存 server；新设备 agent 接入用 token 后自动拉自己 personal scope 的所有内容
- 技术关键词：token 绑定 employee_id；server 是 source of truth
- 创新点：firefly-mesh 在 BYO-agent 上下文下的独特卖点——Clawith / SwarmClaw / ClawTeam 都没做（它们 agent 自己管 memory，换 runtime 就丢）

### 业务场景层 MVP（端到端业务流程）

| # | 场景 | UV | MD | TF | IN | 总分 | 依赖平台层 |
|---|---|---|---|---|---|---|---|
| W1 | CEO 任务扩散 demo | 4 | 4 | 4 | 3 | 19 | P1–P11 全部 |
| W2 | Cyberautonomy Day-1 dogfooding 配置包 | 4 | 5 | 5 | 5 | 23 | W1 + P12 + P13 |

#### 场景层功能详细描述

**W1 — CEO 任务扩散 demo**
- 用户故事：作为 CEO，我想给我的 agent 下达战略指令（"准备 Q3 华东市场拓展"），以便看到任务自动拆解到部门、员工 agent 接收、协作完成、审核通过
- 核心交互：
  1. CEO 在自己的 OpenClaw 里说："Q3 华东市场拓展，3 周内出方案"
  2. CEO 的 agent 调 `firefly.task.create_and_dispatch(...)` → server LLM 拆解到销售 / 运营 / 法务部门
  3. CEO web UI 看到拆解方案 → 点"批准下达"（HITL 点 1）
  4. 销售 manager / 运营 lead / 法务 counsel 的 agent 收到任务 → 他们各自的员工查看 inbox → 协作执行
  5. 员工提交（HITL 点 2）→ 上级 agent 给审核建议 → 上级员工批准（HITL 点 3）
  6. CEO 在 web UI 看到完整流转 + audit
- 技术关键词：LLM 任务拆解 / skill match 路由 / 多级 HITL / SSE 任务流可视化
- 依赖：P1, P2, P5, P7, P8, P9, P10, P11

**W2 — Cyberautonomy Day-1 dogfooding 配置包**
- 用户故事：作为 Cyberautonomy 内部首批用户，我想开箱即用一组 SOP / skill / KB 模板，以便第一天就替代部分协作工具
- 核心交互：
  1. seed script 自动配置 Cyberautonomy 组织结构（部门 / 员工 / 角色）
  2. 内置 skill：日报生成、PR review、跨部门信息同步、客户邮件起草
  3. 内置 SOP：周报流程、客户咨询响应流程、安全事件升级流程
  4. 内置 KB：产品文档 / 内部 wiki / 历史决策案例
  5. 第一天起，Cyberautonomy 员工接入即可看到任务、收发 A2A、用 skill
- 技术关键词：seed data / skill 模板 / SOP 模板 / KB 初始化
- 依赖：W1（CEO 任务扩散流程）+ 平台层全部

### V2（下一步做）

> **范围调整 2026-04-28**：F14 / F15 已从 V2 提到 MVP（P12 / P13，三层 namespace + Personal 跨设备同步 P14），见前文平台层追加。

| ID | 功能 | 层 | 总分 | V2 推迟理由 |
|---|---|---|---|---|
| F10 | HITL strictness 可调（按部门 / 角色） | 平台 | 24 | MVP 用默认严格度（commit/request/handoff 必批 + inform/sync 自动）；V2 加可配置等级 |
| F09 | A2A 死循环检测 + 自动升级 | 平台 | 22 | MVP 走预算硬限保底；V2 上 thread 长度 + topic 嵌入检测 |
| - | **Project scope KB + Skill** | 平台 | - | P12 / P13 第 4 层；MVP 只 3 层（Company / Dept / Personal）；V0.2 加 Project 级（依赖项目动态组织升级） |
| F23 | 部署 onboarding wizard | 平台 | 20 | MVP 只 docker-compose；V2 加 web UI 引导 |
| F20 | Dashboard 任务流 + 红旗 | 平台 | 18 | MVP 用简单任务列表；V2 全公司任务流可视化 |
| F21 | Agent 接入状态监控 | 平台 | 20 | MVP 只 online/offline；V2 健康度 + 协议版本检测 |
| F16 | Self-improving skill 收纳 | 平台 | 19 | 远期价值高，需 agent runtime 配合 |

### Future（未来考虑）

| ID | 功能 | 层 | 总分 | 推迟理由 |
|---|---|---|---|---|
| F05 | 部门 / 项目双视图（Dagre + 星状） | 平台 | 16 | V2 已有基本 org graph；双视图是老手功能 |
| F13 | LLM 语义 skill 匹配 | 平台 | 17 | V1 用 tag 匹配；语义匹配是 V2.5 |
| F17 | SOP DAG 编辑器 | 场景 | 15 | 老手功能；MVP 用 hardcoded SOP（在 W2 dogfooding 配置包里写死） |
| F24 | 三层预算系统 | 平台 | 16 | MVP 单一 daily budget；分层是大客户需求（A 路径） |

---

## 场景依赖图

```
W1 (CEO 任务扩散)  →  W2 (dogfooding 模板)：
    W1 跑通的 SOP / skill / 路由能力   是   W2 配置包的填充素材
```

无循环依赖。

---

## MVP 总结

**14 个平台层（P1-P11 + P12/P13/P14）+ 2 个场景层 = MVP 16 项**（2026-04-28 用户选方案 Y 后扩展，原 13 项增加 KB / Skill registry / Personal 跨设备同步 三项）。

为什么这个组合是合理的最小集：

- **平台层 P1–P11 是不可分割的**：任何一个缺失都让 demo story 跑不起来——
  - 没 P1 (docker)：admin 部署不了
  - 没 P2 + P3 (skill + MCP)：员工接不上（我们要支持 OpenClaw + Cursor 两个生态）
  - 没 P4 (token)：admin 没法控谁加入
  - 没 P5 (org graph)：不知道谁是谁
  - 没 P6 (JWT scope)：agent 越权无法防
  - 没 P7 (A2A 协议)：跨员工通信回到 Slack 复制粘贴
  - 没 P8 (双向 HITL)：HITL 派的核心卖点没了
  - 没 P9 (inbox UI)：员工没法处理 pending 请求
  - 没 P10 (审计)：没有"治理派"叙事
  - 没 P11 (A2A 追溯)：差异化卖点 (vs Clawith) 没了

- **W1 是一个完整 demo story**：从 CEO 一句话 → 拆解 → 路由 → 员工 → 审核 → 闭环。它把 P1–P11 串成一个能 60 秒 video 演示的产品故事。

- **W2 是 Day-1 dogfooding 验证**：让 Cyberautonomy 自己第一天就用上，是产品 / 市场反馈最强闭环。

**MVP 之外的 V2 / Future 都是"完善"或"深化"，缺了 MVP 仍然能跑且能 demo——但缺了任意 P 或 W，产品都不完整。**

---

## 阶段交接

下一步：**Step 2 (oss-scan)**——按 meta.md §2.3 的 audit 必要性表，对 MVP 13 个功能涉及的关键技术选型逐一 audit + `/last30days`，产出 `2026-04-28-firefly-mesh-oss-scan.md`，同时把发现的更优方案同步到 `MultiAgent/docs/upgrade-backlog.md`。

audit 优先级清单（MVP 涉及）：
1. A2A 协议（Google A2A v1.2 vs 替代）
2. agent skill 标准（agentskills.io / Anthropic Skills / 别的）
3. MCP server SDK（@modelcontextprotocol/sdk-typescript / 替代）
4. AI runtime 库（Vercel AI SDK v6 / 替代）
5. Self-improving skill 框架
6. Per-user 记忆框架（mem0 / Letta / MemGPT，留待 V2）
7. Durable workflow（Inngest / Trigger.dev / DBOS / Restate，MVP 暂不用，但要为 SOP 选好）
8. LLM 路由网关（Vercel AI Gateway / OpenRouter / litellm）
9. Open-source license（Apache 2.0 / BSL / SSPL）
10. Open-source SaaS billing（V2 用，MVP 不用）

---

**Ideation 完成。**
