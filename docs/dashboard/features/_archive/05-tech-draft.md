# [归档] Feature 05 — 技能与工具 · 技术层草稿

> 状态: 草稿,等 layer-by-layer 迭代。

---

## 数据模型

参见 [`../../reference/data-models.md`](../../reference/data-models.md) §skills。
表:`skills` / `tools` / `router_rules` / `skill_runs` (V1 空) / `tenant_secrets` (AES-256-GCM)。

---

## API 契约

待补全部 (P0/P1):
- Skill CRUD: `GET/POST/PATCH/DELETE /api/tenants/:id/skills/:sid?`
- Tool CRUD + test: `POST /api/tools/:id/test` (HEAD 5s 超时)
- Router rules CRUD + reorder
- skill_runs: V2

详见 [`../../reference/api-needed.md`](../../reference/api-needed.md) §Skills。

---

## 实现状态

| 层 | 状态 |
|---|---|
| Hub D1 migration | ⚠️ 待新增 0008_skills.sql |
| Hub routes (skills/tools/router) | ⚠️ 全待写 |
| Tool test endpoint | ⚠️ V1 简化为 HEAD |
| Dashboard `/skills` 页 | ⚠️ 待还原 |
| Skill 真实执行引擎 | ❌ V1 不做(管理面板优先) |

---

## 迁移步骤

1. D1 migration 0008_skills.sql — 5 张表
2. Hub 新增 routes:`skills.ts` / `tools.ts` / `router-rules.ts`
3. tenant_secrets 加密: `wrangler secret put SECRETS_KEY`(32 字节 base64 + AES-256-GCM)
4. Tool test (V1):`HEAD endpoint` 5s 超时;MCP 类型留 "Cannot test at runtime"
5. Router pattern:`kw:foo` substring / `rx:\bfoo\b` regex,应用层 match
6. 还原 dashboard 页面 + 拖拽用 @dnd-kit
7. 预设模板前端硬编码 (3 个: support triage / sales outreach / research helper)

---

## 技术验收清单

- [ ] Tool secret 加密存储,UI 显示 ••••••
- [ ] Router 拖拽排序持久化
- [ ] 跨 tenant 攻击 → 403
- [ ] member 看不到管理按钮
- [ ] V1 顶部明确提示 "Configurations saved but not executed yet"
