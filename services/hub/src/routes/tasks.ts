import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { and, asc, desc, eq, or } from "drizzle-orm"
import { nanoid } from "nanoid"
import { z } from "zod"
import * as schema from "../db/schema.ts"
import { drizzleD1 } from "../db/connect.ts"
import type { Bindings } from "../auth.ts"
import {
  type AuthVariables,
  requireSession,
} from "../middleware/auth.ts"
import { createAuth } from "../auth.ts"
import {
  orgGuard,
  requireRole,
  type OrgGuardVariables,
} from "../middleware/orgGuard.ts"
import {
  assertValidTransition,
  InvalidTaskTransitionError,
  SelfReviewError,
  resolveAgentOwnerEmployee,
  type TaskStatus,
} from "../lib/tasks.ts"
import { writeAudit, auditValues } from "../lib/audit.ts"
import { verifyAgentJwt } from "../lib/jwt.ts"

type Vars = AuthVariables & OrgGuardVariables

export const tasksRouter = new Hono<{ Bindings: Bindings; Variables: Vars }>()

const statusEnum = z.enum([
  "pending_dispatch_approval",
  "assigned",
  "in_progress",
  "pending_review",
  "rejected",
  "approved",
  "cancelled",
])

// ---------------------------------------------------------------------------
// POST /api/tasks — create a task (owner/admin/manager session)
// ---------------------------------------------------------------------------
tasksRouter.post(
  "/",
  requireSession,
  orgGuard,
  requireRole(["owner", "admin", "manager"]),
  zValidator(
    "json",
    z.object({
      title: z.string().min(1).max(200),
      description: z.string().max(5000).optional(),
      assigneeEmployeeId: z.string(),
      reviewerEmployeeId: z.string(),
      deadline: z.string().optional(),
      parentId: z.string().optional(),
    }),
  ),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const requester = c.get("employee")!
    const body = c.req.valid("json")
    const now = new Date().toISOString()

    if (body.assigneeEmployeeId === body.reviewerEmployeeId) {
      return c.json(
        {
          error: {
            code: "SAME_ASSIGNEE_REVIEWER",
            message: "assignee and reviewer must be different employees",
          },
        },
        409,
      )
    }

    // Verify assignee + reviewer in same tenant.
    const empIds = [body.assigneeEmployeeId, body.reviewerEmployeeId]
    const found = await db
      .select({ id: schema.employees.id })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.orgId, tenantId),
          or(...empIds.map((id) => eq(schema.employees.id, id))),
        ),
      )
    const foundIds = new Set(found.map((r) => r.id))
    if (!foundIds.has(body.assigneeEmployeeId)) {
      return c.json(
        { error: { code: "EMPLOYEE_NOT_FOUND", message: "assignee not in tenant" } },
        404,
      )
    }
    if (!foundIds.has(body.reviewerEmployeeId)) {
      return c.json(
        { error: { code: "EMPLOYEE_NOT_FOUND", message: "reviewer not in tenant" } },
        404,
      )
    }

    const id = `task_${nanoid(16)}`
    await db.insert(schema.tasks).values({
      id,
      orgId: tenantId,
      parentId: body.parentId ?? null,
      rootId: id, // self at top-level; V1.1 sub-tasks override
      creatorEmployeeId: requester.id,
      assigneeEmployeeId: body.assigneeEmployeeId,
      reviewerEmployeeId: body.reviewerEmployeeId,
      title: body.title,
      description: body.description ?? null,
      deadline: body.deadline ?? null,
      status: "assigned",
      reviewRound: 0,
      createdAt: now,
      updatedAt: now,
    })

    await writeAudit(db, {
      tenantId,
      actor: { type: "human", id: requester.id },
      action: "task.created",
      resource: { type: "task", id },
      payload: {
        title: body.title,
        assigneeEmployeeId: body.assigneeEmployeeId,
        reviewerEmployeeId: body.reviewerEmployeeId,
        deadline: body.deadline ?? null,
      },
    })

    const rows = await db
      .select()
      .from(schema.tasks)
      .where(and(eq(schema.tasks.id, id), eq(schema.tasks.orgId, tenantId)))
    return c.json({ data: rows[0] }, 201)
  },
)

