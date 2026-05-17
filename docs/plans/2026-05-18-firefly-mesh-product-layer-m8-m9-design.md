# M8 + M9 — Design

## 1. 架构影响

| 层 | 变化 |
|---|---|
| Schema | 加 4 张表（knowledge_documents + knowledge_chunks + skills + agent_skills）|
| Lib | 新增 `lib/scope-check.ts`（M8 + M9 共用三层 scope 工具）|
| Routes | 新增 `routes/knowledge.ts` + `routes/skills.ts` |
| 上 sprint 产物 | 不动 |
| 外部依赖 | 无新增（Vectorize binding 推 V1.1）|

## 2. Schema

### 2.1 knowledge_documents

```sql
CREATE TABLE knowledge_documents (
  id                  TEXT PRIMARY KEY,
  org_id              TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  scope               TEXT NOT NULL CHECK (scope IN ('company','department','personal')),
  department_id       TEXT REFERENCES departments(id) ON DELETE CASCADE,
  owner_employee_id   TEXT REFERENCES employees(id) ON DELETE CASCADE,

  title               TEXT NOT NULL,
  description         TEXT,
  tags                TEXT NOT NULL DEFAULT '[]',          -- JSON string[]

  file_type           TEXT NOT NULL CHECK (file_type IN ('md','txt','pdf','docx','html')),
  -- file_url + file_size: M8 only sets these for md/txt (inline content);
  --   pdf/docx/html land in V1.1 with R2 + external parser.
  file_url            TEXT,
  file_size           INTEGER,

  index_status        TEXT NOT NULL DEFAULT 'ready'
    CHECK (index_status IN ('pending','indexing','ready','failed')),
  chunk_count         INTEGER NOT NULL DEFAULT 0,
  embed_model         TEXT,           -- V1.1
  last_indexed_at     TEXT,

  created_by          TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,

  -- Three-tier scope constraint (mirror v0)
  CHECK (
    (scope = 'company'    AND department_id IS NULL  AND owner_employee_id IS NULL)
 OR (scope = 'department' AND department_id IS NOT NULL)
 OR (scope = 'personal'   AND owner_employee_id IS NOT NULL)
  )
);
CREATE INDEX idx_kb_documents_org ON knowledge_documents(org_id);
CREATE INDEX idx_kb_documents_scope_org ON knowledge_documents(org_id, scope);
CREATE INDEX idx_kb_documents_dept ON knowledge_documents(department_id);
CREATE INDEX idx_kb_documents_owner ON knowledge_documents(owner_employee_id);
```

### 2.2 knowledge_chunks

```sql
CREATE TABLE knowledge_chunks (
  id                  TEXT PRIMARY KEY,
  document_id         TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  org_id              TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Denormalised scope (avoids JOIN in RAG hot path; mirrors v0)
  scope               TEXT NOT NULL CHECK (scope IN ('company','department','personal')),
  department_id       TEXT,        -- soft denormalised
  owner_employee_id   TEXT,        -- soft denormalised

  chunk_index         INTEGER NOT NULL,
  content             TEXT NOT NULL,

  -- embedding: BLOB stores serialised float32[] in V1.1 Vectorize sprint;
  -- this sprint leaves NULL.
  embedding           BLOB,

  start_offset        INTEGER,
  end_offset          INTEGER,
  heading_path        TEXT,        -- JSON string[]

  created_at          TEXT NOT NULL
);
CREATE INDEX idx_kb_chunks_doc ON knowledge_chunks(document_id);
CREATE INDEX idx_kb_chunks_org ON knowledge_chunks(org_id);
CREATE INDEX idx_kb_chunks_scope ON knowledge_chunks(org_id, scope);
```

### 2.3 skills

