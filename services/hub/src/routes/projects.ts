import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { and, eq, inArray } from "drizzle-orm"
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
  assertValidProjectTransition,
  InvalidProjectTransitionError,
  isProjectLead,
  type ProjectStatus,
} from "../lib/projects.ts"

type Vars = AuthVariables & OrgGuardVariables

export const projectsRouter = new Hono<{ Bindings: Bindings; Variables: Vars }>()

projectsRouter.use("*", requireSession)

const projectStatusEnum = z.enum(["planning", "active", "done", "archived"])

// GET /api/projects — list. employee role sees only joined projects;
// auditor/manager/admin/owner see all.
projectsRouter.get(
  "/",
  orgGuard,
  zValidator(
    "query",
    z.object({
      status: projectStatusEnum.optional(),
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      tenantId: z.string().optional(),
    }),
  ),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const requester = c.get("employee")
    const { status } = c.req.valid("query")

    const conditions = [eq(schema.projects.orgId, tenantId)]
    if (status) conditions.push(eq(schema.projects.status, status))

    // Employee role: limit to joined projects.
    if (requester && requester.role === "employee") {
      const memberRows = await db
        .select({ projectId: schema.projectMembers.projectId })
        .from(schema.projectMembers)
        .where(eq(schema.projectMembers.employeeId, requester.id))
      const joinedIds = memberRows.map((r) => r.projectId)
      if (joinedIds.length === 0) {
        return c.json({ data: [], nextCursor: null })
      }
      conditions.push(inArray(schema.projects.id, joinedIds))
    }

    const rows = await db
      .select()
      .from(schema.projects)
      .where(and(...conditions))

    return c.json({ data: rows, nextCursor: null })
  },
)

// GET /api/projects/:id
projectsRouter.get("/:id", orgGuard, async (c) => {
  const db = drizzleD1(c.env)
  const tenantId = c.get("tenantId")
  const id = c.req.param("id")
  const rows = await db
    .select()
    .from(schema.projects)
    .where(
      and(eq(schema.projects.id, id), eq(schema.projects.orgId, tenantId)),
    )
  const project = rows[0]
  if (!project) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Project not found" } },
      404,
    )
  }
  return c.json({ data: project })
})

// POST /api/projects
projectsRouter.post(
  "/",
  orgGuard,
  requireRole(["owner", "admin", "manager"]),
  zValidator(
    "json",
    z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(1000).optional(),
      startAt: z.string().optional(),
      endAt: z.string().optional(),
    }),
  ),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const body = c.req.valid("json")
    const id = `proj_${nanoid(16)}`
    const now = new Date().toISOString()

    await db.insert(schema.projects).values({
      id,
      orgId: tenantId,
      name: body.name,
      description: body.description ?? null,
      startAt: body.startAt ?? null,
      endAt: body.endAt ?? null,
      status: "planning",
      createdAt: now,
    })

    const rows = await db
      .select()
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, id),
          eq(schema.projects.orgId, tenantId),
        ),
      )
    return c.json({ data: rows[0] }, 201)
  },
)

// PATCH /api/projects/:id — basic fields (not status)
// Round-32 H2: requireEmployee prevents `c.get("employee")!` crash when
// the caller has a membership but no employee profile (e.g. just-accepted
// invitation pending profile completion).
projectsRouter.patch(
  "/:id",
  orgGuard,
  requireEmployee,
  zValidator(
    "json",
    z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(1000).nullable().optional(),
      startAt: z.string().nullable().optional(),
      endAt: z.string().nullable().optional(),
    }),
  ),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const requester = c.get("employee")!
    const id = c.req.param("id")
    const body = c.req.valid("json")

    const projRows = await db
      .select()
      .from(schema.projects)
      .where(
        and(eq(schema.projects.id, id), eq(schema.projects.orgId, tenantId)),
      )
    const project = projRows[0]
    if (!project) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Project not found" } },
        404,
      )
    }

    const isManagerial =
      requester.role === "owner" ||
      requester.role === "admin" ||
      requester.role === "manager"
    const isLead = await isProjectLead(db, id, requester.id)
    if (!isManagerial && !isLead) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "Insufficient permissions" } },
        403,
      )
    }

    const patch: Partial<typeof schema.projects.$inferInsert> = {}
    if (body.name !== undefined) patch.name = body.name
    if (body.description !== undefined) patch.description = body.description
    if (body.startAt !== undefined) patch.startAt = body.startAt
    if (body.endAt !== undefined) patch.endAt = body.endAt

    if (Object.keys(patch).length === 0) {
      return c.json({ data: project })
    }

    await db
      .update(schema.projects)
      .set(patch)
      .where(
        and(
          eq(schema.projects.id, id),
          eq(schema.projects.orgId, tenantId),
        ),
      )

    const rows = await db
      .select()
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, id),
          eq(schema.projects.orgId, tenantId),
        ),
      )
    return c.json({ data: rows[0] })
  },
)

