import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { and, asc, eq, inArray, lt, or, sql, type SQL } from "drizzle-orm"
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

export const skillsRouter = new Hono<{ Bindings: Bindings; Variables: Vars }>()

skillsRouter.use("*", requireSession)

const scopeEnum = z.enum(["company", "department", "personal"])
const scopeFilterEnum = z.enum(["company", "department", "personal", "all"])
const statusEnum = z.enum(["active", "deprecated", "archived"])

const semverRegex = /^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$/

const ManifestSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000),
  version: z.string().regex(semverRegex),
  tools: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        description: z.string().max(500),
        inputSchema: z.unknown(),
      }),
    )
    .optional(),
  files: z.array(z.string().max(200)).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
})

function safeParseManifest(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// GET /api/skills — list
// ---------------------------------------------------------------------------
skillsRouter.get(
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
      return c.json({ data: { skills: [], nextCursor: null } })
    }

    const myDepts = await getMyDepartmentIds(db, employee.id)
    const privileged = isPrivilegedReader(employee.role)

    const conditions: SQL[] = [eq(schema.skills.orgId, tenantId)]
    if (q.cursor) conditions.push(lt(schema.skills.createdAt, q.cursor))

    const filter = buildSkillsScopeFilter(q, employee.id, myDepts, privileged)
    if (filter === "EMPTY")
      return c.json({ data: { skills: [], nextCursor: null } })
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
      .from(schema.skills)
      .where(and(...conditions))
      .orderBy(asc(schema.skills.manifestId))
      .limit(q.limit + 1)

    const hasMore = rows.length > q.limit
    const items = hasMore ? rows.slice(0, q.limit) : rows
    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1]!.createdAt : null

    return c.json({
      data: {
        skills: items.map((r) => ({
          ...r,
          manifest: safeParseManifest(r.manifest),
        })),
        nextCursor,
      },
    })
  },
)

function buildSkillsScopeFilter(
  q: { scope: ScopeFilter; deptId?: string },
  myEmpId: string,
  myDepts: string[],
  privileged: boolean,
): SQL | "EMPTY" | "DEPT_NOT_MEMBER" | undefined {
  const tbl = schema.skills
  if (q.scope === "company") return eq(tbl.scope, "company")
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
// POST /api/skills — register a new skill manifest version
// ---------------------------------------------------------------------------
skillsRouter.post(
  "/",
  orgGuard,
  zValidator(
    "json",
    z.object({
      manifestId: z.string().min(1).max(120),
      version: z.string().regex(semverRegex),
      scope: scopeEnum,
      departmentId: z.string().optional(),
      manifest: ManifestSchema,
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
        { error: { code: "NO_EMPLOYEE_PROFILE", message: "x" } },
        403,
      )
    }

    const auth = await authorizeScopeWrite(db, {
      employee,
      scope: body.scope,
      departmentId: body.departmentId ?? null,
    })
    if (auth) {
      return c.json(
        { error: { code: auth.code, message: auth.message } },
        auth.status as 400 | 403,
      )
    }

    // Cross-tenant guard for departmentId
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

    // Dup check: (org, manifest_id, version, scope, dept|owner) must not exist.
    const dupConditions: SQL[] = [
      eq(schema.skills.orgId, tenantId),
      eq(schema.skills.manifestId, body.manifestId),
      eq(schema.skills.version, body.version),
      eq(schema.skills.scope, body.scope),
    ]
    if (body.scope === "department" && body.departmentId) {
      dupConditions.push(eq(schema.skills.departmentId, body.departmentId))
    } else if (body.scope === "personal") {
      dupConditions.push(eq(schema.skills.ownerEmployeeId, employee.id))
    }
    const dup = await db
      .select({ id: schema.skills.id })
      .from(schema.skills)
      .where(and(...dupConditions))
    if (dup.length > 0) {
      return c.json(
        {
          error: {
            code: "CONFLICT",
            message: `Skill ${body.manifestId}@${body.version} already exists in ${body.scope} scope`,
          },
        },
        409,
      )
    }

    const id = `sk_${nanoid(16)}`
    await db.insert(schema.skills).values({
      id,
      orgId: tenantId,
      manifestId: body.manifestId,
      version: body.version,
      manifest: JSON.stringify(body.manifest),
      scope: body.scope,
      departmentId:
        body.scope === "department" ? body.departmentId ?? null : null,
      ownerEmployeeId: body.scope === "personal" ? employee.id : null,
      status: "active",
      createdBy: employee.id,
      createdAt: now,
      updatedAt: now,
    })

    await writeAudit(db, {
      tenantId,
      actor: { type: "human", id: employee.id },
      action: "skill.created",
      resource: { type: "skill", id },
      payload: {
        manifestId: body.manifestId,
        version: body.version,
        scope: body.scope,
      },
    })

    const rows = await db
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.id, id))
    const row = rows[0]!
    return c.json(
      { data: { ...row, manifest: safeParseManifest(row.manifest) } },
      201,
    )
  },
)

