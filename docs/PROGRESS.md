# Firefly Mesh — 项目进度仪表盘

> **最后更新**：2026-05-18（web 搬迁 sprint A 实施 + 2 轮 reviewer 通过）
> **真实状态来源**：[`docs/pipeline/state.yaml`](pipeline/state.yaml) + git log
> 这一份是给人 5 秒看清现状的总览。任何冲突以 state.yaml + 代码为准。

---

## TL;DR

**hub 后端 12/12 done + dashboard 已搬到 services/web（typecheck + 6/6 e2e 全绿）**，未上线。

```
后端骨架 ████████████████  12/12 模块 done 🎉
前端搬迁 ████████░░░░░░░░  sprint A done（W2' rewrites + 14 路径 rename + 10 UI 禁用 + i18n bootstrap） · sprint B 待
上线准备 ░░░░░░░░░░░░░░░░  完全未动
```

**剩余 ~10 工作日（2 周）到 V1.0 GA**：web 搬迁 B（部署 Cloudflare Pages + 删 v0 server route + 删 pwa）→ Stripe + 法律 + 监控 + soft launch。

---

## 当前在线

| 域名 | 是什么 | 状态 |
|---|---|---|
| `hub.firefly-mesh.com` | API 后端（Hono + D1 + DO + WS + E2E 加密） | ✅ 上线，**待应用最新 7 个 migration 到 remote D1** |
| `firefly-mesh.com` | Astro 营销页 + 临时 PWA 极简 dashboard（5-12 i18n 改造后） | ✅ 上线，**待替换为新 dashboard** |
| `app.firefly-mesh.com` | 完整 Next.js dashboard | ❌ 尚未部署（sprint A 本地能跑，sprint B 部署 Cloudflare Pages）|

---

## hub 后端模块矩阵（12/12）

| # | 模块 | 数据表 | API 端点 | 实施日期 | git commit |
|---|---|---|---|---|---|
| M1 | Organizations | 复用 tenants | 4 | 2026-05-16 | `e32f9ca` ~ `1a02c9c` |
| M2 | Employees | employees (+2 unique idx) | 10 | 2026-05-16 | 同上 |
| M3 | Departments | departments + department_members | 8 | 2026-05-16 | 同上 |
| M4 | Projects | projects + project_members | 10 | 2026-05-16 | 同上 |
| M5 | Agents 重归属 | ALTER agents (+4 cols) | 内部扩展 | 2026-05-17 | `2b26f49` |
| M6 | Boundary scopes | representation_boundaries | 2 | 2026-05-17 | 同上 |
| M7 | Agent tokens（admin 签发） | agent_tokens | 4 | 2026-05-17 | 同上 |
| M11 | A2A 产品层 + HITL 双向状态 | a2a_threads + a2a_messages | 6 | 2026-05-17 | `bbe2258` ~ `f6baf9a` |
| M12 | audit_log 扩展（+4 cols + writeAudit retrofit 11 处） | ALTER audit_log | (无 endpoint) | 2026-05-17 | 同上 |
| M10 | Tasks + HITL 7 态状态机 | tasks | 6 | 2026-05-17 | `9669dc6` ~ `bf04cf8` |
| M8 | Knowledge（3-tier scope）| knowledge_documents + chunks | 7 | 2026-05-18 | `ac945a0` ~ `d573d79` |
| M9 | Skills（agentskills.io） | skills + agent_skills | 7 | 2026-05-18 | 同上 |

**累计**：hub D1 从 15 → 22 表；16 个 mounted routers；~80 个新/重构 endpoint；5 套端到端测试全绿（M8-M9 + M10 + M11-M12 + M5-M7 + M1-M4 + 原 agent-mesh）。

---

## 已完成功能（产品视角）