// ---------------------------------------------------------------------------
// GET /api/tasks — list; employee role auto-filters to own-related
// ---------------------------------------------------------------------------
tasksRouter.get(
  "/",
  requireSession,
  orgGuard,
  zValidator(
    "query",
    z.object({
      status: statusEnum.optional(),
      assignee: z.string().optional(),
      reviewer: z.string().optional(),
      creator: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      sort: z.enum(["desc", "asc"]).default("desc"),
      tenantId: z.string().optional(),
    }),
  ),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const requester = c.get("employee")
    const q = c.req.valid("query")

    const conditions = [eq(schema.tasks.orgId, tenantId)]
    if (q.status) conditions.push(eq(schema.tasks.status, q.status))
    if (q.assignee)
      conditions.push(eq(schema.tasks.assigneeEmployeeId, q.assignee))
    if (q.reviewer)
      conditions.push(eq(schema.tasks.reviewerEmployeeId, q.reviewer))
    if (q.creator)
      conditions.push(eq(schema.tasks.creatorEmployeeId, q.creator))

    // Employee role: restrict to own-related tasks (assignee | reviewer | creator).
    if (requester && requester.role === "employee") {
      const ownClause = or(
        eq(schema.tasks.assigneeEmployeeId, requester.id),
        eq(schema.tasks.reviewerEmployeeId, requester.id),
        eq(schema.tasks.creatorEmployeeId, requester.id),
      )
      if (ownClause) conditions.push(ownClause)
    }

    const rows = await db
      .select()
      .from(schema.tasks)
      .where(and(...conditions))
      .orderBy(
        q.sort === "desc"
          ? desc(schema.tasks.createdAt)
          : asc(schema.tasks.createdAt),
      )
      .limit(q.limit + 1)

    const hasMore = rows.length > q.limit
    const items = hasMore ? rows.slice(0, q.limit) : rows
    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1]!.createdAt : null

    return c.json({ data: items, nextCursor })
  },
)

// ---------------------------------------------------------------------------
// GET /api/tasks/:id
// ---------------------------------------------------------------------------
tasksRouter.get("/:id", requireSession, orgGuard, async (c) => {
  const db = drizzleD1(c.env)
  const tenantId = c.get("tenantId")
  const requester = c.get("employee")
  const id = c.req.param("id")

  const rows = await db
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, id), eq(schema.tasks.orgId, tenantId)))
  const task = rows[0]
  if (!task) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Task not found" } },
      404,
    )
  }

  // Employee role: restrict visibility to own-related tasks (matches GET list
  // filter in design.md §4). Higher roles see all tenant tasks.
  if (requester && requester.role === "employee") {
    const isMine =
      task.assigneeEmployeeId === requester.id ||
      task.reviewerEmployeeId === requester.id ||
      task.creatorEmployeeId === requester.id
    if (!isMine) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "Task not visible to you" } },
        403,
      )
    }
  }

  return c.json({ data: task })
})

