import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq } from "drizzle-orm"
import { z } from "zod"
import * as schema from "../db/schema.ts"
import { drizzleD1 } from "../db/connect.ts"
import type { Bindings } from "../auth.ts"
import { type AuthVariables, requireSession } from "../middleware/auth.ts"
import { orgGuard, requireRole, type OrgGuardVariables } from "../middleware/orgGuard.ts"

type Vars = AuthVariables & OrgGuardVariables

export const organizationsRouter = new Hono<{ Bindings: Bindings; Variables: Vars }>()

organizationsRouter.use("*", requireSession)

// GET /api/organizations/me — current tenant view + viewer's role + employee profile
organizationsRouter.get("/me", orgGuard, async (c) => {
  const db = drizzleD1(c.env)
  const tenantId = c.get("tenantId")

  const rows = await db
    .select({
      id: schema.tenants.id,
      slug: schema.tenants.slug,
      displayName: schema.tenants.displayName,
      plan: schema.tenants.plan,
      createdAt: schema.tenants.createdAt,
    })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))

  const tenant = rows[0]
  if (!tenant) {
    return c.json(
      { error: { code: "TENANT_NOT_FOUND", message: "Tenant not found" } },
      404,
    )
  }

  return c.json({
    data: {
      organization: tenant,
      membershipRole: c.get("membershipRole"),
      employee: c.get("employee"),
    },
  })
})

// PATCH /api/organizations/me — update display name (owner/admin only)
organizationsRouter.patch(
  "/me",
  orgGuard,
  requireRole(["owner", "admin"]),
  zValidator(
    "json",
    z.object({
      displayName: z.string().min(1).max(50),
    }),
  ),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const { displayName } = c.req.valid("json")

    await db
      .update(schema.tenants)
      .set({ displayName })
      .where(eq(schema.tenants.id, tenantId))

    const rows = await db
      .select({
        id: schema.tenants.id,
        slug: schema.tenants.slug,
        displayName: schema.tenants.displayName,
        plan: schema.tenants.plan,
        createdAt: schema.tenants.createdAt,
      })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))

    return c.json({ data: rows[0] })
  },
)

// GET /api/organizations/me/stats — counts of employees, departments, projects
organizationsRouter.get("/me/stats", orgGuard, async (c) => {
  const db = drizzleD1(c.env)
  const tenantId = c.get("tenantId")

  const [employeeRows, departmentRows, projectRows] = await Promise.all([
    db.select({ id: schema.employees.id })
      .from(schema.employees)
      .where(eq(schema.employees.orgId, tenantId)),
    db.select({ id: schema.departments.id })
      .from(schema.departments)
      .where(eq(schema.departments.orgId, tenantId)),
    db.select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.orgId, tenantId)),
  ])

  return c.json({
    data: {
      employeeCount: employeeRows.length,
      departmentCount: departmentRows.length,
      projectCount: projectRows.length,
    },
  })
})

// GET /api/organizations/by-slug/:slug — minimal public-ish tenant lookup
// (for invitation accept landing pages etc. — no orgGuard since the user may
//  not yet be a member). Returns only non-sensitive fields.
organizationsRouter.get("/by-slug/:slug", async (c) => {
  const db = drizzleD1(c.env)
  const slug = c.req.param("slug")

  const rows = await db
    .select({
      id: schema.tenants.id,
      slug: schema.tenants.slug,
      displayName: schema.tenants.displayName,
    })
    .from(schema.tenants)
    .where(eq(schema.tenants.slug, slug))

  const tenant = rows[0]
  if (!tenant) {
    return c.json(
      { error: { code: "TENANT_NOT_FOUND", message: "Tenant not found" } },
      404,
    )
  }

  return c.json({ data: tenant })
})