✅ 公司创建（Carol 注册即自动成为 owner employee + tenant + 默认 boundary）
✅ 员工管理（5 角色 owner/admin/manager/employee/auditor，邀请绑定，self-protect，last-owner guard）
✅ 部门管理（含父子嵌套，cycle 检测，dept head 角色）
✅ 项目管理（状态机 planning→active→done→archived；project lead 角色）
✅ Agent 配对（device pairing → 自动绑 employee + runtime kind + activated_at）
✅ Agent 权限边界（10 个 scope；JWT 携带 scope claim；旧 JWT 向后兼容自动 default scopes）
✅ Agent token admin 签发（plain 一次性返回；SHA-256 hash；regenerate / revoke）
✅ A2A 产品层（双层模型：messages_meta 加密层 + a2a_messages 业务层；7 类型；双向 HITL）
✅ 任务派发 + 双重审批（assigned → in_progress → pending_review → approved/rejected；reviewRound 计数；assignee 不能 review 自己）
✅ 知识库（公司/部门/个人三层 scope + DB CHECK 兜底；inline md/txt 上传；自动分块；SQLite LIKE 搜索 fallback）
✅ 技能注册（agentskills.io 标准 manifest；3 层 scope；assign 给 agent 含 SCOPE_MISMATCH 防错）
✅ 完整审计（writeAudit 集中 helper；actor type + resource type + JSON payload；11 处现有写入点 retrofit）

## 尚未做的（按用户能感知的优先级排）

❌ **dashboard UI**（front-end 完全未动）—— 用户今天打开 firefly-mesh.com 看不到任何变化
❌ Stripe 付费链路（hub 无 billing schema）
❌ 法律页（ToS / 隐私 / Cookie / 退款）
❌ 监控（Sentry / 告警）
❌ Vectorize 向量检索（M8 是 LIKE fallback）
❌ pdf / docx 知识库上传（M8 仅支持 inline md/txt）
❌ Skill 执行引擎（M9 仅做管理面板）
❌ Agent token client 侧消费 endpoint（M7 仅 admin 签发面）

---

## 5 次 sleep run 累计

| Sprint | 日期 | 模块 | E2E | atomic commits | drift bugs |
|---|---|---|---|---|---|
| 1 | 2026-05-16 | M1-M4 organizations/employees/departments/projects | 11/11 | 5 | 1（tenants.ts bootstrap）|
| 2 | 2026-05-17 | M5-M7 agents+boundary+tokens | 14/14 | 6 | 0 |
| 3 | 2026-05-17 | M11-M12 a2a 产品层 + audit | 10/10 | 6 | 4（test/handler 小 bug）|
| 4 | 2026-05-17 | M10 tasks + HITL | 12/12 | 5 | 1（state machine no-op）|
| 5 | 2026-05-18 | M8-M9 knowledge + skills | 13/13 | 5 | 0 |
| 6 | 2026-05-18 | services/web sprint A (前端搬迁 + 对接 hub) | sprint A reviewer A | 5 (c1e9ac0→bec5a12) | 多轮 reviewer 抓 4C+4H+3M+2L 全修 |
| 7 | 2026-05-18 | hub 后端多 reviewer 加固（arch + sec 双线 + 验证）| 60/60 (无回归) | 5 (55e6021/fd8ec47/8ed87ac/e109255/4f48650) | round-3 reviewer 抓 4C+7H+8M, round-7 抓 1H, round-8 verdict A |
| 8 | 2026-05-18 | Loop 延伸: arch M1/M2 + sprint B plan v3 (4 reviewer 轮) + e2e quality 补 14 phases | 74/74 (新增 e2e) | 11 (86a89a6 → a2a23c7) | sprint B plan reviewer-saturated; e2e quality 抓 4C+4H "docstring 谎称覆盖" 全修, 加 9 phases 错误码钉死 |
| 9 | 2026-05-18 | Ralph loop 持续审查 (round 19-25, 7 轮独立 reviewer): code/arch/sec/rules-adherence 多角度 | 76/76 (M3+H1 e2e 替换 LAST_OWNER → 3 端点对称 FORBIDDEN) | 6 (5363449 → 4fe3297) | round-19 抓 2H+3M (admin-touch-owner 不对称 + tasks RBAC 漏 orgId + audit 持久化未文档化 + D1 batch 误读 + e2e silent assertion 模式); round-21 抓 2H 安全 (WS 升级缺 INTERNAL_SECRET + pair-confirm TOCTOU); round-23 抓 1H+1M (placeholder secret 在 prod 可用 + dept/proj 缺 orgId index); round-25 抓 1L (Q4 batch 例外漏登记). round 24+25 连续 2 轮 clean → exit criterion 满足 |
| **总** | | **12 模块 + 1 前端 + 多 reviewer 加固 + e2e quality 补 + ralph-loop 7 轮** | **76/76** | **54 commits** | **多轮 reviewer 累计抓 22C+27H+27M+13L，22C+27H+23M 全修，剩余 4 Medium 明确登记到 v1.1 / sprint B；Low 1 已修登记** |

