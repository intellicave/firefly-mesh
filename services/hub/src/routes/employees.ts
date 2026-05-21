import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm"
import { nanoid } from "nanoid"
import { z } from "zod"
import * as schema from "../db/schema.ts"
import { drizzleD1 } from "../db/connect.ts"
import type { Bindings } from "../auth.ts"
import { type AuthVariables, requireSession } from "../middleware/auth.ts"
import {
  orgGuard,
  requireRole,
  requireEmployee,
  type OrgGuardVariables,
} from "../middleware/orgGuard.ts"
import {
  assertNotLastOwner,
  LastOwnerError,
  mapEmployeeRoleToMembership,
  syncEmployeeRole,
} from "../lib/employees.ts"
import { writeAudit } from "../lib/audit.ts"

type Vars = AuthVariables & OrgGuardVariables

export const employeesRouter = new Hono<{ Bindings: Bindings; Variables: Vars }>()

employeesRouter.use("*", requireSession)

const employeeRoleEnum = z.enum([
  "owner",
  "admin",
  "manager",
  "employee",
  "auditor",
])
const employeeStatusEnum = z.enum(["active", "archived"])

/**
 * Round-42 H1 fix: project away `userId` from every employee response.
 *
 * `userId` is the Better Auth user identifier — the same value across
 * every tenant a user belongs to. Returning it on the employees response
 * lets ANY tenant member (including the lowest `employee` role) collect
 * cross-tenant identity correlations: if I'm in T1 and T2, and I see
 * `userId=U` on a T1 employee, the same `U` on a T2 employee tells me
 * those two are the same human — a privacy leak that bypasses the
 * tenant boundary entirely. The frontend doesn't need raw userId
 * exposed (current-user identification happens via `/api/employees/me`
 * which trusts the session, not the response field).
 *
 * IMPORTANT: also strip the field on the bootstrap-employee creation
 * response, the role/status PATCH responses, and the DELETE
 * confirmation. Anywhere `schema.employees.$inferSelect` reaches the
 * wire must go through this helper.
 */
function publicEmployeeShape(
  row: typeof schema.employees.$inferSelect,
): Omit<typeof schema.employees.$inferSelect, "userId"> {
  const { userId: _omit, ...rest } = row
  return rest
}

// GET /api/employees — list employees in current tenant
//   query: ?role=&status=&dept=&search=&cursor=&limit=
employeesRouter.get(
  "/",
  orgGuard,
  zValidator(
    "query",
    z.object({
      role: employeeRoleEnum.optional(),
      status: employeeStatusEnum.optional(),
      dept: z.string().optional(),
      search: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      tenantId: z.string().optional(), // consumed by orgGuard, allowed by zod
    }),
  ),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const { role, status, dept, search, cursor, limit } = c.req.valid("query")

    // Build conditions
    const conditions = [eq(schema.employees.orgId, tenantId)]
    if (role) conditions.push(eq(schema.employees.role, role))
    if (status) conditions.push(eq(schema.employees.status, status))
    // Round-39 M2 fix: cursor was destructured but never applied to
    // WHERE — every page returned from row 1. Apply now matching the
    // orderBy column (createdAt desc).
    if (cursor) conditions.push(lt(schema.employees.createdAt, cursor))
    if (search) {
      // Round-26 H sister-fix: escape LIKE metacharacters (% _ \) so a
      // search=`%` doesn't degenerate into "match anything". The list
      // endpoint already returns all tenant members so the bypass here
      // isn't an access-control breach (unlike knowledge.search), but
      // an unescaped LIKE is wrong on its own and would mask future
      // filtering intent (e.g. an "only your department" restriction).
      const escaped = search.toLowerCase().replace(/[\\%_]/g, "\\$&")
      const term = `%${escaped}%`
      const orClause = or(
        sql`LOWER(${schema.employees.name}) LIKE ${term} ESCAPE '\\'`,
        sql`LOWER(${schema.employees.email}) LIKE ${term} ESCAPE '\\'`,
      )
      if (orClause) conditions.push(orClause)
    }

    let employeeIds: string[] | null = null
    if (dept) {
      // Round-3 security M4: confirm the requested department actually
      // lives in this tenant before consuming its membership rows.
      // Without this, a caller can supply a cross-tenant departmentId and
      // use the empty-result vs non-empty-result oracle to enumerate
      // shared employee IDs across tenants.
      const deptRows = await db
        .select({ employeeId: schema.departmentMembers.employeeId })
        .from(schema.departmentMembers)
        .innerJoin(
          schema.departments,
          and(
            eq(schema.departments.id, schema.departmentMembers.departmentId),
            eq(schema.departments.orgId, tenantId),
          ),
        )
        .where(eq(schema.departmentMembers.departmentId, dept))
      employeeIds = deptRows.map((r) => r.employeeId)
      if (employeeIds.length === 0) {
        return c.json({ data: [], nextCursor: null })
      }
      conditions.push(inArray(schema.employees.id, employeeIds))
    }

    const rows = await db
      .select()
      .from(schema.employees)
      .where(and(...conditions))
      .orderBy(desc(schema.employees.createdAt))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const data = hasMore ? rows.slice(0, limit) : rows
    // Round-39 M2 fix: nextCursor must be the createdAt of the last row
    // to match the cursor predicate AND orderBy column (was incorrectly
    // emitting .id, which the cursor WHERE would never compare against
    // a createdAt-ordered column).
    const nextCursor = hasMore ? data[data.length - 1]?.createdAt ?? null : null

    // Round-42 H1 fix: strip userId from each row.
    return c.json({ data: data.map(publicEmployeeShape), nextCursor })
  },
)

