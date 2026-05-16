# Firefly Mesh — Dashboard 文档地图

> **本文档是地图,不是百科**。每一行指向一份独立文档,按需阅读。
>
> 你只需要看这个 README,然后跳到你关心的那份文件。每份文件都自给自足,不需要交叉翻阅。

---

## 0. 这是什么

Firefly Mesh 是"组织内 AI agent 消息平台":同组织内不同员工的 agent 可以互相发消息,owner 通过 inbox 审批(或用规则自动审批)后才让自己的 agent 响应。
Dashboard 是给**人**用的界面,让员工管理自己的设备、审批 agent 收到的消息、配自动规则;让管理员管理团队、知识、技能、看审计。

**本目录的范围**:把 `legacy/v0/packages/web/` 的 Next.js dashboard 还原到 `services/dashboard/`,数据层重写为调用 `hub.firefly-mesh.com`。

---

## 1. 我想看 …

### 🧑‍💼 用户视角 — 这个产品能做什么

按"功能域"组织,每份文档独立完整。先看你关心的功能。

| # | 功能 | 一句话 | 文档 |
|---|---|---|---|
| 1 | **组织内 Agent 消息** | 同事的 agent 发消息给我家 agent,我审批后才送达;支持自动审批规则 | [`features/01-agent-messaging.md`](features/01-agent-messaging.md) |
| 2 | **Agent 接入** | 把 Claude Code / Cursor / 自家 runtime 接入到我的账户 | [`features/02-agent-onboarding.md`](features/02-agent-onboarding.md) |
| 3 | **组织管理** | 团队、员工、部门、项目、邀请同事 | [`features/03-organization.md`](features/03-organization.md) |
| 4 | **知识管理** | 给 agent 喂内部资料,按部门隔离可见性 | [`features/04-knowledge.md`](features/04-knowledge.md) |
| 5 | **技能与工具** | 配置 agent 能做的事 (skill / tool / LLM router) | [`features/05-skills-and-tools.md`](features/05-skills-and-tools.md) |
| 6 | **审计日志** | 看 agent 做了什么、为什么、什么时候 | [`features/06-audit-log.md`](features/06-audit-log.md) |
| 7 | **账户与登录** | 注册、登录、个人设置 | [`features/07-account-and-auth.md`](features/07-account-and-auth.md) |
| 8 | **快速入门** | 新用户第一次进来的 4 步引导 | [`features/08-getting-started.md`](features/08-getting-started.md) |

每份功能文档的结构都一样:
```
1. 是什么 + 谁会用     (1 段话,产品视角)
2. 用户故事            (3-5 个典型场景)
3. UI 入口与界面       (URL + ASCII 线框 + 4 态)
4. 数据模型            (实体 + 关系)
5. API 契约            (端点表 + 已实现/待补)
6. 实现状态            (hub / dashboard 各自状态)
7. 迁移步骤            (从 v0 还原 + 改 fetch + hub 补足)
8. 验收清单            (可勾选)
9. 开放问题            (V1/V2 边界)
```

---

### 🔧 实现视角 — 在哪儿写代码

> **本轮状态**:功能层已 GAN 打磨完成 (features/0*.md 8 份,纯产品视角)。
> 数据 / API / 实现层会在后续 layer-by-layer 迭代中独立打磨,临时归档在 `features/_archive/`。

| 主题 | 文档 |
|---|---|
| 总体架构 + 决策日志 | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| 全部页面的 URL 路由表 + 全局布局 + 主题 | [`reference/ui-pages.md`](reference/ui-pages.md) |
| 所有 D1 表 schema 汇总 (一处可查) | [`reference/data-models.md`](reference/data-models.md) |
| Hub 当前已实现的 31 个 API | [`reference/api-implemented.md`](reference/api-implemented.md) |
| Hub 待新增的 API (按功能分组) | [`reference/api-needed.md`](reference/api-needed.md) |
| 跨域 cookie 与 session (重要) | [`reference/auth-cookie.md`](reference/auth-cookie.md) |
| **每份 feature 的技术层草稿(归档,待迭代)** | [`features/_archive/`](features/_archive/) |

---

### 🚀 执行视角 — 我要把它做出来

按顺序执行 5 步:

| 步骤 | 文档 | 大致工作量 |
|---|---|---|
| 1. 把 v0 代码还原到 `services/dashboard/` | [`migration/01-restore.md`](migration/01-restore.md) | 0.5 天 |
| 2. 把所有 fetch 改写为调 hub | [`migration/02-rewire-fetch.md`](migration/02-rewire-fetch.md) | 1-2 天 |
| 3. Hub 补足缺失端点 | [`migration/03-hub-extend.md`](migration/03-hub-extend.md) | 5-8 天 |
| 4. Cloudflare Pages 部署 | [`migration/04-deploy.md`](migration/04-deploy.md) | 0.5 天 |
| 5. 缩减 PWA 为只剩营销页 | [`migration/05-pwa-retire.md`](migration/05-pwa-retire.md) | 0.5 天 |

部署 runbook 单独一份:[`deployment.md`](deployment.md)。
全局验收清单:[`acceptance.md`](acceptance.md)。

---

## 2. 已有资产 vs 需还原

