import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { and, desc, eq, inArray, like, lt, or, sql, type SQL } from "drizzle-orm"
import { nanoid } from "nanoid"
import { z } from "zod"
import * as schema from "../db/schema.ts"
import { drizzleD1 } from "../db/connect.ts"
import type { Bindings } from "../auth.ts"
import { type AuthVariables, requireSession } from "../middleware/auth.ts"
import {
  orgGuard,
  type OrgGuardVariables,
} from "../middleware/orgGuard.ts"
import {
  authorizeScopeWrite,
  canRead,
  getMyDepartmentIds,
  isPrivilegedReader,
  isPrivilegedWriter,
  type ScopeFilter,
  type ThreeTierScope,
} from "../lib/scope-check.ts"
import { writeAudit } from "../lib/audit.ts"

type Vars = AuthVariables & OrgGuardVariables

export const knowledgeRouter = new Hono<{ Bindings: Bindings; Variables: Vars }>()

knowledgeRouter.use("*", requireSession)

const scopeEnum = z.enum(["company", "department", "personal"])
const scopeFilterEnum = z.enum(["company", "department", "personal", "all"])
const fileTypeAll = z.enum(["md", "txt", "pdf", "docx", "html"])

const MAX_INLINE_BYTES = 100 * 1024 // 100 KB cap for md/txt inline upload
const CHUNK_TARGET = 1500 // chars per chunk; soft cap, max 2000

/**
 * Naïve markdown/txt chunker. Split on blank-line paragraphs first; if any
 * paragraph exceeds 2 * CHUNK_TARGET, fall back to sliding window over it.
 * heading_path is a JSON array of nearest `# ... ###` headings above the
 * chunk (only computed for md fileType).
 */
function chunkText(
  content: string,
  fileType: "md" | "txt",
): Array<{ content: string; startOffset: number; endOffset: number; headingPath: string[] }> {
  const result: Array<{
    content: string
    startOffset: number
    endOffset: number
    headingPath: string[]
  }> = []
  const paragraphs = content.split(/\n\s*\n/)
  let cursor = 0
  const headingStack: string[] = []

  for (const para of paragraphs) {
    const startOffset = content.indexOf(para, cursor)
    cursor = startOffset + para.length

    if (fileType === "md") {
      const headingMatch = /^(#{1,6})\s+(.+)$/m.exec(para.trim())
      if (headingMatch) {
        const level = headingMatch[1]!.length
        headingStack.length = level - 1
        headingStack.push(headingMatch[2]!.trim())
      }
    }

    const trimmed = para.trim()
    if (trimmed.length === 0) continue

    if (trimmed.length <= CHUNK_TARGET * 2) {
      result.push({
        content: trimmed,
        startOffset,
        endOffset: startOffset + para.length,
        headingPath: [...headingStack],
      })
    } else {
      // sliding window
      let pos = 0
      while (pos < trimmed.length) {
        const slice = trimmed.slice(pos, pos + CHUNK_TARGET)
        result.push({
          content: slice,
          startOffset: startOffset + pos,
          endOffset: startOffset + pos + slice.length,
          headingPath: [...headingStack],
        })
        pos += CHUNK_TARGET
      }
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// GET /api/knowledge — list with three-tier scope filter
// ---------------------------------------------------------------------------
knowledgeRouter.get(
  "/",
  orgGuard,
  zValidator(
    "query",
    z.object({
      scope: scopeFilterEnum.default("all"),
      deptId: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      tenantId: z.string().optional(),
    }),
  ),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const employee = c.get("employee")
    const q = c.req.valid("query")

    if (!employee) {
      return c.json({ data: { documents: [], nextCursor: null } })
    }

    const myDepts = await getMyDepartmentIds(db, employee.id)
    const privileged = isPrivilegedReader(employee.role)

    const conditions: SQL[] = [eq(schema.knowledgeDocuments.orgId, tenantId)]
    if (q.cursor)
      conditions.push(lt(schema.knowledgeDocuments.createdAt, q.cursor))

    const filter = buildKbScopeFilter(q, employee.id, myDepts, privileged)
    if (filter === "EMPTY") {
      return c.json({ data: { documents: [], nextCursor: null } })
    }
    if (filter === "DEPT_NOT_MEMBER") {
      return c.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Not a member of that department",
          },
        },
        403,
      )
    }
    if (filter) conditions.push(filter)

    const rows = await db
      .select()
      .from(schema.knowledgeDocuments)
      .where(and(...conditions))
      .orderBy(desc(schema.knowledgeDocuments.createdAt))
      .limit(q.limit + 1)

    const hasMore = rows.length > q.limit
    const docs = hasMore ? rows.slice(0, q.limit) : rows
    const nextCursor =
      hasMore && docs.length > 0 ? docs[docs.length - 1]!.createdAt : null

    return c.json({ data: { documents: docs, nextCursor } })
  },
)

