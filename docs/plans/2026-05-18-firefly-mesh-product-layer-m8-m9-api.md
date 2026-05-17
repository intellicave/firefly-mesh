# M8 + M9 — API

## 1. Knowledge endpoints (7)

### 1.1 GET /api/knowledge
**Auth**: session + orgGuard
**Query**: `scope=company|department|personal|all (default all), deptId?, cursor?, limit (1-100, def 50), tenantId`
**Response 200**: `{ data: { documents: [...], nextCursor }`
**Errors**: 401 / 400 / 403 (when deptId provided to non-member non-privileged)

### 1.2 POST /api/knowledge
**Auth**: session + orgGuard
**Request**:
```json
{
  "scope": "company|department|personal",
  "departmentId": "dept_..." | null,
  "title": "Q3 product spec",
  "description": "...",
  "tags": ["q3","planning"],
  "fileType": "md" | "txt",
  "content": "# Goals\n\n..."
}
```
**Logic**:
1. authorizeScopeWrite (company → owner/admin, department → admin or head, personal → any)
2. INSERT documents (file_size=byteLength, index_status='ready')
3. Chunker writes chunks rows
4. UPDATE chunk_count + last_indexed_at
5. writeAudit
**Response 201**: `{ data: { id, scope, chunkCount, ... } }`
**Errors**: 401 / 400 / 403 / 404 DEPT_NOT_FOUND / 422 UNSUPPORTED_FILETYPE

### 1.3 GET /api/knowledge/:id
**Logic**: scope-visibility check first (employee role limited)
**Response 200**: `{ data: <full doc row> }`

### 1.4 PATCH /api/knowledge/:id
**Body**: `{ title?, description?, tags?, indexStatus? (admin only) }`
**RBAC**: creator (employee can edit own personal/dept that they created) OR privileged writer
**Response 200**: `{ data: <doc> }`

### 1.5 DELETE /api/knowledge/:id
**RBAC**: creator OR privileged writer
**Response 200**: `{ data: { id, deleted: true } }` — chunks cascade

### 1.6 GET /api/knowledge/:id/chunks
**Query**: `cursor?, limit (1-100, def 50)`
**Logic**: visibility check on parent doc → list chunks
**Response 200**: `{ data: { chunks: [...], nextCursor } }`

### 1.7 GET /api/knowledge/search
**Query**: `q (2-100 chars), scope (default all), limit (1-100, def 20), tenantId`
**Logic**:
- Build scope-visibility filter
- WHERE LOWER(chunks.content) LIKE LOWER('%q%')
- LIMIT
**Response 200**:
```json
{ "data": { "results": [
  { "chunkId", "documentId", "scope", "snippet", "headingPath",
    "document": { "id", "title", "fileType" }
  }, ...
]}}
```

## 2. Skill endpoints (7)

### 2.1 GET /api/skills
Same scope/dept/cursor/limit semantics as knowledge list.

### 2.2 POST /api/skills
**Request**:
```json
{
  "manifestId": "firefly-mesh/email-draft",
  "version": "1.0.0",
  "scope": "company|department|personal",
  "departmentId": "...",
  "manifest": { /* SkillManifest */ }
}
```
**Logic**:
1. authorizeScopeWrite (same rules as knowledge)
2. Validate manifest schema (zod)
3. dup check (org_id, manifest_id, version, scope, dept|owner)
4. INSERT skills status='active'
5. writeAudit
**Response 201**: `{ data: <skill> }`
**Errors**: 401 / 400 / 403 / 409 CONFLICT (dup) / 422

### 2.3 GET /api/skills/:id
**Response 200**: `{ data: { ...skill, manifest: <parsed JSON> } }`

### 2.4 PATCH /api/skills/:id
**Body**: `{ manifest?, status? }`
- manifest update increments stored JSON; version not auto-bumped (client decides whether to POST a new version row instead)
- status → 'active' | 'deprecated' | 'archived'
**RBAC**: creator OR privileged writer
**Response 200**: `{ data: <skill> }`

### 2.5 DELETE /api/skills/:id
Cascades agent_skills.

### 2.6 POST /api/skills/:id/assign
**Body**: `{ agentId }`
**Logic**:
1. Verify agent in same tenant
2. Verify skill visibility for this agent's owner_employee_id (scope check)
3. INSERT agent_skills (on conflict → return existing as 200)
4. writeAudit
**RBAC**: agent owner OR privileged writer
**Response 201**: `{ data: { agentId, skillId, assignedAt } }`

### 2.7 DELETE /api/skills/:id/agents/:agentId
Unlink. RBAC: agent owner OR privileged writer.

## 3. Influence on existing endpoints

| Endpoint | Impact |
|---|---|
| All existing endpoints | 0 (additive sprint) |

## 4. Test contract

Each new endpoint covers:
- 200/201 happy
- 401 no session
- 403 RBAC (esp. employee writing to wrong scope)
- 400 VALIDATION_ERROR
- 404 cross-tenant / not found
- 409 dup (skills only)
- 422 unsupported file type (knowledge POST with fileType='pdf')