// ---------------------------------------------------------------------------
// GET /api/skills/:id — detail
// ---------------------------------------------------------------------------
skillsRouter.get("/:id", orgGuard, async (c) => {
  const db = drizzleD1(c.env)
  const tenantId = c.get("tenantId")
  const employee = c.get("employee")
  const id = c.req.param("id")

  if (!employee) {
    return c.json({ error: { code: "NO_EMPLOYEE_PROFILE", message: "x" } }, 403)
  }

  const rows = await db
    .select()
    .from(schema.skills)
    .where(and(eq(schema.skills.id, id), eq(schema.skills.orgId, tenantId)))
  const skill = rows[0]
  if (!skill)
    return c.json({ error: { code: "NOT_FOUND", message: "x" } }, 404)

  const myDepts = await getMyDepartmentIds(db, employee.id)
  if (
    !canRead(
      {
        scope: skill.scope as ThreeTierScope,
        departmentId: skill.departmentId,
        ownerEmployeeId: skill.ownerEmployeeId,
      },
      { employeeId: employee.id, role: employee.role, myDeptIds: myDepts },
    )
  ) {
    return c.json({ error: { code: "FORBIDDEN", message: "x" } }, 403)
  }

  return c.json({
    data: { ...skill, manifest: safeParseManifest(skill.manifest) },
  })
})

// ---------------------------------------------------------------------------
// PATCH /api/skills/:id — update manifest / status
// ---------------------------------------------------------------------------
skillsRouter.patch(
  "/:id",
  orgGuard,
  zValidator(
    "json",
    z.object({
      manifest: ManifestSchema.optional(),
      status: statusEnum.optional(),
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
      .from(schema.skills)
      .where(and(eq(schema.skills.id, id), eq(schema.skills.orgId, tenantId)))
    const skill = rows[0]
    if (!skill)
      return c.json({ error: { code: "NOT_FOUND", message: "x" } }, 404)

    const isCreator = skill.createdBy === employee.id
    if (!isCreator && !isPrivilegedWriter(employee.role)) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "Only creator or admin may edit" } },
        403,
      )
    }

    const patch: Partial<typeof schema.skills.$inferInsert> = {}
    if (body.manifest !== undefined)
      patch.manifest = JSON.stringify(body.manifest)
    if (body.status !== undefined) patch.status = body.status
    patch.updatedAt = new Date().toISOString()

    await db
      .update(schema.skills)
      .set(patch)
      .where(eq(schema.skills.id, id))

    await writeAudit(db, {
      tenantId,
      actor: { type: "human", id: employee.id },
      action: "skill.updated",
      resource: { type: "skill", id },
      payload: { fields: Object.keys(patch) },
    })

    const next = await db
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.id, id))
    const r = next[0]!
    return c.json({ data: { ...r, manifest: safeParseManifest(r.manifest) } })
  },
)

// ---------------------------------------------------------------------------
// DELETE /api/skills/:id
// ---------------------------------------------------------------------------
skillsRouter.delete("/:id", orgGuard, async (c) => {
  const db = drizzleD1(c.env)
  const tenantId = c.get("tenantId")
  const employee = c.get("employee")
  const id = c.req.param("id")

  if (!employee) {
    return c.json({ error: { code: "NO_EMPLOYEE_PROFILE", message: "x" } }, 403)
  }

  const rows = await db
    .select()
    .from(schema.skills)
    .where(and(eq(schema.skills.id, id), eq(schema.skills.orgId, tenantId)))
  const skill = rows[0]
  if (!skill) return c.json({ error: { code: "NOT_FOUND", message: "x" } }, 404)

  const isCreator = skill.createdBy === employee.id
  if (!isCreator && !isPrivilegedWriter(employee.role)) {
    return c.json(
      { error: { code: "FORBIDDEN", message: "x" } },
      403,
    )
  }

  await db.delete(schema.skills).where(eq(schema.skills.id, id))

  await writeAudit(db, {
    tenantId,
    actor: { type: "human", id: employee.id },
    action: "skill.deleted",
    resource: { type: "skill", id },
    payload: { manifestId: skill.manifestId, version: skill.version },
  })

  return c.json({ data: { id, deleted: true } })
})