function buildKbScopeFilter(
  q: { scope: ScopeFilter; deptId?: string },
  myEmpId: string,
  myDepts: string[],
  privileged: boolean,
): SQL | "EMPTY" | "DEPT_NOT_MEMBER" | undefined {
  const tbl = schema.knowledgeDocuments
  if (q.scope === "company") {
    return eq(tbl.scope, "company")
  }
  if (q.scope === "department") {
    if (q.deptId) {
      if (!privileged && !myDepts.includes(q.deptId)) return "DEPT_NOT_MEMBER"
      return and(eq(tbl.scope, "department"), eq(tbl.departmentId, q.deptId))
    }
    if (privileged) return eq(tbl.scope, "department")
    if (myDepts.length === 0) return "EMPTY"
    return and(
      eq(tbl.scope, "department"),
      inArray(tbl.departmentId, myDepts),
    )
  }
  if (q.scope === "personal") {
    return and(eq(tbl.scope, "personal"), eq(tbl.ownerEmployeeId, myEmpId))
  }
  // all
  const personalFilter = and(
    eq(tbl.scope, "personal"),
    eq(tbl.ownerEmployeeId, myEmpId),
  )
  const companyFilter = eq(tbl.scope, "company")
  const deptFilter = privileged
    ? eq(tbl.scope, "department")
    : myDepts.length > 0
      ? and(eq(tbl.scope, "department"), inArray(tbl.departmentId, myDepts))
      : sql`1=0`
  return or(companyFilter, deptFilter, personalFilter)
}

// ---------------------------------------------------------------------------
// POST /api/knowledge — inline-text upload (md/txt only)
// ---------------------------------------------------------------------------
knowledgeRouter.post(
  "/",
  orgGuard,
  zValidator(
    "json",
    z.object({
      scope: scopeEnum,
      departmentId: z.string().optional(),
      title: z.string().min(1).max(200),
      description: z.string().max(1000).optional(),
      tags: z.array(z.string().max(40)).max(20).optional(),
      fileType: fileTypeAll,
      content: z.string().min(1).max(MAX_INLINE_BYTES),
    }),
  ),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const employee = c.get("employee")
    const body = c.req.valid("json")
    const now = new Date().toISOString()

    if (!employee) {
      return c.json(
        {
          error: {
            code: "NO_EMPLOYEE_PROFILE",
            message: "User has no employee profile",
          },
        },
        403,
      )
    }

    if (body.fileType !== "md" && body.fileType !== "txt") {
      return c.json(
        {
          error: {
            code: "UNSUPPORTED_FILETYPE",
            message:
              "Only md and txt inline uploads in this sprint. pdf/docx/html land in V1.1.",
          },
        },
        422,
      )
    }

    const auth = await authorizeScopeWrite(db, {
      employee,
      scope: body.scope,
      departmentId: body.departmentId ?? null,
    })
    if (auth) {
      return c.json({ error: { code: auth.code, message: auth.message } }, auth.status as 400 | 403 | 404)
    }

    // Cross-tenant guard: if scope=department, dept must belong to tenant.
    if (body.scope === "department" && body.departmentId) {
      const dept = await db
        .select({ id: schema.departments.id })
        .from(schema.departments)
        .where(
          and(
            eq(schema.departments.id, body.departmentId),
            eq(schema.departments.orgId, tenantId),
          ),
        )
      if (dept.length === 0) {
        return c.json(
          {
            error: {
              code: "DEPT_NOT_FOUND",
              message: "departmentId not in this tenant",
            },
          },
          404,
        )
      }
    }

    const docId = `kb_${nanoid(16)}`
    const fileSize = new TextEncoder().encode(body.content).byteLength
    await db.insert(schema.knowledgeDocuments).values({
      id: docId,
      orgId: tenantId,
      scope: body.scope,
      departmentId:
        body.scope === "department" ? body.departmentId ?? null : null,
      ownerEmployeeId: body.scope === "personal" ? employee.id : null,
      title: body.title,
      description: body.description ?? null,
      tags: JSON.stringify(body.tags ?? []),
      fileType: body.fileType,
      fileUrl: null,
      fileSize,
      indexStatus: "ready",
      chunkCount: 0,
      createdBy: employee.id,
      createdAt: now,
      updatedAt: now,
    })

    // Chunk + insert.
    const chunks = chunkText(body.content, body.fileType)
    for (let i = 0; i < chunks.length; i++) {
      const ch = chunks[i]!
      await db.insert(schema.knowledgeChunks).values({
        id: `kch_${nanoid(16)}`,
        documentId: docId,
        orgId: tenantId,
        scope: body.scope,
        departmentId:
          body.scope === "department" ? body.departmentId ?? null : null,
        ownerEmployeeId: body.scope === "personal" ? employee.id : null,
        chunkIndex: i,
        content: ch.content,
        startOffset: ch.startOffset,
        endOffset: ch.endOffset,
        headingPath: JSON.stringify(ch.headingPath),
        createdAt: now,
      })
    }

    await db
      .update(schema.knowledgeDocuments)
      .set({ chunkCount: chunks.length, lastIndexedAt: now })
      .where(eq(schema.knowledgeDocuments.id, docId))

    await writeAudit(db, {
      tenantId,
      actor: { type: "human", id: employee.id },
      action: "knowledge.uploaded",
      resource: { type: "knowledge_document", id: docId },
      payload: {
        scope: body.scope,
        title: body.title,
        fileType: body.fileType,
        chunkCount: chunks.length,
      },
    })

    const rows = await db
      .select()
      .from(schema.knowledgeDocuments)
      .where(eq(schema.knowledgeDocuments.id, docId))
    return c.json({ data: rows[0] }, 201)
  },
)

