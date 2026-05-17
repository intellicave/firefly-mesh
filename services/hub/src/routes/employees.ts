import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { and, desc, eq, inArray, like, or } from "drizzle-orm"
import { nanoid } from "nanoid"
import { z } from "zod"
import * as schema from "../db/schema.ts"
import { drizzleD1 } from "../db/connect.ts"
import type { Bindings } from "../auth.ts"
import { type AuthVariables, requireSession } from "../middleware/auth.ts"
import {
  orgGuard,
  requireRole,
  type OrgGuardVariables,
} from "../middleware/orgGuard.ts"
import {
  assertNotLastOwner,
  LastOwnerError,
  mapEmployeeRoleToMembership,
  syncEmployeeRole,
} from "../lib/employees.ts"

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
    const { role, status, dept, search, limit } = c.req.valid("query")

    // Build conditions
    const conditions = [eq(schema.employees.orgId, tenantId)]
    if (role) conditions.push(eq(schema.employees.role, role))
    if (status) conditions.push(eq(schema.employees.status, status))
    if (search) {
      const term = `%${search.toLowerCase()}%`
      const orClause = or(
        like(schema.employees.name, term),
        like(schema.employees.email, term),
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
    const nextCursor = hasMore ? data[data.length - 1]?.id ?? null : null

    return c.json({ data, nextCursor })
  },
)

// GET /api/employees/me — current user's employee record in this tenant
employeesRouter.get("/me", orgGuard, async (c) => {
  const employee = c.get("employee")
  return c.json({ data: employee })
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
  return c.json({ data: employee })
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

    return c.json({ data: rows[0] }, 201)
  },
)

// PATCH /api/employees/:id — update profile fields
employeesRouter.patch(
  "/:id",
  orgGuard,
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
      return c.json({ data: target })
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
    return c.json({ data: rows[0] })
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
    return c.json({ data: rows[0] })
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
    return c.json({ data: rows[0] })
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