| 资产 | 位置 | 状态 |
|---|---|---|
| Hub Worker (API + WS + DO + D1) | `services/hub/` | ✅ 在线 `hub.firefly-mesh.com`,31 端点 |
| 营销页 + 极简 PWA | `services/pwa/` | ✅ 在线 `firefly-mesh.com` |
| v0 Dashboard 源码 (Next.js 14) | `legacy/v0/packages/web/` | ⚠️ **已归档,待还原到 `services/dashboard/`** |
| 本文档树 | `docs/dashboard/` | ✅ 本次产出 |

历史教训:此前 edge 重构时误把 v0 dashboard 整体归档,只留下极简 Astro PWA。这是错的 — edge 化只应改"连接方式",不应删整个界面。本文档定义还原方案。详见 [`ARCHITECTURE.md`](ARCHITECTURE.md) §3 决策日志。

---

## 3. 三种 Cloudflare 项目

```
                    用户浏览器
                        │
            ┌───────────┼────────────┐
            ▼           ▼            ▼
  firefly-mesh.com  app.firefly-mesh.com  hub.firefly-mesh.com
    营销页           Dashboard              API + WebSocket
    Astro            Next.js 14             Workers + DO + D1
    Pages            Pages (next-on-pages)  单 Worker
                        │                         ▲
                        └──── fetch + cookie ─────┘
                          cookie 域 .firefly-mesh.com
```

3 个域、2 个 Pages 项目、1 个 Worker。**Dashboard 不持有 server route,所有数据修改都走 Hub**(决策见 ARCHITECTURE §D2)。

---

## 4. 一句话决策

| 主题 | 决策 |
|---|---|
| Dashboard 技术栈 | **保留 Next.js 14 App Router**(还原 v0),不重写 |
| 部署 | Cloudflare Pages + `@cloudflare/next-on-pages` |
| 数据层 | 全部 `fetch(HUB_URL + path, { credentials: 'include' })` |
| 跨域会话 | Better Auth cookie 域设 `.firefly-mesh.com` |
| Astro PWA | 缩减为只剩落地页,dashboard 部分整体退出 |
| V1 范围 | 8 个功能域中 1-4、6、7、8 全实现;5 (Skills) 只做管理面板,执行引擎留 V2 |

---

## 5. 反范围 (不会做)

- ❌ 重新设计 dashboard UI (v0 已定型,见 `docs/plans/2026-04-28-firefly-mesh-ui.md`)
- ❌ 替换 Better Auth / Drizzle / D1 / shadcn 任何一个
- ❌ 把 Next.js 替换为 Astro 或 SvelteKit
- ❌ 在 hub 直接渲染 HTML
- ❌ 拆多个 Worker (单 hub Worker 够用)
- ❌ Skill 执行引擎 (V2 才做,V1 只做管理面板)

---

## 6. 名词表

| 名词 | 含义 |
|---|---|
| **Hub** | `services/hub/`, Cloudflare Workers,API + WebSocket + Durable Object |
| **Dashboard** | `services/dashboard/`, Next.js 14 (本次还原目标),给人用的 UI |
| **PWA** | `services/pwa/`, Astro,迁移后只剩营销页 |
| **Agent** | 由 CLI 配对的 AI agent 实例,持 JWT |
| **Tenant / Org** | 同义,后端命名 tenant,UI 显示 organization |
| **Agent-to-Agent** | 同 tenant 内不同员工的 agent 互发消息(V1 范围;跨 tenant 不在 V1) |
| **Edge stack** | D1 (SQLite) + DO (Durable Object) + Workers + Pages |
| **HITL** | Human-in-the-loop,管理员审批 agent 收到的消息 |

---

## 7. 阅读顺序建议

**第一次读 (40 分钟)**:
1. 本 README (5 分钟)
2. [`ARCHITECTURE.md`](ARCHITECTURE.md) (10 分钟)
3. [`features/01-agent-messaging.md`](features/01-agent-messaging.md) — 产品核心价值:组织内 agent 消息 (10 分钟)
4. [`features/08-getting-started.md`](features/08-getting-started.md) — 新用户第一次接触 (5 分钟)
5. [`migration/01-restore.md`](migration/01-restore.md) + [`migration/04-deploy.md`](migration/04-deploy.md) (10 分钟)

**准备实施 (再 30 分钟)**:
- [`reference/api-needed.md`](reference/api-needed.md) — 知道要补什么
- [`migration/03-hub-extend.md`](migration/03-hub-extend.md) — 知道补的优先级
- [`reference/auth-cookie.md`](reference/auth-cookie.md) — 跨域 session 是最容易踩坑的地方

**写代码时**:对照你正在做的 feature 文档,把 §3 UI / §4 数据模型 / §5 API 三段对齐。

---

## 8. 文档生命周期

- 本次产出为 **v1.0 最终版**。
- 后续如 hub 端点变更 → 只更新 `reference/api-*.md`。
- 如功能边界变更 → 更新对应 `features/0X-*.md`。
- 任何重设计 → 走新流水线 `docs/plans/YYYY-MM-DD-*.md`,**不在此文档树内大改**。
- 索引一致性:本 README 中所有链接必须可点 (CI 可加 link checker)。

---

## 9. 灵感来源 (文档结构)

- **paperclip-docs** (`paperclipai/paperclip-docs`): 按"用户类型 × 任务类型"切分 — 用户视角优先。
- **multica** (`multica-ai/multica`): README 是 index,旁边平铺独立主题文件 — 扁平、易导航。
- **harness engineering** (OpenAI / Anthropic): 地图式渐进披露,顶层一句话 + 指针,细节按需读。

本文档树 = README (地图) + features (用户视角) + reference (开发查表) + migration (执行步骤)。