// ---------------------------------------------------------------------------
// GET /api/knowledge/search — SQLite LIKE fallback (Vectorize → V1.1)
// ---------------------------------------------------------------------------
knowledgeRouter.get(
  "/search",
  orgGuard,
  zValidator(
    "query",
    z.object({
      q: z.string().min(2).max(100),
      scope: scopeFilterEnum.default("all"),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      tenantId: z.string().optional(),
    }),
  ),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const employee = c.get("employee")
    const q = c.req.valid("query")

    if (!employee) {
      return c.json({ data: { results: [] } })
    }

    const myDepts = await getMyDepartmentIds(db, employee.id)
    const privileged = isPrivilegedReader(employee.role)
    const tbl = schema.knowledgeChunks

    const conditions: SQL[] = [
      eq(tbl.orgId, tenantId),
      // case-insensitive LIKE
      like(sql`LOWER(${tbl.content})`, `%${q.q.toLowerCase()}%`),
    ]

    // Build scope filter on chunks (denormalised columns).
    if (q.scope === "company") {
      conditions.push(eq(tbl.scope, "company"))
    } else if (q.scope === "personal") {
      conditions.push(eq(tbl.scope, "personal"))
      conditions.push(eq(tbl.ownerEmployeeId, employee.id))
    } else if (q.scope === "department") {
      if (privileged) {
        conditions.push(eq(tbl.scope, "department"))
      } else if (myDepts.length > 0) {
        conditions.push(eq(tbl.scope, "department"))
        conditions.push(inArray(tbl.departmentId, myDepts))
      } else {
        return c.json({ data: { results: [] } })
      }
    } else {
      // all
      const personalFilter = and(
        eq(tbl.scope, "personal"),
        eq(tbl.ownerEmployeeId, employee.id),
      )
      const companyFilter = eq(tbl.scope, "company")
      const deptFilter = privileged
        ? eq(tbl.scope, "department")
        : myDepts.length > 0
          ? and(eq(tbl.scope, "department"), inArray(tbl.departmentId, myDepts))
          : sql`1=0`
      const combined = or(companyFilter, deptFilter, personalFilter)
      if (combined) conditions.push(combined)
    }

    const rows = await db
      .select({
        chunkId: tbl.id,
        documentId: tbl.documentId,
        scope: tbl.scope,
        snippet: tbl.content,
        headingPath: tbl.headingPath,
        docTitle: schema.knowledgeDocuments.title,
        docFileType: schema.knowledgeDocuments.fileType,
      })
      .from(tbl)
      .innerJoin(
        schema.knowledgeDocuments,
        eq(schema.knowledgeDocuments.id, tbl.documentId),
      )
      .where(and(...conditions))
      .limit(q.limit)

    return c.json({
      data: {
        results: rows.map((r) => ({
          chunkId: r.chunkId,
          documentId: r.documentId,
          scope: r.scope,
          snippet: r.snippet.slice(0, 280),
          headingPath: r.headingPath ? safeParseArr(r.headingPath) : [],
          document: {
            id: r.documentId,
            title: r.docTitle,
            fileType: r.docFileType,
          },
        })),
      },
    })
  },
)

