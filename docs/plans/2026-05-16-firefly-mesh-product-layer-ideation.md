# firefly-mesh product-layer — Ideation

> **本 sprint 是对 edge sprint 部分决策的反转**：edge meta §2.1（vibe coder 个人画像）+ §3.2（21 表 schema 简化到 9 表）+ §8 反范围（"不做企业级 IAM"）都被部分撤回。其余 edge D1-D8 技术决策（D1 不做 P2P、D2 E2E 加密、D3 全栈 Cloudflare、D4 自有账号、D5 Device Pairing、D6 A2A 协议、D7 Self-host Docker、D8 不做 Double Ratchet）**全部保留**。详见 [meta.md §3](2026-05-16-firefly-mesh-product-layer-meta.md)。

---

## 1. 一句话定位

把 v0 的**组织协作产品层**（员工 / 部门 / 项目 / 知识 / 技能 / 任务 / 审计扩展）按 edge 的技术栈（Hono + D1 + DO + Better Auth + E2E）重新实现到 hub。Hub 当前的 agent 通信原语作为**底层基础设施**保留，agent 重新成为"员工的设备/runtime"，不再是顶层实体。

---

## 2. 为什么这次反转 edge 的部分决策

### 2.1 edge 重构丢的东西

edge sprint 在 2026-05-08 决定从 v0 重写时，**用户画像同步换了**——从"企业员工 + 部门 + 项目"换成"vibe coder 个人 + 小团队"。这导致它把 v0 全部 11 个 schema 文件（org/agent/audit/auth/boundary/knowledge/org/skill/task/token/a2a）压缩成 hub 当前的 15 表（其中只有 agent / message / thread / pre-key 是真业务，其余是 Better Auth + 配对 + 推送基础设施）。

结果：
- hub 当前**没有员工**、**没有部门**、**没有项目**、**没有知识**、**没有技能管理**、**没有任务**、**没有 RBAC 角色系统**、**没有审计扩展字段（actorType / resourceType / payload）**
- v0 dashboard 的 14 个页面 + 48 个 API route 全部失去对应后端
- v0 的 8000+ 行代码（已 GA / 已测）变成 `legacy/v0/` 归档

### 2.2 用户真实意图（2026-05-16 重新对齐）

经过 2026-05-12 ~ 2026-05-15 的产品复盘 + 路演反馈，CEO 确认产品**是组织内员工用 agent 协作**，不是 vibe coder 个人 agent mesh。

- vibe coder 不是错的方向，但它是**未来 V2 的延伸**，不是 V1 的起点
- V1 起点必须是 v0 那一套：员工 / 部门 / 项目 / 知识 / 技能 / 任务 / 审计
- hub 的 agent 通信底座是对的（E2E + 加密 + WS + DO）—— 它应该作为**员工的 agent 设备**之间互发消息的引擎，**而不是把 agent 当作顶层实体**

### 2.3 这次怎么做不一样

1. **以 v0 产品层为语义权威**（不是 hub 当前实体）
2. **以 hub 架构组件为技术底座**（不重写底层）
3. **agent 是员工的附属概念**（runtime/设备绑定到 employee，不是直接绑到 user）
4. **保留 edge 学到的工程教训**：D1 + DO + WS + Better Auth + 加密层、命名约定、cron lease、rate limit、E2E 测试模式

---

## 3. 用户画像

### 3.1 主用户：企业员工

- 在公司里有职位（title / role / dept）
- 通过 dashboard 看到自己的 agent 收到的消息、要审批的请求、自己派发的任务进度
- 通过 agent 让 AI 帮自己干活（写邮件、查文档、起草方案）
- agent 可以替自己跟同事的 agent 协作（agent-to-agent，但人保留审批权）
- 心理价位：公司付费，员工不出钱

### 3.2 次用户：admin（owner / admin / manager）

- 配组织 / 创建部门 / 邀请员工
- 配三层 KB（公司 / 部门 / 个人）
- 配 skill 库 + 部门授权
- 看审计日志、配审批规则
- 关心：合规、数据隔离、可审计

