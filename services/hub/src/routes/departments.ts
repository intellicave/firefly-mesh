import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { and, eq } from "drizzle-orm"
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
  assertNoCycle,
  DepartmentCycleError,
  isDepartmentHead,
} from "../lib/departments.ts"

type Vars = AuthVariables & OrgGuardVariables

export const departmentsRouter = new Hono<{
  Bindings: Bindings
  Variables: Vars
}>()

departmentsRouter.use("*", requireSession)

// GET /api/departments — list (flat; client can rebuild tree via parent_id)
departmentsRouter.get("/", orgGuard, async (c) => {
  const db = drizzleD1(c.env)
  const tenantId = c.get("tenantId")
  const rows = await db
    .select()
    .from(schema.departments)
    .where(eq(schema.departments.orgId, tenantId))
  return c.json({ data: rows })
})

// GET /api/departments/:id
departmentsRouter.get("/:id", orgGuard, async (c) => {
  const db = drizzleD1(c.env)
  const tenantId = c.get("tenantId")
  const id = c.req.param("id")
  const rows = await db
    .select()
    .from(schema.departments)
    .where(
      and(
        eq(schema.departments.id, id),
        eq(schema.departments.orgId, tenantId),
      ),
    )
  const dept = rows[0]
  if (!dept) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Department not found" } },
      404,
    )
  }
  return c.json({ data: dept })
})

// POST /api/departments — create department
departmentsRouter.post(
  "/",
  orgGuard,
  requireRole(["owner", "admin", "manager"]),
  zValidator(
    "json",
    z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      parentId: z.string().optional(),
      headEmployeeId: z.string().optional(),
    }),
  ),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const body = c.req.valid("json")
    const now = new Date().toISOString()

    // Verify parent belongs to same tenant (if provided).
    if (body.parentId) {
      const parent = await db
        .select({ id: schema.departments.id })
        .from(schema.departments)
        .where(
          and(
            eq(schema.departments.id, body.parentId),
            eq(schema.departments.orgId, tenantId),
          ),
        )
      if (parent.length === 0) {
        return c.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "parentId does not belong to this tenant",
            },
          },
          400,
        )
      }
    }

    // Verify head belongs to same tenant (if provided).
    if (body.headEmployeeId) {
      const emp = await db
        .select({ id: schema.employees.id })
        .from(schema.employees)
        .where(
          and(
            eq(schema.employees.id, body.headEmployeeId),
            eq(schema.employees.orgId, tenantId),
          ),
        )
      if (emp.length === 0) {
        return c.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "headEmployeeId does not belong to this tenant",
            },
          },
          400,
        )
      }
    }

    const id = `dept_${nanoid(16)}`
    await db.insert(schema.departments).values({
      id,
      orgId: tenantId,
      parentId: body.parentId ?? null,
      name: body.name,
      description: body.description ?? null,
      createdAt: now,
    })

    if (body.headEmployeeId) {
      await db.insert(schema.departmentMembers).values({
        departmentId: id,
        employeeId: body.headEmployeeId,
        role: "head",
        joinedAt: now,
      })
    }

    const rows = await db
      .select()
      .from(schema.departments)
      .where(
        and(
          eq(schema.departments.id, id),
          eq(schema.departments.orgId, tenantId),
        ),
      )
    return c.json({ data: rows[0] }, 201)
  },
)

// PATCH /api/departments/:id
departmentsRouter.patch(
  "/:id",
  orgGuard,
  zValidator(
    "json",
    z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(500).nullable().optional(),
      parentId: z.string().nullable().optional(),
    }),
  ),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const requester = c.get("employee")!
    const id = c.req.param("id")
    const body = c.req.valid("json")

    // Verify dept belongs to tenant.
    const deptRows = await db
      .select()
      .from(schema.departments)
      .where(
        and(
          eq(schema.departments.id, id),
          eq(schema.departments.orgId, tenantId),
        ),
      )
    const dept = deptRows[0]
    if (!dept) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Department not found" } },
        404,
      )
    }

    // RBAC: owner/admin/manager or dept head.
    const isManagerial =
      requester.role === "owner" ||
      requester.role === "admin" ||
      requester.role === "manager"
    const isHead = await isDepartmentHead(db, id, requester.id)
    if (!isManagerial && !isHead) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "Insufficient permissions" } },
        403,
      )
    }

    // parent_id change: verify parent belongs to tenant + no cycle.
    if (body.parentId !== undefined && body.parentId !== null) {
      const parent = await db
        .select({ id: schema.departments.id })
        .from(schema.departments)
        .where(
          and(
            eq(schema.departments.id, body.parentId),
            eq(schema.departments.orgId, tenantId),
          ),
        )
      if (parent.length === 0) {
        return c.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "parentId does not belong to this tenant",
            },
          },
          400,
        )
      }
      try {
        await assertNoCycle(db, tenantId, id, body.parentId)
      } catch (err) {
        if (err instanceof DepartmentCycleError) {
          return c.json(
            { error: { code: "CYCLE_DETECTED", message: err.message } },
            409,
          )
        }
        throw err
      }
    }

    const patch: Partial<typeof schema.departments.$inferInsert> = {}
    if (body.name !== undefined) patch.name = body.name
    if (body.description !== undefined) patch.description = body.description
    if (body.parentId !== undefined) patch.parentId = body.parentId

    if (Object.keys(patch).length === 0) {
      return c.json({ data: dept })
    }

    await db
      .update(schema.departments)
      .set(patch)
      .where(
        and(
          eq(schema.departments.id, id),
          eq(schema.departments.orgId, tenantId),
        ),
      )

    const rows = await db
      .select()
      .from(schema.departments)
      .where(
        and(
          eq(schema.departments.id, id),
          eq(schema.departments.orgId, tenantId),
        ),
      )
    return c.json({ data: rows[0] })
  },
)