```sql
CREATE TABLE skills (
  id                  TEXT PRIMARY KEY,
  org_id              TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  manifest_id         TEXT NOT NULL,    -- e.g. "firefly-mesh/email-draft"
  version             TEXT NOT NULL,    -- SemVer
  manifest            TEXT NOT NULL,    -- JSON serialised SkillManifest

  scope               TEXT NOT NULL CHECK (scope IN ('company','department','personal')),
  department_id       TEXT REFERENCES departments(id) ON DELETE CASCADE,
  owner_employee_id   TEXT REFERENCES employees(id) ON DELETE CASCADE,

  status              TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','deprecated','archived')),

  created_by          TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,

  CHECK (
    (scope = 'company'    AND department_id IS NULL  AND owner_employee_id IS NULL)
 OR (scope = 'department' AND department_id IS NOT NULL)
 OR (scope = 'personal'   AND owner_employee_id IS NOT NULL)
  )
);
CREATE INDEX idx_skills_org ON skills(org_id);
CREATE INDEX idx_skills_scope_org ON skills(org_id, scope);
CREATE INDEX idx_skills_manifest ON skills(org_id, manifest_id);
-- Application-layer dup check on (org_id, manifest_id, version, scope, ...)
```

### 2.4 agent_skills

```sql
CREATE TABLE agent_skills (
  agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  skill_id   TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  enabled    INTEGER NOT NULL DEFAULT 1,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (agent_id, skill_id)
);
```

## 3. lib/scope-check.ts

```typescript
import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm"
import type { DrizzleD1 } from "../db/connect.ts"
import type { EmployeeRecord } from "../middleware/orgGuard.ts"
import * as schema from "../db/schema.ts"

export type ThreeTierScope = "company" | "department" | "personal"
export type ScopeFilter = "company" | "department" | "personal" | "all"

export async function getMyDepartmentIds(
  db: DrizzleD1,
  employeeId: string,
): Promise<string[]> {
  const rows = await db
    .select({ d: schema.departmentMembers.departmentId })
    .from(schema.departmentMembers)
    .where(eq(schema.departmentMembers.employeeId, employeeId))
  return rows.map((r) => r.d)
}

export function isPrivilegedReader(role: string): boolean {
  return role === "owner" || role === "admin" || role === "auditor"
}

export function isPrivilegedWriter(role: string): boolean {
  return role === "owner" || role === "admin"
}

/**
 * Build a WHERE clause filtering by three-tier scope visibility.
 * Caller supplies the table's scope columns; we OR-combine company /
 * department (member or privileged) / personal (own only).
 */
export function buildScopeReadFilter(opts: {
  scopeCol: SQL.Aliased<string> | unknown
  deptCol: SQL.Aliased<string | null> | unknown
  ownerCol: SQL.Aliased<string | null> | unknown
  myEmployeeId: string
  myDeptIds: string[]
  privileged: boolean
}): SQL | undefined {
  // Return type SQL; caller composes with other conditions via and().
  // Implementation written inline in each route — leaving signature for docs.
  void opts
  return undefined
}

/**
 * Authorize a write at a given scope. Returns null if OK; otherwise an
 * { code, message, status } shape ready to map to c.json().
 */
export async function authorizeScopeWrite(
  db: DrizzleD1,
  opts: {
    employee: EmployeeRecord
    scope: ThreeTierScope
    departmentId: string | null
  },
): Promise<{ code: string; message: string; status: number } | null> {
  if (opts.scope === "company") {
    if (!isPrivilegedWriter(opts.employee.role)) {
      return {
        code: "FORBIDDEN",
        message: "Only owner/admin may publish to company scope",
        status: 403,
      }
    }
  } else if (opts.scope === "department") {
    if (!opts.departmentId) {
      return {
        code: "VALIDATION_ERROR",
        message: "departmentId required for department scope",
        status: 400,
      }
    }
    if (!isPrivilegedWriter(opts.employee.role)) {
      // Must be head of the specific department.
      const rows = await db
        .select({ role: schema.departmentMembers.role })
        .from(schema.departmentMembers)
        .where(
          and(
            eq(schema.departmentMembers.employeeId, opts.employee.id),
            eq(schema.departmentMembers.departmentId, opts.departmentId),
          ),
        )
      const head = rows.find((r) => r.role === "head")
      if (!head) {
        return {
          code: "FORBIDDEN",
          message: "Only department head / admin may publish to department",
          status: 403,
        }
      }
    }
  }
  // personal: always OK; caller forces ownerEmployeeId = self
  return null
}
```

The filter function body lives in each route since Drizzle's type-narrow `or()` needs the actual table columns; I keep the API contract here and inline the SQL for clarity.

## 4. Routes overview

### 4.1 routes/knowledge.ts (7 endpoints)