function safeParseArr(s: string): string[] {
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// GET /api/knowledge/:id — detail with scope visibility check
// ---------------------------------------------------------------------------
knowledgeRouter.get("/:id", orgGuard, async (c) => {
  const db = drizzleD1(c.env)
  const tenantId = c.get("tenantId")
  const employee = c.get("employee")
  const id = c.req.param("id")

  if (!employee) {
    return c.json({ error: { code: "NO_EMPLOYEE_PROFILE", message: "x" } }, 403)
  }

  const rows = await db
    .select()
    .from(schema.knowledgeDocuments)
    .where(
      and(
        eq(schema.knowledgeDocuments.id, id),
        eq(schema.knowledgeDocuments.orgId, tenantId),
      ),
    )
  const doc = rows[0]
  if (!doc) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Knowledge document not found" } },
      404,
    )
  }

  const myDepts = await getMyDepartmentIds(db, employee.id)
  if (
    !canRead(
      {
        scope: doc.scope as ThreeTierScope,
        departmentId: doc.departmentId,
        ownerEmployeeId: doc.ownerEmployeeId,
      },
      { employeeId: employee.id, role: employee.role, myDeptIds: myDepts },
    )
  ) {
    return c.json(
      { error: { code: "FORBIDDEN", message: "Not visible to you" } },
      403,
    )
  }

  return c.json({ data: doc })
})

// ---------------------------------------------------------------------------
// PATCH /api/knowledge/:id — title / description / tags / status
// ---------------------------------------------------------------------------
knowledgeRouter.patch(
  "/:id",
  orgGuard,
  zValidator(
    "json",
    z.object({
      title: z.string().min(1).max(200).optional(),
      description: z.string().max(1000).nullable().optional(),
      tags: z.array(z.string().max(40)).max(20).optional(),
      indexStatus: z
        .enum(["pending", "indexing", "ready", "failed"])
        .optional(),
    }),
  ),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const employee = c.get("employee")
    const id = c.req.param("id")
    const body = c.req.valid("json")

    if (!employee) {
      return c.json({ error: { code: "NO_EMPLOYEE_PROFILE", message: "x" } }, 403)
    }

    const rows = await db
      .select()
      .from(schema.knowledgeDocuments)
      .where(
        and(
          eq(schema.knowledgeDocuments.id, id),
          eq(schema.knowledgeDocuments.orgId, tenantId),
        ),
      )
    const doc = rows[0]
    if (!doc) {
      return c.json({ error: { code: "NOT_FOUND", message: "x" } }, 404)
    }

    const isCreator = doc.createdBy === employee.id
    if (!isCreator && !isPrivilegedWriter(employee.role)) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "Only creator or admin may edit" } },
        403,
      )
    }

    const patch: Partial<typeof schema.knowledgeDocuments.$inferInsert> = {}
    if (body.title !== undefined) patch.title = body.title
    if (body.description !== undefined) patch.description = body.description
    if (body.tags !== undefined) patch.tags = JSON.stringify(body.tags)
    if (body.indexStatus !== undefined) {
      if (!isPrivilegedWriter(employee.role)) {
        return c.json(
          { error: { code: "FORBIDDEN", message: "Only admin may change index_status" } },
          403,
        )
      }
      patch.indexStatus = body.indexStatus
    }
    patch.updatedAt = new Date().toISOString()

    await db
      .update(schema.knowledgeDocuments)
      .set(patch)
      .where(eq(schema.knowledgeDocuments.id, id))

    await writeAudit(db, {
      tenantId,
      actor: { type: "human", id: employee.id },
      action: "knowledge.updated",
      resource: { type: "knowledge_document", id },
      payload: { fields: Object.keys(patch) },
    })

    const next = await db
      .select()
      .from(schema.knowledgeDocuments)
      .where(eq(schema.knowledgeDocuments.id, id))
    return c.json({ data: next[0] })
  },
)

