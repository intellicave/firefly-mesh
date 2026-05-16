import { createMiddleware } from "hono/factory"
import { and, eq } from "drizzle-orm"
import type { Bindings } from "../auth.ts"
import type { AuthVariables } from "./auth.ts"
import { drizzleD1 } from "../db/connect.ts"
import * as schema from "../db/schema.ts"

export type EmployeeRole = "owner" | "admin" | "manager" | "employee" | "auditor"

export type EmployeeRecord = {
  id: string
  orgId: string
  userId: string | null
  name: string
  email: string
  title: string | null
  avatarUrl: string | null
  status: "active" | "archived"
  role: EmployeeRole
  createdAt: string
}

export type MembershipRole = "owner" | "admin" | "member"

export type OrgGuardVariables = {
  tenantId: string
  membershipRole: MembershipRole
  /**
   * Employee record for the current user in the resolved tenant.
   * May be null if the user has a membership but no employee profile yet
   * (e.g. just-accepted invitation pending profile completion).
   * Routes that mutate must use `requireEmployee()` or `requireRole()`.
   */
  employee: EmployeeRecord | null
}

/**
 * Resolves the current tenant context for product-layer routes.
 *
 * Tenant source resolution order:
 *   1. URL path param `:tenantId` (when route is `/api/.../:tenantId/...`)
 *   2. Query string `?tenantId=<id>`
 *   3. Request header `X-Tenant-Id: <id>`
 *
 * Guarantees on success (next() called):
 *   - c.get('tenantId') is a string
 *   - c.get('membershipRole') is set (user is verified member)
 *   - c.get('employee') is set (may be null)
 *
 * Failures:
 *   - 400 TENANT_REQUIRED  — no tenant id in request
 *   - 401 UNAUTHORIZED     — no session (should be caught by requireSession upstream)
 *   - 404 TENANT_NOT_FOUND — user has no membership in that tenant
 *   - 403 ARCHIVED         — employee record exists but status is 'archived'
 */
export const orgGuard = createMiddleware<{
  Bindings: Bindings
  Variables: AuthVariables & OrgGuardVariables
}>(async (c, next) => {
  const userId = c.get("userId")
  if (!userId) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401)
  }

  // Resolve tenant id
  const pathTenantId = c.req.param("tenantId")
  const queryTenantId = c.req.query("tenantId")
  const headerTenantId = c.req.header("X-Tenant-Id")
  const tenantId = pathTenantId ?? queryTenantId ?? headerTenantId

  if (!tenantId) {
    return c.json(
      { error: { code: "TENANT_REQUIRED", message: "tenantId query/header required" } },
      400,
    )
  }

  const db = drizzleD1(c.env)

  // Verify membership in tenant
  const memberships = await db
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.tenantId, tenantId),
        eq(schema.memberships.userId, userId),
      ),
    )

  const membership = memberships[0]
  if (!membership) {
    return c.json({ error: { code: "TENANT_NOT_FOUND", message: "Tenant not found" } }, 404)
  }

  // Look up employee record (may be null)
  const employees = await db
    .select()
    .from(schema.employees)
    .where(
      and(
        eq(schema.employees.orgId, tenantId),
        eq(schema.employees.userId, userId),
      ),
    )

  const employee = (employees[0] as EmployeeRecord | undefined) ?? null

  if (employee?.status === "archived") {
    return c.json(
      { error: { code: "ARCHIVED", message: "Employee account is archived" } },
      403,
    )
  }

  c.set("tenantId", tenantId)
  c.set("membershipRole", membership.role as MembershipRole)
  c.set("employee", employee)

  await next()
})

/**
 * Factory: route guard requiring the current user has an employee record AND
 * its role is in the allowed list.
 *
 * Use after orgGuard. Returns:
 *   - 403 NO_EMPLOYEE_PROFILE — user has membership but no employee record
 *   - 403 FORBIDDEN           — role not in allowed list
 */
export const requireRole = (allowed: EmployeeRole[]) =>
  createMiddleware<{
    Bindings: Bindings
    Variables: AuthVariables & OrgGuardVariables
  }>(async (c, next) => {
    const employee = c.get("employee")
    if (!employee) {
      return c.json(
        {
          error: {
            code: "NO_EMPLOYEE_PROFILE",
            message: "User has no employee profile in this tenant",
          },
        },
        403,
      )
    }
    if (!allowed.includes(employee.role)) {
      return c.json(
        {
          error: {
            code: "FORBIDDEN",
            message: `Required role: ${allowed.join("/")}; have: ${employee.role}`,
          },
        },
        403,
      )
    }
    await next()
  })

/**
 * Helper: route guard requiring the current user has an employee record
 * (any role). Use when read access is open but mutation requires being
 * a real employee in the tenant (not just a system-level membership).
 */
export const requireEmployee = createMiddleware<{
  Bindings: Bindings
  Variables: AuthVariables & OrgGuardVariables
}>(async (c, next) => {
  if (!c.get("employee")) {
    return c.json(
      {
        error: {
          code: "NO_EMPLOYEE_PROFILE",
          message: "User has no employee profile in this tenant",
        },
      },
      403,
    )
  }
  await next()
})