每个 sprint 完整 autodev 流水线产出：
- 8 份设计文档（meta / ideation / design / ui / api / plan / rules / index）
- N 个原子 commit（schema / 中间件 / 路由 / 测试 / 文档同步）
- 端到端 e2e 测试覆盖所有 happy path + 关键 RBAC negatives + cross-tenant guards

---

## 下一步路线图

### Sprint 6a — hub 后端 reviewer-driven 加固（✅ 2026-05-18 done，5 commits）

8 轮独立 reviewer（4 sprint A code review + 2 hub arch/sec + 2 hub fix verifier）
累计抓出真实问题 13 Critical + 18 High + 19 Medium + 10 Low：
- Round 1（hub v1 code）: 5C+4H+3M+1L
- Round 2-5（sprint A 设计 v1/v2 + 实施 v1/v2）: 4C+8H+9M+5L
- Round 6a 架构 + 6b 安全: 4C+7H+8M
- Round 7 验证 + 8 final: 1H+5M+2L

修复：
- hub: orgId 漏写 5 处 + JWT 默认 full scope + a2a 非原子写 + TenantHub deliver 无 auth + /me/agents 跨租户漏 + knowledge chunks 缺 orgId + DO deliver silent fail 一致性 + resolveAgent helper 合并 + knowledge PATCH invariant 文档化
- sprint A: rewrites 替代跨域 + app/page.tsx 替换 + 14 路径 rename + 10 UI 禁用 banner + next-intl 从零接入 + 客户端聚合 helper

剩余 Medium/Low: 全部明确登记 (v1.1 索引优化 / sprint B schema 迁移 / 文档已说明的设计约束) — 都不阻塞 sprint B 启动。

### Sprint 6 — services/web 搬迁 A（✅ 2026-05-18 done，commit 7287099）

- ✅ 复制 `legacy/v0/packages/web/` → `services/web/`（+ pnpm workspace 集成）
- ✅ 反转 fetch 策略：Next.js rewrites 代理 `/api/*` → hub（不是跨域 fetch），保留 v0 `/.well-known/agent-card.json`
- ✅ 替换 `app/page.tsx` 为客户端 auth gate（v0 是 RSC 直接调 Postgres）
- ✅ 14 路径 rename + 10 UI 禁用 banner（hub 缺失端点对应功能）
- ✅ 客户端聚合 helper：`lib/{me,org-graph,onboarding}.ts` 替代缺失的 hub 端点
- ✅ 删 5 个 v0 routes（与 hub 路径冲突的：auth/me/knowledge）
- ✅ next-intl 从零 bootstrap（v0 含 dep 但未激活）+ 中文 messages
- ✅ typecheck 全绿；6/6 hub e2e 全绿（hub 一行不动）
- ⏸ 本地浏览器 smoke test 未做（环境受限）；sprint B 配合部署一并做

### Sprint 7 — services/web 搬迁 B（约 3-4 工作日，next）