// ---------------------------------------------------------------------------
// DELETE /api/knowledge/:id (creator or privileged)
// ---------------------------------------------------------------------------
knowledgeRouter.delete("/:id", orgGuard, async (c) => {
  const db = drizzleD1(c.env)
  const tenantId = c.get("tenantId")
  const employee = c.get("employee")
  const id = c.req.param("id")

  if (!employee) {
    return c.json({ error: { code: "NO_EMPLOYEE_PROFILE", message: "x" } }, 403)
  }

  const rows = await db
    .select()
    .from(schema.knowledgeDocuments)
    .where(
      and(
        eq(schema.knowledgeDocuments.id, id),
        eq(schema.knowledgeDocuments.orgId, tenantId),
      ),
    )
  const doc = rows[0]
  if (!doc) {
    return c.json({ error: { code: "NOT_FOUND", message: "x" } }, 404)
  }

  const isCreator = doc.createdBy === employee.id
  if (!isCreator && !isPrivilegedWriter(employee.role)) {
    return c.json(
      { error: { code: "FORBIDDEN", message: "Only creator or admin may delete" } },
      403,
    )
  }

  // Chunks cascade via FK.
  await db
    .delete(schema.knowledgeDocuments)
    .where(eq(schema.knowledgeDocuments.id, id))

  await writeAudit(db, {
    tenantId,
    actor: { type: "human", id: employee.id },
    action: "knowledge.deleted",
    resource: { type: "knowledge_document", id },
    payload: { scope: doc.scope, title: doc.title },
  })

  return c.json({ data: { id, deleted: true } })
})

// ---------------------------------------------------------------------------
// GET /api/knowledge/:id/chunks
// ---------------------------------------------------------------------------
knowledgeRouter.get(
  "/:id/chunks",
  orgGuard,
  zValidator(
    "query",
    z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      tenantId: z.string().optional(),
    }),
  ),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const employee = c.get("employee")
    const id = c.req.param("id")
    const q = c.req.valid("query")

    if (!employee) {
      return c.json({ error: { code: "NO_EMPLOYEE_PROFILE", message: "x" } }, 403)
    }

    // Visibility via parent doc.
    const docRows = await db
      .select()
      .from(schema.knowledgeDocuments)
      .where(
        and(
          eq(schema.knowledgeDocuments.id, id),
          eq(schema.knowledgeDocuments.orgId, tenantId),
        ),
      )
    const doc = docRows[0]
    if (!doc) {
      return c.json({ error: { code: "NOT_FOUND", message: "x" } }, 404)
    }
    const myDepts = await getMyDepartmentIds(db, employee.id)
    if (
      !canRead(
        {
          scope: doc.scope as ThreeTierScope,
          departmentId: doc.departmentId,
          ownerEmployeeId: doc.ownerEmployeeId,
        },
        { employeeId: employee.id, role: employee.role, myDeptIds: myDepts },
      )
    ) {
      return c.json({ error: { code: "FORBIDDEN", message: "x" } }, 403)
    }

    const conditions: SQL[] = [eq(schema.knowledgeChunks.documentId, id)]
    if (q.cursor) conditions.push(lt(schema.knowledgeChunks.createdAt, q.cursor))

    const rows = await db
      .select()
      .from(schema.knowledgeChunks)
      .where(and(...conditions))
      .orderBy(schema.knowledgeChunks.chunkIndex)
      .limit(q.limit + 1)

    const hasMore = rows.length > q.limit
    const chunks = hasMore ? rows.slice(0, q.limit) : rows
    const nextCursor =
      hasMore && chunks.length > 0 ? chunks[chunks.length - 1]!.createdAt : null

    return c.json({ data: { chunks, nextCursor } })
  },
)