// PATCH /api/projects/:id/status — state machine validated transition
projectsRouter.patch(
  "/:id/status",
  orgGuard,
  requireEmployee,
  zValidator("json", z.object({ status: projectStatusEnum })),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const requester = c.get("employee")!
    const id = c.req.param("id")
    const { status: newStatus } = c.req.valid("json")

    const projRows = await db
      .select()
      .from(schema.projects)
      .where(
        and(eq(schema.projects.id, id), eq(schema.projects.orgId, tenantId)),
      )
    const project = projRows[0]
    if (!project) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Project not found" } },
        404,
      )
    }

    const isManagerial =
      requester.role === "owner" ||
      requester.role === "admin" ||
      requester.role === "manager"
    const isLead = await isProjectLead(db, id, requester.id)
    if (!isManagerial && !isLead) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "Insufficient permissions" } },
        403,
      )
    }

    try {
      assertValidProjectTransition(
        project.status as ProjectStatus,
        newStatus,
      )
    } catch (err) {
      if (err instanceof InvalidProjectTransitionError) {
        return c.json(
          { error: { code: "INVALID_TRANSITION", message: err.message } },
          409,
        )
      }
      throw err
    }

    if (project.status !== newStatus) {
      await db
        .update(schema.projects)
        .set({ status: newStatus })
        .where(
        and(
          eq(schema.projects.id, id),
          eq(schema.projects.orgId, tenantId),
        ),
      )
    }

    const rows = await db
      .select()
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, id),
          eq(schema.projects.orgId, tenantId),
        ),
      )
    return c.json({ data: rows[0] })
  },
)

// DELETE /api/projects/:id — owner/admin only
projectsRouter.delete(
  "/:id",
  orgGuard,
  requireRole(["owner", "admin"]),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const id = c.req.param("id")

    const projRows = await db
      .select({ id: schema.projects.id, status: schema.projects.status })
      .from(schema.projects)
      .where(
        and(eq(schema.projects.id, id), eq(schema.projects.orgId, tenantId)),
      )
    const proj = projRows[0]
    if (!proj) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Project not found" } },
        404,
      )
    }

    // Round-30 Critical fix: per lib/projects.ts state machine docstring
    // ("Terminal — only DELETE can remove an archived project"), only
    // `archived` projects may be hard-deleted. Without this guard, an
    // admin could nuke an active project (and its members via cascade)
    // without going through the state machine, bypassing the
    // archive-before-delete safety convention and silently orphaning
    // any FK-referencing tasks.
    if (proj.status !== "archived") {
      return c.json(
        {
          error: {
            code: "INVALID_STATUS",
            message: `Only archived projects can be deleted (current: '${proj.status}'). Transition to 'archived' first via PATCH /:id/status.`,
          },
        },
        409,
      )
    }

    // project_members cascade automatically.
    await db
      .delete(schema.projects)
      .where(
        and(
          eq(schema.projects.id, id),
          eq(schema.projects.orgId, tenantId),
        ),
      )
    return c.json({ data: { id, deleted: true } })
  },
)

