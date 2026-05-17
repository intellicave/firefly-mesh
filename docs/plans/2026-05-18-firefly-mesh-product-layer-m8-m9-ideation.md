# M8 + M9 — Ideation

## 1. 一句话定位

**M8** — 给 agent 喂"组织知识"（公司 KB / 部门 KB / 个人笔记），三层 scope 隔离。
**M9** — 注册 agent 可用的"技能/工具"（agentskills.io standard），同样三层 scope，加载时 personal > department > company 优先级解析。

## 2. 为什么

之前 7 个 sprint 完成了组织/员工/部门/项目 + agent 通信 + boundary + tasks 工单流 + a2a 工单层 + audit。**但 agent 还没法访问公司知识、也没注册 skill** —— 这是 V1 完整产品图里最后两块。

v0 已设计好（schema + 路由 + 三层 scope CHECK 约束），edge 重构时跳过，本 sprint 补回。

## 3. 用户故事

### 3.1 Carol 上传公司战略文档

- Carol（admin）在 dashboard `/knowledge` 点"新文档"→ 选 scope=Company + 标题 + 粘贴 markdown 内容
- POST /api/knowledge → server 校验 owner/admin → 创建 document 行 + 自动分块（按段落）写 chunks
- 任何员工的 agent 调"读 KB"时能拿到这份文档
- **本 sprint 简化**：暂时不计算 embedding（V1.1 Vectorize sprint 接），检索用 SQLite LIKE 全文匹配（够小公司用）

### 3.2 Bob 给 Eng 部门加技能 "email-draft"

- Bob 是 Eng 部门 head（v0 行为：dept head 也能给本部门加 skill）
- POST /api/skills body: `{ manifestId: 'firefly-mesh/email-draft', version: '1.0.0', scope: 'department', departmentId: <eng>, manifest: <agentskills.io JSON> }`
- 同 (manifestId, version, scope, dept) 不重复（CHECK + 应用层 dup 检查）
- Alice 的 agent 启动时加载 skill 列表 → 含此 email-draft（Alice 在 Eng）
- 但 Carol 在 Sales 部门 → 不能加载这个 skill

### 3.3 Alice 写个人笔记

- Alice POST /api/knowledge scope=personal → 自动设 ownerEmployeeId=Alice.id
- 只 Alice 的 agent 能读这份文档（其他员工 + 其 agent 看不到，即使 admin 也只能在 audit 看到上传事件）

## 4. 模块清单

### M8 — Knowledge
- 2 新表：`knowledge_documents` + `knowledge_chunks`（CHECK 约束 kb_scope_check）
- 7 endpoint：GET list / POST upload (inline md/txt) / GET :id / PATCH :id / DELETE :id / GET :id/chunks / GET search (LIKE)
- 三层 scope 强制：CHECK + 应用层 assertCanReadScope / assertCanWriteScope
- 简化：embedding 列留 BLOB null（V1.1 填），原文件不存 R2

### M9 — Skills
- 2 新表：`skills` + `agent_skills`（CHECK 约束 skill_scope_check）
- 7 endpoint：GET list / POST / GET :id / PATCH :id / DELETE :id / POST :skillId/assign / DELETE agent_skills/:agentId/:skillId
- 三层 scope 同上 + dup (manifestId, version, scope, dept|owner) 检查
- agent 加载时优先级 personal > department > company（应用层 dedupe，本 sprint 不实施 loader endpoint，仅 schema + CRUD）

## 5. 范围声明

**实现**：4 张表 + 14 endpoint + lib/scope-check.ts + e2e

**不做**：
- multipart 文件上传（pdf/docx 推 V1.1，需 R2 + 外部解析）
- 实际 embedding 计算（推 V1.1 Vectorize sprint）
- 向量相似度搜索（用 LIKE 替代）
- skill 执行引擎（V2）
- agent loader endpoint /api/agents/:id/skills（V1.1，等 skill 执行引擎一起）
- dashboard UI（web 搬迁 sprint）

## 6. 验收

- [ ] 8 份设计文档
- [ ] 2 migrations 本地 apply
- [ ] schema 扩展（4 表）
- [ ] lib/scope-check.ts (M8 + M9 共用)
- [ ] routes/knowledge.ts + routes/skills.ts
- [ ] e2e 覆盖：3 层 scope CRUD + RBAC 各种 deny + search LIKE + skill dup 409
- [ ] 现有 5 e2e 不回归
- [ ] typecheck pass
- [ ] 5-6 atomic commits

## 7. 完成本 sprint 后，**hub 后端 12/12 模块全部 done**，可以专心搬 web 了。