// ---------------------------------------------------------------------------
// POST /api/tasks/:id/start — assignee marks 'in_progress'
// ---------------------------------------------------------------------------
tasksRouter.post("/:id/start", requireSession, orgGuard, async (c) => {
  const db = drizzleD1(c.env)
  const tenantId = c.get("tenantId")
  const requester = c.get("employee")
  const id = c.req.param("id")

  if (!requester) {
    return c.json(
      { error: { code: "NO_EMPLOYEE_PROFILE", message: "User has no employee profile" } },
      403,
    )
  }

  const rows = await db
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, id), eq(schema.tasks.orgId, tenantId)))
  const task = rows[0]
  if (!task) {
    return c.json({ error: { code: "NOT_FOUND", message: "Task not found" } }, 404)
  }

  const isAdmin = requester.role === "owner" || requester.role === "admin"
  if (!isAdmin && task.assigneeEmployeeId !== requester.id) {
    return c.json(
      { error: { code: "FORBIDDEN", message: "Only assignee or admin can start a task" } },
      403,
    )
  }

  try {
    assertValidTransition(task.status as TaskStatus, "in_progress")
  } catch (err) {
    if (err instanceof InvalidTaskTransitionError) {
      return c.json({ error: { code: err.code, message: err.message } }, 409)
    }
    throw err
  }

  // Round-35 H fix: UPDATE + audit must land together (batch) AND the
  // UPDATE must guard on current status to detect concurrent writers.
  // Without the batch, a crash between the UPDATE and writeAudit leaves
  // the new state with no audit trail. Without the status guard, two
  // concurrent /start calls would both pass the state-machine check
  // (idempotent in this case but duplicates the audit row); /review's
  // race could fire two contradictory audit rows.
  const now = new Date().toISOString()
  const result = await db.batch([
    db
      .update(schema.tasks)
      .set({ status: "in_progress", updatedAt: now })
      .where(
        and(
          eq(schema.tasks.id, id),
          eq(schema.tasks.orgId, tenantId),
          // Optimistic concurrency guard: only transition if status hasn't
          // changed since we read it.
          eq(schema.tasks.status, task.status),
        ),
      ),
    // §Q4 sanctioned exception (fourth site): batch with audit.
    db.insert(schema.auditLog).values(
      auditValues({
        tenantId,
        actor: { type: "human", id: requester.id },
        action: "task.started",
        resource: { type: "task", id },
        payload: { from: task.status, to: "in_progress" },
      }),
    ),
  ])
  // result[0] is the UPDATE result. If meta.changes === 0, another writer
  // beat us — return 409 so the caller can re-fetch and retry.
  const updateMeta = (result[0]?.meta as { changes?: number } | undefined)
  if ((updateMeta?.changes ?? 0) === 0) {
    return c.json(
      {
        error: {
          code: "INVALID_STATUS",
          message: "Task status changed concurrently; refetch and retry",
        },
      },
      409,
    )
  }

  return c.json({ data: { id, status: "in_progress", updatedAt: now } })
})