// DELETE /api/departments/:id — owner/admin only
//   Cascade order: department_members → child departments (recursive) → self.
//   ON DELETE CASCADE handles department_members automatically.
//   Children must be re-parented or deleted explicitly first (we re-parent
//   children to this department's parent for safety; if you really want to
//   nuke a subtree, delete children first).
departmentsRouter.delete(
  "/:id",
  orgGuard,
  requireRole(["owner", "admin"]),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const id = c.req.param("id")

    const deptRows = await db
      .select()
      .from(schema.departments)
      .where(
        and(
          eq(schema.departments.id, id),
          eq(schema.departments.orgId, tenantId),
        ),
      )
    const dept = deptRows[0]
    if (!dept) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Department not found" } },
        404,
      )
    }

    // Re-parent direct children to dept.parent_id (could be null = root).
    await db
      .update(schema.departments)
      .set({ parentId: dept.parentId })
      .where(
        and(
          eq(schema.departments.parentId, id),
          eq(schema.departments.orgId, tenantId),
        ),
      )

    // department_members rows cascade automatically.
    await db
      .delete(schema.departments)
      .where(
        and(
          eq(schema.departments.id, id),
          eq(schema.departments.orgId, tenantId),
        ),
      )

    return c.json({ data: { id, deleted: true } })
  },
)

// GET /api/departments/:id/members
departmentsRouter.get("/:id/members", orgGuard, async (c) => {
  const db = drizzleD1(c.env)
  const tenantId = c.get("tenantId")
  const id = c.req.param("id")

  // Verify dept belongs to tenant (cross-tenant guard).
  const deptRows = await db
    .select({ id: schema.departments.id })
    .from(schema.departments)
    .where(
      and(
        eq(schema.departments.id, id),
        eq(schema.departments.orgId, tenantId),
      ),
    )
  if (deptRows.length === 0) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Department not found" } },
      404,
    )
  }

  const rows = await db
    .select({
      employee: schema.employees,
      memberRole: schema.departmentMembers.role,
      joinedAt: schema.departmentMembers.joinedAt,
    })
    .from(schema.departmentMembers)
    .innerJoin(
      schema.employees,
      eq(schema.employees.id, schema.departmentMembers.employeeId),
    )
    .where(
      and(
        eq(schema.departmentMembers.departmentId, id),
        eq(schema.employees.orgId, tenantId),
      ),
    )

  return c.json({ data: rows })
})

// POST /api/departments/:id/members
departmentsRouter.post(
  "/:id/members",
  orgGuard,
  zValidator(
    "json",
    z.object({
      employeeId: z.string(),
      role: z.enum(["head", "member"]).default("member"),
    }),
  ),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const requester = c.get("employee")!
    const id = c.req.param("id")
    const { employeeId, role } = c.req.valid("json")

    // Dept cross-tenant guard.
    const deptRows = await db
      .select({ id: schema.departments.id })
      .from(schema.departments)
      .where(
        and(
          eq(schema.departments.id, id),
          eq(schema.departments.orgId, tenantId),
        ),
      )
    if (deptRows.length === 0) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Department not found" } },
        404,
      )
    }

    // RBAC: owner/admin/manager OR dept head.
    const isManagerial =
      requester.role === "owner" ||
      requester.role === "admin" ||
      requester.role === "manager"
    const isHead = await isDepartmentHead(db, id, requester.id)
    if (!isManagerial && !isHead) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "Insufficient permissions" } },
        403,
      )
    }

    // Employee cross-tenant guard.
    const empRows = await db
      .select({ id: schema.employees.id })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.id, employeeId),
          eq(schema.employees.orgId, tenantId),
        ),
      )
    if (empRows.length === 0) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "employeeId does not belong to this tenant",
          },
        },
        400,
      )
    }

    const now = new Date().toISOString()
    try {
      await db.insert(schema.departmentMembers).values({
        departmentId: id,
        employeeId,
        role,
        joinedAt: now,
      })
    } catch (err) {
      // Composite-PK duplicate
      return c.json(
        {
          error: {
            code: "CONFLICT",
            message: "Employee is already a member of this department",
          },
        },
        409,
      )
    }

    return c.json(
      { data: { departmentId: id, employeeId, role, joinedAt: now } },
      201,
    )
  },
)

// DELETE /api/departments/:id/members/:employeeId
departmentsRouter.delete(
  "/:id/members/:employeeId",
  orgGuard,
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const requester = c.get("employee")!
    const id = c.req.param("id")
    const employeeId = c.req.param("employeeId")

    // Dept cross-tenant guard.
    const deptRows = await db
      .select({ id: schema.departments.id })
      .from(schema.departments)
      .where(
        and(
          eq(schema.departments.id, id),
          eq(schema.departments.orgId, tenantId),
        ),
      )
    if (deptRows.length === 0) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Department not found" } },
        404,
      )
    }

    const isManagerial =
      requester.role === "owner" ||
      requester.role === "admin" ||
      requester.role === "manager"
    const isHead = await isDepartmentHead(db, id, requester.id)
    if (!isManagerial && !isHead) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "Insufficient permissions" } },
        403,
      )
    }

    await db
      .delete(schema.departmentMembers)
      .where(
        and(
          eq(schema.departmentMembers.departmentId, id),
          eq(schema.departmentMembers.employeeId, employeeId),
        ),
      )

    return c.json({ data: { departmentId: id, employeeId, removed: true } })
  },
)