// GET /api/employees/me — current user's employee record in this tenant
employeesRouter.get("/me", orgGuard, async (c) => {
  const employee = c.get("employee")
  // Round-42 H1 fix: even on /me, strip userId. The caller already knows
  // their own session userId from /api/auth/get-session; re-emitting it
  // on employee responses creates inconsistency between list and detail.
  return c.json({ data: employee ? publicEmployeeShape(employee) : null })
})

// GET /api/employees/:id — single employee
employeesRouter.get("/:id", orgGuard, async (c) => {
  const db = drizzleD1(c.env)
  const tenantId = c.get("tenantId")
  const id = c.req.param("id")

  const rows = await db
    .select()
    .from(schema.employees)
    .where(
      and(eq(schema.employees.id, id), eq(schema.employees.orgId, tenantId)),
    )

  const employee = rows[0]
  if (!employee) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Employee not found" } },
      404,
    )
  }
  return c.json({ data: publicEmployeeShape(employee) })
})

// POST /api/employees — create employee (owner/admin only)
employeesRouter.post(
  "/",
  orgGuard,
  requireRole(["owner", "admin"]),
  zValidator(
    "json",
    z.object({
      email: z.string().email(),
      name: z.string().min(1).max(100),
      title: z.string().max(100).optional(),
      avatarUrl: z.string().url().optional(),
      role: employeeRoleEnum.default("employee"),
      userId: z.string().optional(),
    }),
  ),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const requester = c.get("employee")!
    const body = c.req.valid("json")
    const now = new Date().toISOString()

    // Creating an owner requires the requester to be an owner.
    if (body.role === "owner" && requester.role !== "owner") {
      return c.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Only an owner can create another owner",
          },
        },
        403,
      )
    }

    // If userId provided, verify the user has a membership in this tenant.
    if (body.userId) {
      const m = await db
        .select({ userId: schema.memberships.userId })
        .from(schema.memberships)
        .where(
          and(
            eq(schema.memberships.tenantId, tenantId),
            eq(schema.memberships.userId, body.userId),
          ),
        )
      if (m.length === 0) {
        return c.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message:
                "userId does not belong to this tenant — invite the user first",
            },
          },
          400,
        )
      }
    }

    // Email uniqueness within tenant (DB also enforces via unique index).
    const existing = await db
      .select({ id: schema.employees.id })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.orgId, tenantId),
          eq(schema.employees.email, body.email),
        ),
      )
    if (existing.length > 0) {
      return c.json(
        {
          error: {
            code: "CONFLICT",
            message: "Employee with this email already exists in this tenant",
          },
        },
        409,
      )
    }

    const employeeId = `emp_${nanoid(16)}`
    await db.insert(schema.employees).values({
      id: employeeId,
      orgId: tenantId,
      userId: body.userId ?? null,
      name: body.name,
      email: body.email,
      title: body.title ?? null,
      avatarUrl: body.avatarUrl ?? null,
      role: body.role,
      status: "active",
      createdAt: now,
    })

    // If we have a userId, ensure membership.role reflects the employee.role.
    if (body.userId) {
      await syncEmployeeRole(db, {
        tenantId,
        employeeId,
        userId: body.userId,
        newRole: body.role,
        joinedAt: now,
      })
    }

    const rows = await db
      .select()
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.id, employeeId),
          eq(schema.employees.orgId, tenantId),
        ),
      )

    // Round-42 H1: strip userId.
    return c.json({ data: rows[0] ? publicEmployeeShape(rows[0]) : null }, 201)
  },
)