// GET /api/projects/:id/members
projectsRouter.get("/:id/members", orgGuard, async (c) => {
  const db = drizzleD1(c.env)
  const tenantId = c.get("tenantId")
  const id = c.req.param("id")

  const projRows = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      and(eq(schema.projects.id, id), eq(schema.projects.orgId, tenantId)),
    )
  if (projRows.length === 0) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Project not found" } },
      404,
    )
  }

  const rows = await db
    .select({
      employee: schema.employees,
      memberRole: schema.projectMembers.role,
      joinedAt: schema.projectMembers.joinedAt,
    })
    .from(schema.projectMembers)
    .innerJoin(
      schema.employees,
      eq(schema.employees.id, schema.projectMembers.employeeId),
    )
    .where(
      and(
        eq(schema.projectMembers.projectId, id),
        eq(schema.employees.orgId, tenantId),
      ),
    )

  return c.json({ data: rows })
})

// POST /api/projects/:id/members
projectsRouter.post(
  "/:id/members",
  orgGuard,
  zValidator(
    "json",
    z.object({
      employeeId: z.string(),
      role: z.string().max(50).optional(),
    }),
  ),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const requester = c.get("employee")!
    const id = c.req.param("id")
    const { employeeId, role } = c.req.valid("json")

    const projRows = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(
        and(eq(schema.projects.id, id), eq(schema.projects.orgId, tenantId)),
      )
    if (projRows.length === 0) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Project not found" } },
        404,
      )
    }

    const isManagerial =
      requester.role === "owner" ||
      requester.role === "admin" ||
      requester.role === "manager"
    const isLead = await isProjectLead(db, id, requester.id)
    if (!isManagerial && !isLead) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "Insufficient permissions" } },
        403,
      )
    }

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
      await db.insert(schema.projectMembers).values({
        projectId: id,
        employeeId,
        role: role ?? null,
        joinedAt: now,
      })
    } catch (err) {
      return c.json(
        {
          error: {
            code: "CONFLICT",
            message: "Employee is already a member of this project",
          },
        },
        409,
      )
    }

    return c.json(
      { data: { projectId: id, employeeId, role: role ?? null, joinedAt: now } },
      201,
    )
  },
)

// PATCH /api/projects/:id/members/:employeeId — change role
projectsRouter.patch(
  "/:id/members/:employeeId",
  orgGuard,
  requireEmployee,
  zValidator("json", z.object({ role: z.string().max(50).nullable() })),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const requester = c.get("employee")!
    const id = c.req.param("id")
    const employeeId = c.req.param("employeeId")
    const { role } = c.req.valid("json")

    const projRows = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(
        and(eq(schema.projects.id, id), eq(schema.projects.orgId, tenantId)),
      )
    if (projRows.length === 0) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Project not found" } },
        404,
      )
    }

    const isManagerial =
      requester.role === "owner" ||
      requester.role === "admin" ||
      requester.role === "manager"
    const isLead = await isProjectLead(db, id, requester.id)
    if (!isManagerial && !isLead) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "Insufficient permissions" } },
        403,
      )
    }

    await db
      .update(schema.projectMembers)
      .set({ role })
      .where(
        and(
          eq(schema.projectMembers.projectId, id),
          eq(schema.projectMembers.employeeId, employeeId),
        ),
      )

    return c.json({ data: { projectId: id, employeeId, role } })
  },
)

// DELETE /api/projects/:id/members/:employeeId
projectsRouter.delete(
  "/:id/members/:employeeId",
  orgGuard,
  requireEmployee,
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const requester = c.get("employee")!
    const id = c.req.param("id")
    const employeeId = c.req.param("employeeId")

    const projRows = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(
        and(eq(schema.projects.id, id), eq(schema.projects.orgId, tenantId)),
      )
    if (projRows.length === 0) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Project not found" } },
        404,
      )
    }

    const isManagerial =
      requester.role === "owner" ||
      requester.role === "admin" ||
      requester.role === "manager"
    const isLead = await isProjectLead(db, id, requester.id)
    if (!isManagerial && !isLead) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "Insufficient permissions" } },
        403,
      )
    }

    await db
      .delete(schema.projectMembers)
      .where(
        and(
          eq(schema.projectMembers.projectId, id),
          eq(schema.projectMembers.employeeId, employeeId),
        ),
      )
    return c.json({ data: { projectId: id, employeeId, removed: true } })
  },
)