// ---------------------------------------------------------------------------
// POST /api/skills/:id/assign — link skill to an agent (creates agent_skills)
// ---------------------------------------------------------------------------
skillsRouter.post(
  "/:id/assign",
  orgGuard,
  zValidator("json", z.object({ agentId: z.string() })),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const employee = c.get("employee")
    const skillId = c.req.param("id")
    const { agentId } = c.req.valid("json")
    const now = new Date().toISOString()

    if (!employee) {
      return c.json({ error: { code: "NO_EMPLOYEE_PROFILE", message: "x" } }, 403)
    }

    // Double cross-tenant guard (rules.md §X1)
    const skillRows = await db
      .select()
      .from(schema.skills)
      .where(
        and(eq(schema.skills.id, skillId), eq(schema.skills.orgId, tenantId)),
      )
    const skill = skillRows[0]
    if (!skill)
      return c.json(
        { error: { code: "NOT_FOUND", message: "Skill not found" } },
        404,
      )

    const agentRows = await db
      .select()
      .from(schema.agents)
      .where(
        and(eq(schema.agents.id, agentId), eq(schema.agents.tenantId, tenantId)),
      )
    const agent = agentRows[0]
    if (!agent)
      return c.json(
        { error: { code: "NOT_FOUND", message: "Agent not found" } },
        404,
      )

    // RBAC: agent owner OR privileged writer
    const isAgentOwner = agent.ownerEmployeeId === employee.id
    if (!isAgentOwner && !isPrivilegedWriter(employee.role)) {
      return c.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Only the agent's owner or admin may assign skills",
          },
        },
        403,
      )
    }

    // Scope match: skill must be visible to the agent's owner employee.
    if (skill.scope !== "company") {
      if (skill.scope === "personal") {
        if (agent.ownerEmployeeId !== skill.ownerEmployeeId) {
          return c.json(
            {
              error: {
                code: "SCOPE_MISMATCH",
                message:
                  "Personal skill can only be assigned to its owner's agent",
              },
            },
            403,
          )
        }
      } else {
        // department: agent's owner must be member of that department.
        if (!agent.ownerEmployeeId) {
          return c.json(
            {
              error: {
                code: "SCOPE_MISMATCH",
                message:
                  "Agent has no owner_employee_id; cannot resolve department scope",
              },
            },
            403,
          )
        }
        const ownerDepts = await getMyDepartmentIds(db, agent.ownerEmployeeId)
        if (!skill.departmentId || !ownerDepts.includes(skill.departmentId)) {
          return c.json(
            {
              error: {
                code: "SCOPE_MISMATCH",
                message:
                  "Department skill can only be assigned to agents whose owner is in that department",
              },
            },
            403,
          )
        }
      }
    }

    // INSERT (idempotent — if (agent_id, skill_id) row exists, treat as 200)
    const existing = await db
      .select()
      .from(schema.agentSkills)
      .where(
        and(
          eq(schema.agentSkills.agentId, agentId),
          eq(schema.agentSkills.skillId, skillId),
        ),
      )
    if (existing.length > 0) {
      return c.json({ data: existing[0] })
    }

    await db.insert(schema.agentSkills).values({
      agentId,
      skillId,
      enabled: 1,
      assignedAt: now,
    })

    await writeAudit(db, {
      tenantId,
      actor: { type: "human", id: employee.id },
      action: "skill.assigned",
      resource: { type: "skill", id: skillId },
      payload: { agentId },
    })

    return c.json(
      { data: { agentId, skillId, enabled: 1, assignedAt: now } },
      201,
    )
  },
)

// ---------------------------------------------------------------------------
// DELETE /api/skills/:id/agents/:agentId — unlink
// ---------------------------------------------------------------------------
skillsRouter.delete("/:id/agents/:agentId", orgGuard, async (c) => {
  const db = drizzleD1(c.env)
  const tenantId = c.get("tenantId")
  const employee = c.get("employee")
  const skillId = c.req.param("id")
  const agentId = c.req.param("agentId")

  if (!employee) {
    return c.json({ error: { code: "NO_EMPLOYEE_PROFILE", message: "x" } }, 403)
  }

  // Double cross-tenant guard
  const agentRows = await db
    .select()
    .from(schema.agents)
    .where(
      and(eq(schema.agents.id, agentId), eq(schema.agents.tenantId, tenantId)),
    )
  const agent = agentRows[0]
  if (!agent)
    return c.json(
      { error: { code: "NOT_FOUND", message: "Agent not found" } },
      404,
    )

  const skillRows = await db
    .select({ id: schema.skills.id })
    .from(schema.skills)
    .where(
      and(eq(schema.skills.id, skillId), eq(schema.skills.orgId, tenantId)),
    )
  if (skillRows.length === 0)
    return c.json(
      { error: { code: "NOT_FOUND", message: "Skill not found" } },
      404,
    )

  const isAgentOwner = agent.ownerEmployeeId === employee.id
  if (!isAgentOwner && !isPrivilegedWriter(employee.role)) {
    return c.json({ error: { code: "FORBIDDEN", message: "x" } }, 403)
  }

  await db
    .delete(schema.agentSkills)
    .where(
      and(
        eq(schema.agentSkills.agentId, agentId),
        eq(schema.agentSkills.skillId, skillId),
      ),
    )

  await writeAudit(db, {
    tenantId,
    actor: { type: "human", id: employee.id },
    action: "skill.unassigned",
    resource: { type: "skill", id: skillId },
    payload: { agentId },
  })

  return c.json({ data: { agentId, skillId, unassigned: true } })
})
