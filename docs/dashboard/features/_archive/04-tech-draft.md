# [归档] Feature 04 — 知识管理 · 技术层草稿

> 状态: **草稿,待后续 layer-by-layer 迭代**
> 用途: 当前轮只打磨功能层。本文件暂存"数据模型 / API / 实现 / 迁移 / 验收"段落原文,后续单独迭代时从此取出重组到 `docs/dashboard/data/`、`api/`、`migration/`。
> 不在 README 索引中。

---

## (原 §4) 数据模型

```
folders
  id              text PK
  tenant_id       text  FK
  parent_id       text NULL FK -> folders.id
  name            text
  created_at      text

documents
  id              text PK
  tenant_id       text  FK
  folder_id       text  FK
  title           text
  content_md      text          -- V1 上限 256 KB,直接存 D1
  tags            text          -- JSON array
  size_bytes      integer
  created_by      text          -- user_id
  created_at      text
  updated_at      text

boundaries
  id              text PK
  tenant_id       text  FK
  name            text
  description     text
  allowed_folders text          -- JSON array of folder ids
  applied_groups  text          -- JSON array of {kind, id}, kind ∈ {department, role, employee}
  created_at      text
  updated_at      text

-- agent 拉知识时:hub 用 union(employee.department × boundary.applied_groups) → 取 allowed_folders 集合 → 限定 documents 查询
```

详见 [`../../reference/data-models.md`](../../reference/data-models.md) §knowledge。

---

## (原 §5) API 契约

| 操作 | 端点 | 优先级 |
|---|---|---|
| 文件夹列表 | `GET /api/tenants/:id/folders` | P0 |
| 文件夹 CRUD | `POST / PATCH / DELETE /api/tenants/:id/folders/:fid?` | P0 |
| 文档列表 (按 folder) | `GET /api/folders/:fid/documents` | P0 |
| 文档详情 | `GET /api/documents/:id` | P0 |
| 文档 CRUD (写) | `POST / PATCH / DELETE /api/documents/:id?` body 包含 markdown | P0 |
| 文档上传 (multipart) | `POST /api/documents/upload` body multipart | P1 |
| 边界列表 | `GET /api/tenants/:id/boundaries` | P0 |
| 边界 CRUD | `POST / PATCH / DELETE /api/tenants/:id/boundaries/:bid?` | P0 |
| Agent 拉知识 (供 agent 调用) | `GET /api/agent/knowledge?q=...` 按 boundary 裁剪结果 | P1 |

详见 [`../../reference/api-needed.md`](../../reference/api-needed.md) §Knowledge。

---

## (原 §6) 实现状态

| 层 | 状态 |
|---|---|
| Hub knowledge 全部表 | ⚠️ 待新增 (migration 0007) |
| Hub knowledge routes | ⚠️ 全待写 |
| Hub `/api/agent/knowledge` (按 boundary 裁剪) | ⚠️ V1 dashboard 不强依赖 |
| Dashboard `/knowledge` 页 | ⚠️ 待还原 |
| Markdown 渲染 + 编辑 | 沿用 `react-markdown` + `remark-gfm` + `rehype-sanitize`,v0 已用 |

---

## (原 §7) 迁移步骤

1. D1 migration 0007_knowledge.sql — 4 张表
2. Hub 新增 routes:`folders.ts` / `documents.ts` / `boundaries.ts`
   - 全部套 `requireTenant`,写操作套 `requireRole(['owner','admin'])`
   - 读操作 member 模式下按 boundary 裁剪:`WHERE folder_id IN (union(applied_boundaries.allowed_folders))`
3. 大小限制:V1 单 document `content_md` 上限 256KB,服务端校验,超过 413
4. Markdown 安全:用 `rehype-sanitize` 过滤
5. 删除策略:
   - 删 folder:有子项 reject,提供 force 选项递归
   - 删 document:V1 硬删
6. 还原 dashboard 页面:`folder-tree.tsx` / `document-viewer.tsx` / `boundary-editor.tsx`
7. fetch 全部走 `${HUB_URL}${path}` + `credentials: 'include'`

---

## (原 §8) 技术验收清单

- [ ] Folder tree 一级嵌套展开收起
- [ ] 上传 .md/.txt 文档,单文件 ≤256KB
- [ ] 跨 tenant 攻击 → 403
- [ ] XSS 防御:含 `<script>` 的 markdown 渲染时 sanitize

(功能验收已经在新的 features/04 §7 边界与异常路径中重述)