// ---------------------------------------------------------------------------
// POST /api/employees/bulk-import — Sprint B B.0
// multipart/form-data with field `file` (CSV) and optional ?mode=dryRun|commit
//
// CSV columns: name,email,title,role
//   - name, email: required
//   - title: optional (empty string treated as null)
//   - role: optional, defaults to "employee" (must be in employeeRoleEnum)
//
// Modes:
//   - dryRun (default): parse + validate, no DB writes; useful for "preview"
//   - commit: actually inserts valid rows
//
// Response shape:
//   { data: { mode, total, valid, invalid, created, errors: Row[] } }
//   - `errors` lists per-row failures with { rowNumber, email?, field?, message }
//   - In commit mode, partial success is possible — valid rows insert, invalid
//     rows return in errors. Use dryRun first if all-or-nothing matters.
//
// Limits:
//   - Max 5000 rows per upload (CF Workers memory + per-row D1 round-trip)
//   - Max 5MB file size (Zod-level)
//
// Auth: orgGuard + owner/admin. Creating an owner role via bulk-import
// requires requester to be owner (mirrors POST /).
// ---------------------------------------------------------------------------

const BULK_IMPORT_MAX_ROWS = 5000
const BULK_IMPORT_MAX_BYTES = 5 * 1024 * 1024 // 5MB