| Method | Path | Notes |
|---|---|---|
| GET | /api/knowledge | list w/ scope filter (company/department/personal/all) |
| POST | /api/knowledge | inline-text upload (md/txt; pdf/docx 422 NOT_SUPPORTED) |
| GET | /api/knowledge/:id | detail (scope-checked) |
| PATCH | /api/knowledge/:id | title/description/tags/status (creator OR privileged) |
| DELETE | /api/knowledge/:id | (creator OR privileged) — cascades chunks |
| GET | /api/knowledge/:id/chunks | list chunks for a doc |
| GET | /api/knowledge/search?q=&scope= | LIKE %q% in chunks.content within visible scope |

### 4.2 routes/skills.ts (7 endpoints)

| Method | Path | Notes |
|---|---|---|
| GET | /api/skills | list w/ scope filter |
| POST | /api/skills | create — dup check (org, manifestId, version, scope, dept|owner) |
| GET | /api/skills/:id | detail |
| PATCH | /api/skills/:id | manifest/status (creator OR privileged) |
| DELETE | /api/skills/:id | (creator OR privileged) — cascades agent_skills |
| POST | /api/skills/:id/assign | body { agentId } — link agent to skill |
| DELETE | /api/skills/:id/agents/:agentId | unlink |

## 5. POST /api/knowledge (inline) — body

```typescript
zValidator("json", z.object({
  scope: z.enum(["company","department","personal"]),
  departmentId: z.string().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  fileType: z.enum(["md","txt"]),       // only inline-able
  content: z.string().min(1).max(100_000),  // 100 KB cap inline
}))
```

Server-side:
1. authorizeScopeWrite
2. Validate scope-tier ownership / dept combos
3. INSERT knowledge_documents(file_size = content bytes, file_url = null, index_status='ready')
4. Naïve chunker: split on `\n\n` (paragraph) → if any chunk > 1500 chars, further split by `\n`; if still > 2000 chars, by sliding window 1500/200
5. INSERT knowledge_chunks for each (chunk_index 0-based, content, start_offset, end_offset, heading_path optional)
6. UPDATE knowledge_documents.chunk_count = N, last_indexed_at = now
7. writeAudit action='knowledge.uploaded' resource=knowledge_document payload={scope, title, fileType, chunkCount}

## 6. Search (LIKE fallback)

```
GET /api/knowledge/search?q=<text>&scope=all|company|department|personal&limit=20
```

- min 2 chars, max 100
- SELECT … WHERE org_id=? AND (scope visibility filter) AND content LIKE %q%
- LIMIT 20 (configurable up to 100)
- Returns chunks with { id, document_id, scope, content, headingPath, document: { id, title } }
- Note: LIKE is case-sensitive in SQLite by default — use LOWER() both sides; v1.1 Vectorize replaces this

## 7. Skill manifest (zod)

Adopt v0's SkillManifest interface verbatim:

```typescript
const ManifestSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000),
  version: z.string().regex(/^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$/),
  tools: z.array(z.object({
    name: z.string().min(1).max(80),
    description: z.string().max(500),
    inputSchema: z.unknown(),
  })).optional(),
  files: z.array(z.string().max(200)).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
})
```

Stored in skills.manifest as JSON string; deserialised on read.

## 8. Decisions

| ID | 主题 | 选 | 弃 |
|---|---|---|---|
| P22 | embedding 字段保留 schema 不算 | yes | 现在算 |
| P23 | search fallback LIKE | yes | 现在接 Vectorize |
| P24 | inline text only (md/txt) | yes | multipart binary |
| P25 | manifest 复用 v0 zod | yes | 重新设计 |
| P26 | skill loader endpoint 推 V1.1 | yes | 现在做 |
| P27 | 文件存储 R2 推 V1.1 | yes | 现在接 R2 |
| P28 | search case-insensitive via LOWER() | yes | 默认 case-sensitive |
| P29 | tags 改为 JSON string 列（D1 兼容）| yes | 多对多 tag 表 |

## 9. 跨租户硬约束

继承 rules.md §A：所有 SQL 必须 `eq(*.orgId, c.get("tenantId"))`。新增 §V（rules.md 加）：
- knowledge_chunks 跨租户校验通过 document_id JOIN 隐式保证 + 显式 orgId 也加
- agent_skills 校验：先验 agent 属本租户 + skill 属本租户，两者都 OK 才能 link