### 3.3 第三用户：auditor

- 只读权限
- 看审计日志、看任务历史、看 KB 引用
- 不能改任何业务数据

### 3.4 不是用户

- 个人开发者 vibe coder（V2 延伸，不在 V1）
- 跨公司 agent 协作（V3 远期，安全模型不同）
- LLM 推理服务用户（永不做）
- 项目管理工具用户（不抢 Linear / Jira / Asana）

---

## 4. 用户旅程（首次成功路径）

### 4.1 Carol 创建公司（admin 视角，10 分钟）

1. 访问 `firefly-mesh.com` → 注册（邮箱 + 密码 / Google OAuth）
2. 创建 org "Acme Inc"（自动成为 owner）
3. 在 dashboard 配 3 个部门（Engineering / Product / Sales）
4. 邀请 5 个员工（邮件邀请，员工点链接进入 onboarding）
5. 给每个部门指定 head
6. 上传 2 份公司 KB 文档（Q3 战略 / 员工手册）
7. 启用 2 个 skill（draft-email / search-web）授权到 Engineering

### 4.2 Alice 加入并配 agent（员工首次，2 分钟）

1. 收到邀请邮件 → 点链接 → 用 GitHub OAuth 登录
2. 进 onboarding：填 name / title / dept → 完成
3. 进 `/me/devices` → 看到"配对 Claude Code"按钮 → 复制 8 位 device code
4. 在本地 Claude Code 里 `firefly-mesh pair <code>` → JWT 颁发 + 私钥本地生成
5. dashboard 端实时显示 "✓ alice-claude-desktop connected"

### 4.3 Alice 的 agent 帮她协作（首次消息，30 秒）

1. Alice 让 Claude Code："帮我问 Bob，Q3 spec 的 deadline 是哪天？"
2. Claude Code 通过 A2A 给 Bob 的 agent 发 `request` 消息（hub 转发，E2E 加密）
3. Bob 在 dashboard 收到 🟡 inbox 通知（Web Push 也推到他手机）
4. Bob 看消息 + "Approve auto-reply" → Bob 的 agent 自动回 "Aug 25"
5. Alice 的 Claude Code 拿到答复，继续给 Alice 起草下一封邮件

### 4.4 Carol 看审计（admin 周复盘，5 分钟）

1. 进 `/audit` → 时间筛选"过去 7 天"
2. 看到 132 条 agent 行为 + 8 条 admin 操作
3. 按 actor 过滤："Alice 的 agent 干了什么"
4. 一行展开：查到具体 KB 引用 + 任务链 + 消息线程
5. 导出 CSV 给合规留档

---

## 5. 价值主张

### 5.1 vs 用 Slack / 飞书让人转发 AI 工作

- Slack 里 AI 输出贴对话框，没有审批 / 没有线程归集 / 没有审计
- 本产品：agent 之间直接通信，人审批，所有交互入 audit_log，可追溯

### 5.2 vs 让 Cursor / Claude Code 每人各干各的

- 各干各的没法跨员工协作
- 本产品：agent-to-agent 协议 + 三层 KB + 部门授权，让 AI 知道"该问谁、该查哪份资料、该用哪个 skill"

### 5.3 vs 企业级 IAM (Okta / Auth0)

- 本产品**不抢** IAM，但内置了"足够用"的组织 / 部门 / 角色 / 邀请，让中小公司即开即用
- 大公司可以 SSO 接 IDP（V1.1 加 SAML / OIDC IdP 模式）

### 5.4 vs 项目管理工具 (Linear / Asana)

- 本产品**不抢**项目管理，但 `tasks` 表是为了"让 agent 知道当前手头有哪些任务"，是 agent 协作的协调单元，不是 PM 用的看板

---

## 6. MVP 模块清单（产品层全图）

按 v0 的 11 个 schema 文件映射到本 sprint 的模块清单：

