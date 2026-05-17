# M8 + M9 — Meta

> Delta-only. 沿用 P1-P21 + edge D1-D8。本 sprint 完成后**hub 后端 12/12 模块全部 done**。

## 关系链

| sprint | 状态 |
|---|---|
| 2026-05-16 M1-M4 | ✅ |
| 2026-05-17 M5-M7 | ✅ |
| 2026-05-17 M10 | ✅ |
| 2026-05-17 M11-M12 | ✅ |
| **2026-05-18 M8 + M9**（本 sprint，hub 后端最后一个）| 🚧 |
| 下一个：web-migration-a | 📅 |

## 新增决策 P22-P29

| ID | 决策 |
|---|---|
| **P22** | embedding 字段 schema 落地，本 sprint 不计算（V1.1 Vectorize sprint 填）|
| **P23** | search fallback SQLite LIKE（V1.1 接 Vectorize cosine）|
| **P24** | M8 上传 inline text only（md/txt）；pdf/docx 推 V1.1 |
| **P25** | M9 manifest = agentskills.io 标准（复用 v0 SkillManifest zod）|
| **P26** | M9 skill loader endpoint 推 V1.1（一起做执行引擎）|
| **P27** | 文件存储 R2 推 V1.1（本 sprint 不接）|
| **P28** | search case-insensitive via LOWER() |
| **P29** | tags JSON string 列（D1 兼容）|

## 不可破坏

- 沿用所有前 sprint 红线
- 新增：
  - knowledge_chunks 跨租户校验通过 doc JOIN 隐式保证 + 显式 orgId 也加
  - agent_skills assign 必须**双重** cross-tenant guard（agent + skill 都属本 tenant）
  - 三层 scope CHECK 约束必须由 DB 兜底（应用层校验 + DB 校验双层）