// ---------------------------------------------------------------------------
// POST /api/tasks/:id/submit — assignee OR assignee's agent submits work
// Supports BOTH session auth (assignee user) AND agent JWT (assignee's
// agent with submit_task scope).
// ---------------------------------------------------------------------------
tasksRouter.post(
  "/:id/submit",
  // Dual auth: try agent JWT first, else fall back to session.
  async (c, next) => {
    // Dual auth: Bearer agent JWT OR session cookie. Inlined (rather than
    // delegating to sessionMiddleware) so the wider Variables type of this
    // router (Vars = AuthVariables & OrgGuardVariables) is compatible.
    c.set("agentId", null)
    c.set("agentTenantId", null)
    c.set("agentScope", null)
    c.set("userId", null)
    c.set("userName", null)
    c.set("userEmail", null)

    const authHeader = c.req.header("Authorization")
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7)
      const payload = await verifyAgentJwt(token, c.env.JWT_SECRET)
      if (!payload) {
        return c.json(
          { error: { code: "UNAUTHORIZED", message: "Invalid agent token" } },
          401,
        )
      }
      c.set("agentId", payload.sub)
      c.set("agentTenantId", payload.tenantId)
      c.set("agentScope", payload.scope)
      c.set("userId", payload.userId)
      await next()
      return
    }

    // Session path — read Better Auth session directly.
    const auth = createAuth(c.env, new URL(c.req.url).origin)
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    c.set("userId", session?.user?.id ?? null)
    c.set("userName", session?.user?.name ?? null)
    c.set("userEmail", session?.user?.email ?? null)
    await next()
  },
  zValidator(
    "json",
    z.object({
      output: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
    }),
  ),
  async (c) => {
    const db = drizzleD1(c.env)
    const id = c.req.param("id")
    const body = c.req.valid("json")
    const now = new Date().toISOString()

    const agentId = c.get("agentId") as string | null
    const userId = c.get("userId") as string | null

    if (!userId) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        401,
      )
    }

    // Resolve tenant + acting employee.
    let tenantId: string
    let actingEmployeeId: string | null
    let actorType: "human" | "agent" = "human"
    let actorId: string
    // Captured from the same orgId-scoped lookup that resolves the actor's
    // employee. Reused for RBAC instead of issuing a second query — avoids
    // a defense-in-depth gap where the second lookup might miss the orgId
    // filter.
    let actingRole: string | null = null

    if (agentId) {
      // Agent JWT path. Tenant from JWT; verify scope; resolve owner employee.
      tenantId = c.get("agentTenantId") as string
      actorType = "agent"
      actorId = agentId

      // Round-3 architecture H2 + security H3 fix: scope is now cached on
      // the context by the dual-auth middleware above (and by
      // requireAgentJwt for routes that use the canonical middleware), so
      // no second verifyAgentJwt call is needed. This also closes the
      // fragility window where two verifies could diverge under clock skew
      // / library upgrade.
      const scope = c.get("agentScope") ?? []
      if (!scope.includes("submit_task")) {
        return c.json(
          {
            error: {
              code: "BOUNDARY_VIOLATION",
              message: "Agent token lacks submit_task scope",
            },
          },
          403,
        )
      }

      const owner = await resolveAgentOwnerEmployee(db, agentId, tenantId)
      if (!owner.agentExists || !owner.employeeId) {
        return c.json(
          {
            error: {
              code: "NO_OWNER_EMPLOYEE",
              message: "Agent has no owner employee",
            },
          },
          422,
        )
      }
      actingEmployeeId = owner.employeeId
    } else {
      // Session path. Tenant must be supplied; lookup membership+employee.
      const tid =
        c.req.query("tenantId") ?? c.req.header("X-Tenant-Id") ?? null
      if (!tid) {
        return c.json(
          { error: { code: "TENANT_REQUIRED", message: "tenantId query/header required" } },
          400,
        )
      }
      tenantId = tid
      // Check membership
      const mem = await db
        .select({ role: schema.memberships.role })
        .from(schema.memberships)
        .where(
          and(
            eq(schema.memberships.tenantId, tenantId),
            eq(schema.memberships.userId, userId),
          ),
        )
      if (mem.length === 0) {
        return c.json(
          { error: { code: "TENANT_NOT_FOUND", message: "Tenant not found" } },
          404,
        )
      }
      const emp = await db
        .select()
        .from(schema.employees)
        .where(
          and(
            eq(schema.employees.orgId, tenantId),
            eq(schema.employees.userId, userId),
          ),
        )
      if (emp.length === 0 || !emp[0]) {
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
      actingEmployeeId = emp[0].id
      actorId = actingEmployeeId
      actingRole = emp[0].role
    }

    // Load task
    const rows = await db
      .select()
      .from(schema.tasks)
      .where(and(eq(schema.tasks.id, id), eq(schema.tasks.orgId, tenantId)))
    const task = rows[0]
    if (!task) {
      return c.json({ error: { code: "NOT_FOUND", message: "Task not found" } }, 404)
    }

    // RBAC: admin/owner can submit on anyone's behalf only via session.
    // Agents never get the admin bypass — even an owner's agent must be
    // the task's assignee agent to submit (else use the human session).
    const isAdmin =
      actorType === "human" && (actingRole === "owner" || actingRole === "admin")
    if (!isAdmin && task.assigneeEmployeeId !== actingEmployeeId) {
      return c.json(
        {
          error: {
            code: "NOT_ASSIGNEE",
            message: "Only the assignee (or assignee's agent / admin) can submit",
          },
        },
        403,
      )
    }

    // State machine
    try {
      assertValidTransition(task.status as TaskStatus, "pending_review")
    } catch (err) {
      if (err instanceof InvalidTaskTransitionError) {
        return c.json({ error: { code: err.code, message: err.message } }, 409)
      }
      throw err
    }

    // Round-35 H fix: batch UPDATE + audit with status-WHERE concurrency guard.
    const submitResult = await db.batch([
      db
        .update(schema.tasks)
        .set({
          status: "pending_review",
          output:
            body.output !== undefined
              ? typeof body.output === "string"
                ? body.output
                : JSON.stringify(body.output)
              : null,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.tasks.id, id),
            eq(schema.tasks.orgId, tenantId),
            eq(schema.tasks.status, task.status),
          ),
        ),
      // §Q4 sanctioned batch+audit pattern.
      db.insert(schema.auditLog).values(
        auditValues({
          tenantId,
          actor: { type: actorType, id: actorId },
          action: "task.submitted",
          resource: { type: "task", id },
          payload: { from: task.status, to: "pending_review" },
        }),
      ),
    ])
    const submitMeta = (submitResult[0]?.meta as { changes?: number } | undefined)
    if ((submitMeta?.changes ?? 0) === 0) {
      return c.json(
        {
          error: {
            code: "INVALID_STATUS",
            message: "Task status changed concurrently; refetch and retry",
          },
        },
        409,
      )
    }

    return c.json({ data: { id, status: "pending_review", updatedAt: now } })
  },
)