- 删除剩余 43 个 v0 server route（sprint A 已删 5 个）
- 删 `transpilePackages: @firefly-mesh/core`（W14：sprint A 推迟到此）
- 删 `legacy/v0/packages/core` 从 pnpm-workspace（W13：sprint A 推迟到此）
- 删 services/web/lib/middleware/*（3 个文件，sprint A 保留作为死代码）
- 加 `@cloudflare/next-on-pages`
- Cloudflare Pages 部署到 `app.firefly-mesh.com`
- 跨域 cookie + Better Auth + CORS 端到端联调
- SSE 改为 WS（hub 已有 /ws）：audit / knowledge live 实时更新恢复
- 加 hub 端缺失端点（按优先级）：agents tenant-wide list、multipart upload、CSV bulk import、audit read、org/graph 聚合
- E2E：完整用户旅程
- 删除 `services/pwa/`

### Sprint 8 — go-live（约 5 工作日）

- Stripe Checkout + Webhook + billing schema
- 法律页（ToS / 隐私 / Cookie / 退款 — 用 termly.io 生成）
- 监控（Sentry + 告警）
- 营销页改造（pricing / case-studies / FAQ）
- soft launch + 初批用户

---

## V1.1 / V2 推迟项（明确登记）

| 模块 | 推迟到 | 原因 |
|---|---|---|
| M7 client-side activate-by-token endpoint | V1.1 | device pairing 已够用 |
| M8 Vectorize 向量检索 | V1.1（独立 sprint） | 需要外部 Vectorize binding + 重新设计 chunker |
| M8 pdf / docx 上传 + R2 存储 | V1.1 | 需要外部解析 lib + R2 binding |
| M9 skill loader endpoint | V1.1 | 配合执行引擎一起做 |
| M9 skill 执行引擎 | V2 | 复杂度高 |
| boundary 改后强制刷新 JWT | V1.1 | 当前最坏 90 天 TTL |
| LLM-based task dispatch decomposition | V1.1 | 需要 LLM router 选型 |
| Task sub-tree 嵌套递归 | V1.1 | parent_id / root_id 字段已 ship |
| WS 主动推送 a2a 产品层事件 | V1.1 | 当前依赖 hub 现有 messages_meta 推送 |
| GET /api/audit 读端 | audit-read sprint | M12 只动写入面 |
| audit_log RULE 防篡改 | TBD | D1 不支持 PG RULE，要 cron lease |

---

## 文档地图

| 想了解 | 看这份 |
|---|---|
| 产品定位 + 商业模式 | [README.md](../README.md) |
| 路演材料 | [docs/pitch/2026-05-15-firefly-mesh-incubator-pitch.md](pitch/2026-05-15-firefly-mesh-incubator-pitch.md) |
| 12 个产品模块的完整设计 | [docs/plans/2026-05-16-firefly-mesh-product-layer-*.md](plans/) 系列 + 后续 sprint plans |
| 当前 sprint 状态 | [docs/pipeline/state.yaml](pipeline/state.yaml) |
| 待校验的 dashboard 重建参考 | [docs/dashboard/](dashboard/)（**部分已过期** — 见该目录 README） |
| 历史 sprint 设计史 | [docs/plans/2026-04-28-*.md](plans/) classic / [2026-05-08-*-edge-*.md](plans/) edge |
| 项目地图 + 文件指向 | 各 sprint 的 `*-index.md` |

---

## 反范围（永不做）

继承 [edge meta §8](plans/2026-05-08-firefly-mesh-edge-meta.md#8-不可破坏的产品边界)（含本 sprint §M10-M12 修订）：

- ❌ LLM 推理平台
- ❌ IM 即时通讯（Slack/Discord 替代）
- ❌ git 协作工具
- ❌ 完整 IAM 替代（Okta/Auth0）— 我们内置"够用"的组织/部门/RBAC
- ❌ 完整项目管理（Linear/Asana 替代）— tasks 表只为 agent 协调用

---

## 联系

- 仓库：https://github.com/intellicave/firefly-mesh
- Owner：黄文轩 / CyberAutonomy
- 邮箱：wenxuan@cyberautonomy.io