| # | 模块 | 来源 v0 schema | hub 现有 | 本 sprint 处理 |
|---|---|---|---|---|
| **M1** | **Organizations**（组织） | org.ts `organizations` | tenants（语义匹配） | **复用 tenants 表 + 语义层包装为 organizations API** |
| **M2** | **Employees**（员工） | org.ts `employees` | memberships（不够） | **新表 `employees`** + 保留 memberships 作系统级 RBAC |
| **M3** | **Departments**（部门 + 部门成员） | org.ts `departments`, `department_members` | 无 | **新 2 表** |
| **M4** | **Projects**（项目 + 项目成员） | org.ts `projects`, `project_members` | 无 | **新 2 表** |
| **M5** | **Agents 重归属** | agent.ts（owner_employee_id） | agents（owner_user_id） | **ALTER agents ADD COLUMN owner_employee_id + runtime_kind + runtime_meta** |
| **M6** | **Boundary**（agent JWT 作用域） | boundary.ts `representation_boundaries` | 无 | **新表** |
| **M7** | **Agent Tokens**（一次性激活 token） | token.ts `agent_tokens` | devicePairingCodes（不够） | **新表 `agent_tokens`** 配合 devicePairingCodes 共存 |
| **M8** | **Knowledge**（三层 KB） | knowledge.ts `knowledge_documents`, `knowledge_chunks` | 无 | **新 2 表（向量列暂用 BLOB / 主搜先 LIKE，Vectorize 接入 V0.2）** |
| **M9** | **Skills**（agentskills.io 注册） | skill.ts `skills`, `agent_skills` | 无 | **新 2 表** |
| **M10** | **Tasks**（任务派发 / 审批 / 复核） | task.ts `tasks` | 无 | **新表 + HITL 状态机** |
| **M11** | **A2A 产品层**（unencrypted summary metadata + HITL） | a2a.ts `a2a_threads`, `a2a_messages` | threads / messagesMeta / pendingMessages（加密层，无 HITL/7 类型） | **新 2 表，调用 hub 加密层** |
| **M12** | **Audit 扩展** | audit.ts `audit_log`（多 6 列） | auditLog（4 列） | **ALTER auditLog ADD COLUMN actor_type / resource_type / resource_id / payload** |

### 首 sprint（本次 sleep run）实现范围

**只实现 M1 + M2 + M3 + M4**（员工/部门/项目基础四件套）：
- M1：定义 organizations API（复用 tenants 表，加 alias 层）
- M2：新建 employees 表 + 完整 CRUD + RBAC（5 角色）+ 邀请绑定流
- M3：新建 departments + department_members 表 + CRUD + 部门成员管理
- M4：新建 projects + project_members 表 + CRUD + 状态机（planning/active/done/archived）

**只出 plan、不实现**：M5 ~ M12（agent 重归属 / boundary / tokens / knowledge / skills / tasks / a2a 产品层 / audit 扩展）

---

## 7. 不做的事（anti-scope）

| 类别 | 不做 | 理由 |
|---|---|---|
| 平台扩张 | LLM 推理 API | 我们不是 OpenAI |
| 平台扩张 | IM 即时通讯 | agent 间消息不是给人闲聊的 |
| 平台扩张 | 完整 IAM (SAML/OIDC IdP) | V1.1 再考虑，当前用 Better Auth + OAuth providers 够 |
| 平台扩张 | 完整项目管理（看板/甘特图） | tasks 表只为 agent 协调用，不是 Linear 替代 |
| 技术债 | 撤销 D1-D8 任何技术决策 | 这些已在 edge sprint 验证 |
| 技术债 | 重写 hub 加密层 / DO / WS | 它们工作正常，保留 |
| 工程范围 | 在本 sleep run 实现 M5-M12 | 范围太大，下一个 sprint 做 |
| 工程范围 | 在本 sleep run 动 web 层 | hub 产品层补齐后才搬 web（下下个 sprint） |
| 数据层 | DROP hub 现有 8 张基础设施表 | user / session / account / verification / auditLog / devicePairingCodes / oneTimePrekeys / pushSubscriptions 全部保留 |
| 数据层 | 立即重命名 tenants → organizations 物理表 | 加语义层即可，物理表名 V1.1 再决定 |
| 上线 | sleep run 内执行 wrangler deploy | 测试本地通过后由用户手动 deploy |