// ---------------------------------------------------------------------------
// POST /api/tasks/:id/review — reviewer (or admin) approves / rejects
// ---------------------------------------------------------------------------
tasksRouter.post(
  "/:id/review",
  requireSession,
  orgGuard,
  zValidator(
    "json",
    z.object({
      decision: z.enum(["approved", "rejected"]),
      comment: z.string().max(2000).optional(),
    }),
  ),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const requester = c.get("employee")
    const id = c.req.param("id")
    const { decision, comment } = c.req.valid("json")
    const now = new Date().toISOString()

    if (!requester) {
      return c.json(
        { error: { code: "NO_EMPLOYEE_PROFILE", message: "User has no employee profile" } },
        403,
      )
    }

    const rows = await db
      .select()
      .from(schema.tasks)
      .where(and(eq(schema.tasks.id, id), eq(schema.tasks.orgId, tenantId)))
    const task = rows[0]
    if (!task) {
      return c.json({ error: { code: "NOT_FOUND", message: "Task not found" } }, 404)
    }

    const isAdmin = requester.role === "owner" || requester.role === "admin"
    const isReviewer = task.reviewerEmployeeId === requester.id

    if (!isAdmin && !isReviewer) {
      return c.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Only the assigned reviewer (or admin) can review",
          },
        },
        403,
      )
    }

    // Self-review forbidden, even for admin: assignee cannot review own work.
    if (task.assigneeEmployeeId === requester.id) {
      const err = new SelfReviewError()
      return c.json({ error: { code: err.code, message: err.message } }, 403)
    }

    try {
      assertValidTransition(task.status as TaskStatus, decision)
    } catch (err) {
      if (err instanceof InvalidTaskTransitionError) {
        return c.json({ error: { code: err.code, message: err.message } }, 409)
      }
      throw err
    }

    const newRound = decision === "rejected" ? task.reviewRound + 1 : task.reviewRound

    // Round-35 H fix: batch UPDATE + audit with status-WHERE concurrency
    // guard. Without the guard, two concurrent reviewers (e.g. two admins)
    // both reading 'pending_review' would both write the decision and
    // both emit audit rows — the result is idempotent for the same
    // decision but produces duplicate audit entries and is worse for
    // approved-then-rejected race (last writer wins on row, both audit
    // entries persist).
    const reviewResult = await db.batch([
      db
        .update(schema.tasks)
        .set({
          status: decision,
          reviewRound: newRound,
          reviewComment: comment ?? null,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.tasks.id, id),
            eq(schema.tasks.orgId, tenantId),
            eq(schema.tasks.status, task.status),
          ),
        ),
      // §Q4 sanctioned batch+audit pattern.
      db.insert(schema.auditLog).values(
        auditValues({
          tenantId,
          actor: { type: "human", id: requester.id },
          action: decision === "approved" ? "task.approved" : "task.rejected",
          resource: { type: "task", id },
          payload: {
            from: task.status,
            to: decision,
            round: newRound,
            comment: comment ?? null,
          },
        }),
      ),
    ])
    const reviewMeta = (reviewResult[0]?.meta as { changes?: number } | undefined)
    if ((reviewMeta?.changes ?? 0) === 0) {
      return c.json(
        {
          error: {
            code: "INVALID_STATUS",
            message: "Task status changed concurrently; refetch and retry",
          },
        },
        409,
      )
    }

    return c.json({
      data: {
        id,
        status: decision,
        reviewRound: newRound,
        reviewComment: comment ?? null,
        updatedAt: now,
      },
    })
  },
)
