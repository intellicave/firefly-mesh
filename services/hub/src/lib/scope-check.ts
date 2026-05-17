import { and, eq } from "drizzle-orm"
import * as schema from "../db/schema.ts"
import type { DrizzleD1 } from "../db/connect.ts"
import type { EmployeeRecord } from "../middleware/orgGuard.ts"

/**
 * Three-tier scope helpers — sprint 2026-05-18 M8 + M9.
 *
 * Shared by routes/knowledge.ts and routes/skills.ts. Both tables use the
 * same (scope, department_id, owner_employee_id) tuple with the same
 * CHECK constraint and the same RBAC rules.
 */

export type ThreeTierScope = "company" | "department" | "personal"
export type ScopeFilter = ThreeTierScope | "all"

export function isPrivilegedReader(role: string): boolean {
  return role === "owner" || role === "admin" || role === "auditor"
}

export function isPrivilegedWriter(role: string): boolean {
  return role === "owner" || role === "admin"
}

/**
 * Return all department IDs the given employee belongs to (any role).
 */
export async function getMyDepartmentIds(
  db: DrizzleD1,
  employeeId: string,
): Promise<string[]> {
  const rows = await db
    .select({ d: schema.departmentMembers.departmentId })
    .from(schema.departmentMembers)
    .where(eq(schema.departmentMembers.employeeId, employeeId))
  return rows.map((r) => r.d)
}

/**
 * Return true if the employee is head of the given department.
 */
export async function isDepartmentHead(
  db: DrizzleD1,
  employeeId: string,
  departmentId: string,
): Promise<boolean> {
  const rows = await db
    .select({ role: schema.departmentMembers.role })
    .from(schema.departmentMembers)
    .where(
      and(
        eq(schema.departmentMembers.employeeId, employeeId),
        eq(schema.departmentMembers.departmentId, departmentId),
      ),
    )
  return rows.some((r) => r.role === "head")
}

export interface AuthorizeWriteOpts {
  employee: EmployeeRecord
  scope: ThreeTierScope
  departmentId: string | null
}

export interface AuthorizeFailure {
  code: string
  message: string
  status: number
}

/**
 * Validate a caller can write at the given scope.
 *
 *   company    — owner/admin only
 *   department — owner/admin, OR the department's head
 *   personal   — always allowed; caller must force ownerEmployeeId = self
 *
 * Returns null on success, or an error envelope ready for c.json().
 */
export async function authorizeScopeWrite(
  db: DrizzleD1,
  opts: AuthorizeWriteOpts,
): Promise<AuthorizeFailure | null> {
  const { employee, scope, departmentId } = opts

  if (scope === "company") {
    if (!isPrivilegedWriter(employee.role)) {
      return {
        code: "FORBIDDEN",
        message: "Only owner/admin may publish to company scope",
        status: 403,
      }
    }
    return null
  }

  if (scope === "department") {
    if (!departmentId) {
      return {
        code: "VALIDATION_ERROR",
        message: "departmentId required for department scope",
        status: 400,
      }
    }
    if (isPrivilegedWriter(employee.role)) return null
    const head = await isDepartmentHead(db, employee.id, departmentId)
    if (!head) {
      return {
        code: "FORBIDDEN",
        message: "Only department head / admin may publish to department",
        status: 403,
      }
    }
    return null
  }

  // personal — always allowed
  return null
}

export interface VisibilityContext {
  employeeId: string
  role: string
  myDeptIds: string[]
}

/**
 * Decide whether a given row (with its scope tuple) is visible to the caller.
 * Used in detail/search paths after a candidate row is loaded.
 */
export function canRead(
  row: {
    scope: ThreeTierScope
    departmentId: string | null
    ownerEmployeeId: string | null
  },
  ctx: VisibilityContext,
): boolean {
  if (row.scope === "company") return true
  if (isPrivilegedReader(ctx.role)) return true
  if (row.scope === "department") {
    return row.departmentId !== null && ctx.myDeptIds.includes(row.departmentId)
  }
  // personal
  return row.ownerEmployeeId === ctx.employeeId
}