---

## 8. 成功标准（acceptance criteria 级）

### 8.1 本 sleep run（design 全部 + impl M1-M4）

- [ ] 8 份设计文档全部产出（ideation / design / ui / api / plan / index / rules / meta）
- [ ] meta.md 显式记录 edge §2.1 / §3.2 / §8 反转，保留 D1-D8
- [ ] schema 加 6 表（employees, departments, department_members, projects, project_members；organizations 复用 tenants）
- [ ] migration 0005_product_layer.sql 编写，本地 wrangler d1 migrations apply 成功
- [ ] 4 个新路由（organizations.ts / employees.ts / departments.ts / projects.ts）挂载
- [ ] 中间件 withOrgGuard + withRBAC 新增
- [ ] 每个新路由至少 1 个 integration test
- [ ] `pnpm --filter @firefly-mesh/hub typecheck` 通过
- [ ] `pnpm --filter @firefly-mesh/hub test` 通过
- [ ] 现有 6 路由的 e2e 测试不回归

### 8.2 V1.0 GA（下 4 周）

- [ ] M5-M12 全部实现
- [ ] services/web 从 legacy/v0 搬出 + UI fetch 切到 hub
- [ ] firefly-mesh.com 营销 + app.firefly-mesh.com dashboard 上线
- [ ] 端到端：Carol 创公司 → 邀 Alice → Alice agent 给 Bob agent 发消息 → Bob 审批 → Alice agent 拿回复
- [ ] Stripe billing 接入（独立 sprint）

---

## 9. 跟 edge sprint 关系

完整决策对照见 [meta.md §3](2026-05-16-firefly-mesh-product-layer-meta.md#3-跟-edge-sprint-的关系决策反转-vs-决策保留)。简表：

| edge 决策 | 本 sprint 态度 |
|---|---|
| §2.1 用户画像 = vibe coder 个人 | ❌ 反转 → 企业员工 + admin + auditor |
| §3.2 21 表 → 9 表 | ❌ 反转 → 15 表 → ~30 表（补回 v0 产品层）|
| §8 不做企业级 IAM | ⚠️ 部分反转 → 不做 IAM 替代但内置组织/部门/RBAC |
| D1 不做 P2P | ✅ 保留 |
| D2 E2E 加密 | ✅ 保留 |
| D3 全栈 Cloudflare | ✅ 保留 |
| D4 自有账号 + OAuth | ✅ 保留 |
| D5 Device Pairing | ✅ 保留 |
| D6 A2A 协议 | ✅ 保留 |
| D7 Self-host Docker | ✅ 保留 |
| D8 不做 Double Ratchet | ✅ 保留 |

---

## 10. 开放问题（V1 前需 resolve）

1. **organizations 是否最终重命名 tenants 物理表？** 当前方案：复用 + 语义 alias，V1.1 决定
2. **memberships vs employees 角色映射**：memberships.role 是 owner/admin/member，employees.role 是 owner/admin/manager/employee/auditor，UI 上怎么显示？
3. **agents.owner 改成 employee 还是仍然 user**：v0 用 ownerEmployeeId，hub 用 ownerUserId。建议改 employeeId（更准确），需要 ALTER + 迁移
4. **三层 KB 在 D1 + Vectorize 怎么实现**（v0 用 pgvector）：BLOB 存 embedding + Vectorize index for cosine 搜索，但 D1 free tier 限制要看
5. **HITL 状态机在 hub 加密层 vs 产品层怎么分**：messagesMeta 是加密 metadata，a2a_messages 是产品层 HITL state；同一条逻辑消息双表存？建议是的，由 a2a_messages 引用 messagesMeta.id
6. **agent_tokens vs devicePairingCodes**：v0 是 admin 主动签发"一次性 token 让员工激活 agent"；hub 是"员工在 dashboard 生成 device code 给本地 agent 输入"。两者 UX 不同，可能 V1 只保留 device pairing 流，agent_tokens 推迟到 enterprise SSO 场景再加

这些问题在 design.md 给出技术方案后即可 close。

---
