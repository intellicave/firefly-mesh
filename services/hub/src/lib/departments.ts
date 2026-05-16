import { and, eq } from "drizzle-orm"
import * as schema from "../db/schema.ts"
import type { DrizzleD1 } from "../db/connect.ts"

export class DepartmentCycleError extends Error {
  constructor() {
    super("Cannot make a department a descendant of itself")
  }
}

/**
 * Validates that setting `dept.parent_id = candidateParentId` does not
 * create a cycle. Returns true if safe, throws DepartmentCycleError otherwise.
 *
 * Walks up the parent chain from candidateParentId; if it ever hits
 * `selfDepartmentId`, that means selfDepartmentId is an ancestor of
 * candidateParentId, so making it the child would create a cycle.
 *
 * Assumes both departments belong to the same tenant (caller's responsibility).
 * Bounded walk: stops after 100 hops to avoid runaway on data corruption.
 */
export async function assertNoCycle(
  db: DrizzleD1,
  tenantId: string,
  selfDepartmentId: string,
  candidateParentId: string,
): Promise<void> {
  if (selfDepartmentId === candidateParentId) {
    throw new DepartmentCycleError()
  }
  let cursor: string | null = candidateParentId
  for (let i = 0; i < 100; i++) {
    if (cursor === null) return
    if (cursor === selfDepartmentId) throw new DepartmentCycleError()
    const rows: { parentId: string | null }[] = await db
      .select({ parentId: schema.departments.parentId })
      .from(schema.departments)
      .where(
        and(
          eq(schema.departments.id, cursor),
          eq(schema.departments.orgId, tenantId),
        ),
      )
    const row = rows[0]
    if (!row) return // broken chain — treat as safe terminator
    cursor = row.parentId
  }
  // 100-hop limit reached without cycle — assume tree depth is excessive but safe.
}

/**
 * Returns true if the given employee is a head of the given department.
 */
export async function isDepartmentHead(
  db: DrizzleD1,
  departmentId: string,
  employeeId: string,
): Promise<boolean> {
  const rows = await db
    .select({ role: schema.departmentMembers.role })
    .from(schema.departmentMembers)
    .where(
      and(
        eq(schema.departmentMembers.departmentId, departmentId),
        eq(schema.departmentMembers.employeeId, employeeId),
      ),
    )
  return rows.some((r) => r.role === "head")
}