/**
 * RFC-4180 lite CSV parser — handles double-quoted fields with commas,
 * escaped quotes (""), and CRLF/LF line endings. Returns array of string[].
 * Throws on unterminated quoted field.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    // not in quotes
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ",") {
      row.push(field)
      field = ""
      i++
      continue
    }
    if (ch === "\r") {
      // swallow \r before \n; lone \r terminates row too
      if (text[i + 1] === "\n") {
        i++
      }
      row.push(field)
      rows.push(row)
      row = []
      field = ""
      i++
      continue
    }
    if (ch === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
      i++
      continue
    }
    field += ch
    i++
  }
  if (inQuotes) {
    throw new Error("Unterminated quoted field in CSV")
  }
  // last row (if file doesn't end with newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  // strip trailing empty rows (common when file has trailing newline)
  while (rows.length > 0 && rows[rows.length - 1]!.every((c) => c === "")) {
    rows.pop()
  }
  return rows
}

type BulkImportError = {
  rowNumber: number
  email?: string
  field?: string
  message: string
}

employeesRouter.post(
  "/bulk-import",
  orgGuard,
  requireRole(["owner", "admin"]),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const requester = c.get("employee")!
    const mode = c.req.query("mode") === "commit" ? "commit" : "dryRun"
    const now = new Date().toISOString()

    let formData: FormData
    try {
      formData = await c.req.formData()
    } catch {
      return c.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Expected multipart/form-data",
          },
        },
        400,
      )
    }

    const rawFile = formData.get("file")
    if (!rawFile || typeof rawFile === "string") {
      return c.json(
        {
          error: { code: "INVALID_REQUEST", message: "Field `file` is required" },
        },
        400,
      )
    }
    // formData.get() returns FormDataEntryValue (Blob | string | null in
    // Workers types). After the string-check above, narrow to Blob/File.
    const file = rawFile as Blob

    if (file.size > BULK_IMPORT_MAX_BYTES) {
      return c.json(
        {
          error: {
            code: "FILE_TOO_LARGE",
            message: `CSV exceeds ${BULK_IMPORT_MAX_BYTES} byte limit`,
          },
        },
        413,
      )
    }

    const text = await file.text()
    let rows: string[][]
    try {
      rows = parseCsv(text)
    } catch (err) {
      return c.json(
        {
          error: {
            code: "INVALID_CSV",
            message: err instanceof Error ? err.message : "CSV parse error",
          },
        },
        400,
      )
    }

    if (rows.length === 0) {
      return c.json(
        { error: { code: "INVALID_CSV", message: "CSV is empty" } },
        400,
      )
    }

    // Header row must contain at minimum `name,email` (case-insensitive,
    // order-agnostic). title/role optional. Other columns ignored.
    const header = rows[0]!.map((h) => h.trim().toLowerCase())
    const nameCol = header.indexOf("name")
    const emailCol = header.indexOf("email")
    const titleCol = header.indexOf("title")
    const roleCol = header.indexOf("role")
    if (nameCol === -1 || emailCol === -1) {
      return c.json(
        {
          error: {
            code: "INVALID_CSV",
            message: "Header must include at least `name` and `email` columns",
          },
        },
        400,
      )
    }

    const dataRows = rows.slice(1)
    if (dataRows.length === 0) {
      return c.json(
        { error: { code: "INVALID_CSV", message: "No data rows in CSV" } },
        400,
      )
    }

    if (dataRows.length > BULK_IMPORT_MAX_ROWS) {
      return c.json(
        {
          error: {
            code: "TOO_MANY_ROWS",
            message: `Exceeded max ${BULK_IMPORT_MAX_ROWS} rows per import`,
          },
        },
        413,
      )
    }

    // Per-row validation. Build set of existing emails in tenant for dup check.
    const existing = await db
      .select({ email: schema.employees.email })
      .from(schema.employees)
      .where(eq(schema.employees.orgId, tenantId))
    const existingEmails = new Set(existing.map((r) => r.email.toLowerCase()))

    const rowSchema = z.object({
      name: z.string().min(1).max(100),
      email: z.string().email().max(254),
      title: z.string().max(100).optional(),
      role: employeeRoleEnum.optional(),
    })

    const errors: BulkImportError[] = []
    const validRows: { name: string; email: string; title: string | null; role: z.infer<typeof employeeRoleEnum> }[] = []
    const seenEmailsInBatch = new Set<string>()

    for (let i = 0; i < dataRows.length; i++) {
      const r = dataRows[i]!
      const rowNumber = i + 2 // human row number, +1 for header, +1 for 1-indexed

      const rawName = (r[nameCol] ?? "").trim()
      const rawEmail = (r[emailCol] ?? "").trim().toLowerCase()
      const rawTitle = titleCol >= 0 ? (r[titleCol] ?? "").trim() : ""
      const rawRole = roleCol >= 0 ? (r[roleCol] ?? "").trim().toLowerCase() : ""

      const candidate = {
        name: rawName,
        email: rawEmail,
        title: rawTitle || undefined,
        role: rawRole || undefined,
      }

      const parsed = rowSchema.safeParse(candidate)
      if (!parsed.success) {
        const first = parsed.error.issues[0]!
        errors.push({
          rowNumber,
          email: rawEmail || undefined,
          field: first.path.join(".") || undefined,
          message: first.message,
        })
        continue
      }

      const row = parsed.data
      const finalRole = row.role ?? "employee"

      // Owner creation gate (same rule as POST /)
      if (finalRole === "owner" && requester.role !== "owner") {
        errors.push({
          rowNumber,
          email: row.email,
          field: "role",
          message: "Only an owner can create another owner",
        })
        continue
      }

      // Dup against existing employees
      if (existingEmails.has(row.email)) {
        errors.push({
          rowNumber,
          email: row.email,
          field: "email",
          message: "Email already exists in this tenant",
        })
        continue
      }
      // Dup within this CSV batch
      if (seenEmailsInBatch.has(row.email)) {
        errors.push({
          rowNumber,
          email: row.email,
          field: "email",
          message: "Duplicate email earlier in the same CSV",
        })
        continue
      }
      seenEmailsInBatch.add(row.email)

      validRows.push({
        name: row.name,
        email: row.email,
        title: row.title ?? null,
        role: finalRole,
      })
    }

    const total = dataRows.length
    const valid = validRows.length
    const invalid = errors.length

    if (mode === "dryRun") {
      return c.json({
        data: {
          mode: "dryRun",
          total,
          valid,
          invalid,
          created: 0,
          errors,
        },
      })
    }

    // commit mode: insert valid rows. We don't batch insert because we want
    // per-row resilience if one INSERT trips a race-condition email collision
    // that the pre-check missed (two bulk imports in flight). Per-row insert
    // with try/catch keeps partial-success semantics.
    let created = 0
    for (const row of validRows) {
      const employeeId = `emp_${nanoid(16)}`
      try {
        await db.insert(schema.employees).values({
          id: employeeId,
          orgId: tenantId,
          userId: null,
          name: row.name,
          email: row.email,
          title: row.title,
          avatarUrl: null,
          role: row.role,
          status: "active",
          createdAt: now,
        })
        created++
      } catch (err) {
        // Likely race-condition email unique-index violation; report as error.
        errors.push({
          rowNumber: -1, // unknown post-validation
          email: row.email,
          field: "email",
          message:
            err instanceof Error
              ? err.message
              : "DB error inserting row",
        })
      }
    }

    await writeAudit(db, {
      tenantId,
      actor: { type: "human", id: requester.id },
      action: "employees.bulk_imported",
      resource: { type: "tenant", id: tenantId },
      payload: { total, valid, invalid, created },
    })

    return c.json(
      {
        data: {
          mode: "commit",
          total,
          valid,
          invalid: errors.length,
          created,
          errors,
        },
      },
      201,
    )
  },
)

// PATCH /api/employees/:id — update profile fields
// Round-32 H2: requireEmployee prevents `c.get("employee")!` crash for
// users with membership but no profile (e.g. just-accepted invitation).
employeesRouter.patch(
  "/:id",
  orgGuard,
  requireEmployee,
  zValidator(
    "json",
    z.object({
      name: z.string().min(1).max(100).optional(),
      title: z.string().max(100).nullable().optional(),
      avatarUrl: z.string().url().nullable().optional(),
      // Backfill scenario: link an existing user (admin only).
      userId: z.string().nullable().optional(),
    }),
  ),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const requester = c.get("employee")!
    const id = c.req.param("id")
    const body = c.req.valid("json")

    const targetRows = await db
      .select()
      .from(schema.employees)
      .where(
        and(eq(schema.employees.id, id), eq(schema.employees.orgId, tenantId)),
      )
    const target = targetRows[0]
    if (!target) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Employee not found" } },
        404,
      )
    }

    const isSelf = target.id === requester.id
    const isAdmin = requester.role === "owner" || requester.role === "admin"

    // Self can edit limited fields. Non-self requires admin/owner.
    if (!isSelf && !isAdmin) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "Insufficient permissions" } },
        403,
      )
    }
    // userId backfill requires admin/owner regardless of self.
    if (body.userId !== undefined && !isAdmin) {
      return c.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Only admin/owner can set userId",
          },
        },
        403,
      )
    }

    // If linking a userId, verify membership exists.
    if (body.userId) {
      const m = await db
        .select({ userId: schema.memberships.userId })
        .from(schema.memberships)
        .where(
          and(
            eq(schema.memberships.tenantId, tenantId),
            eq(schema.memberships.userId, body.userId),
          ),
        )
      if (m.length === 0) {
        return c.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "userId does not belong to this tenant",
            },
          },
          400,
        )
      }
    }

    const patch: Partial<typeof schema.employees.$inferInsert> = {}
    if (body.name !== undefined) patch.name = body.name
    if (body.title !== undefined) patch.title = body.title
    if (body.avatarUrl !== undefined) patch.avatarUrl = body.avatarUrl
    if (body.userId !== undefined) patch.userId = body.userId

    if (Object.keys(patch).length === 0) {
      return c.json({ data: publicEmployeeShape(target) })
    }

    await db
      .update(schema.employees)
      .set(patch)
      .where(
        and(
          eq(schema.employees.id, id),
          eq(schema.employees.orgId, tenantId),
        ),
      )

    // If userId was set (or cleared) for the first time, sync membership role.
    if (body.userId) {
      await syncEmployeeRole(db, {
        tenantId,
        employeeId: id,
        userId: body.userId,
        newRole: target.role,
        joinedAt: new Date().toISOString(),
      })
    }

    const rows = await db
      .select()
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.id, id),
          eq(schema.employees.orgId, tenantId),
        ),
      )
    return c.json({ data: rows[0] ? publicEmployeeShape(rows[0]) : null })
  },
)

// PATCH /api/employees/:id/role — change role with last-owner & self-protect
employeesRouter.patch(
  "/:id/role",
  orgGuard,
  requireRole(["owner", "admin"]),
  zValidator("json", z.object({ role: employeeRoleEnum })),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const requester = c.get("employee")!
    const id = c.req.param("id")
    const { role: newRole } = c.req.valid("json")

    if (id === requester.id) {
      return c.json(
        {
          error: {
            code: "SELF_NOT_ALLOWED",
            message: "You cannot change your own role",
          },
        },
        403,
      )
    }

    const targetRows = await db
      .select()
      .from(schema.employees)
      .where(
        and(eq(schema.employees.id, id), eq(schema.employees.orgId, tenantId)),
      )
    const target = targetRows[0]
    if (!target) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Employee not found" } },
        404,
      )
    }

    // Only owner can promote/demote to/from owner.
    if (
      (newRole === "owner" || target.role === "owner") &&
      requester.role !== "owner"
    ) {
      return c.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Only an owner can grant or revoke owner role",
          },
        },
        403,
      )
    }

    // Last-owner guard: if demoting an owner, ensure at least one owner remains.
    if (target.role === "owner" && newRole !== "owner") {
      try {
        await assertNotLastOwner(db, tenantId, id, target)
      } catch (err) {
        if (err instanceof LastOwnerError) {
          return c.json(
            { error: { code: "LAST_OWNER", message: err.message } },
            409,
          )
        }
        throw err
      }
    }

    if (target.userId) {
      await syncEmployeeRole(db, {
        tenantId,
        employeeId: id,
        userId: target.userId,
        newRole,
        joinedAt: target.createdAt,
      })
    } else {
      // No user linked → only update employees.role
      await db
        .update(schema.employees)
        .set({ role: newRole })
        .where(
        and(
          eq(schema.employees.id, id),
          eq(schema.employees.orgId, tenantId),
        ),
      )
    }

    const rows = await db
      .select()
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.id, id),
          eq(schema.employees.orgId, tenantId),
        ),
      )
    return c.json({ data: rows[0] ? publicEmployeeShape(rows[0]) : null })
  },
)

// PATCH /api/employees/:id/status — active <-> archived
employeesRouter.patch(
  "/:id/status",
  orgGuard,
  requireRole(["owner", "admin"]),
  zValidator("json", z.object({ status: employeeStatusEnum })),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const requester = c.get("employee")!
    const id = c.req.param("id")
    const { status } = c.req.valid("json")

    if (id === requester.id) {
      return c.json(
        {
          error: {
            code: "SELF_NOT_ALLOWED",
            message: "You cannot change your own status",
          },
        },
        403,
      )
    }

    const targetRows = await db
      .select()
      .from(schema.employees)
      .where(
        and(eq(schema.employees.id, id), eq(schema.employees.orgId, tenantId)),
      )
    const target = targetRows[0]
    if (!target) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Employee not found" } },
        404,
      )
    }

    // Only an owner can modify the status of another owner. Without this
    // guard, an admin could archive an owner — which is a privilege
    // escalation path equivalent to demoting them. This mirrors the
    // owner-only guard on PATCH /:id/role.
    if (target.role === "owner" && requester.role !== "owner") {
      return c.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Only an owner can change another owner's status",
          },
        },
        403,
      )
    }

    // Archiving an owner: last-owner guard. (Reachable only when requester
    // is also an owner — the admin path is blocked above.)
    if (target.role === "owner" && status === "archived") {
      try {
        await assertNotLastOwner(db, tenantId, id, target)
      } catch (err) {
        if (err instanceof LastOwnerError) {
          return c.json(
            { error: { code: "LAST_OWNER", message: err.message } },
            409,
          )
        }
        throw err
      }
    }

    await db
      .update(schema.employees)
      .set({ status })
      .where(
        and(
          eq(schema.employees.id, id),
          eq(schema.employees.orgId, tenantId),
        ),
      )

    const rows = await db
      .select()
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.id, id),
          eq(schema.employees.orgId, tenantId),
        ),
      )
    return c.json({ data: rows[0] ? publicEmployeeShape(rows[0]) : null })
  },
)

// DELETE /api/employees/:id
employeesRouter.delete(
  "/:id",
  orgGuard,
  requireRole(["owner", "admin"]),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const requester = c.get("employee")!
    const id = c.req.param("id")

    if (id === requester.id) {
      return c.json(
        {
          error: {
            code: "SELF_NOT_ALLOWED",
            message: "You cannot delete yourself",
          },
        },
        403,
      )
    }

    const targetRows = await db
      .select()
      .from(schema.employees)
      .where(
        and(eq(schema.employees.id, id), eq(schema.employees.orgId, tenantId)),
      )
    const target = targetRows[0]
    if (!target) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Employee not found" } },
        404,
      )
    }

    // Only an owner can delete another owner. Without this guard, an admin
    // could delete an owner (privilege escalation equivalent to demotion).
    // Mirrors the owner-only guard on /role and /status.
    if (target.role === "owner" && requester.role !== "owner") {
      return c.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Only an owner can delete another owner",
          },
        },
        403,
      )
    }

    if (target.role === "owner") {
      try {
        await assertNotLastOwner(db, tenantId, id, target)
      } catch (err) {
        if (err instanceof LastOwnerError) {
          return c.json(
            { error: { code: "LAST_OWNER", message: err.message } },
            409,
          )
        }
        throw err
      }
    }

    // Cascades automatically remove department_members + project_members
    // via FK ON DELETE CASCADE. memberships row stays (system-level).
    await db
      .delete(schema.employees)
      .where(
        and(
          eq(schema.employees.id, id),
          eq(schema.employees.orgId, tenantId),
        ),
      )

    return c.json({ data: { id, deleted: true } })
  },
)

// GET /api/employees/:id/departments
employeesRouter.get("/:id/departments", orgGuard, async (c) => {
  const db = drizzleD1(c.env)
  const tenantId = c.get("tenantId")
  const id = c.req.param("id")

  // Verify employee belongs to current tenant (cross-tenant guard).
  const empRows = await db
    .select({ id: schema.employees.id })
    .from(schema.employees)
    .where(
      and(eq(schema.employees.id, id), eq(schema.employees.orgId, tenantId)),
    )
  if (empRows.length === 0) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Employee not found" } },
      404,
    )
  }

  const rows = await db
    .select({
      department: schema.departments,
      role: schema.departmentMembers.role,
      joinedAt: schema.departmentMembers.joinedAt,
    })
    .from(schema.departmentMembers)
    .innerJoin(
      schema.departments,
      eq(schema.departments.id, schema.departmentMembers.departmentId),
    )
    .where(
      and(
        eq(schema.departmentMembers.employeeId, id),
        eq(schema.departments.orgId, tenantId),
      ),
    )

  return c.json({ data: rows })
})

// GET /api/employees/:id/projects
employeesRouter.get("/:id/projects", orgGuard, async (c) => {
  const db = drizzleD1(c.env)
  const tenantId = c.get("tenantId")
  const id = c.req.param("id")

  const empRows = await db
    .select({ id: schema.employees.id })
    .from(schema.employees)
    .where(
      and(eq(schema.employees.id, id), eq(schema.employees.orgId, tenantId)),
    )
  if (empRows.length === 0) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Employee not found" } },
      404,
    )
  }

  const rows = await db
    .select({
      project: schema.projects,
      role: schema.projectMembers.role,
      joinedAt: schema.projectMembers.joinedAt,
    })
    .from(schema.projectMembers)
    .innerJoin(
      schema.projects,
      eq(schema.projects.id, schema.projectMembers.projectId),
    )
    .where(
      and(
        eq(schema.projectMembers.employeeId, id),
        eq(schema.projects.orgId, tenantId),
      ),
    )

  return c.json({ data: rows })
})
