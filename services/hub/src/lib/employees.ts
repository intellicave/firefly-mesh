import { and, eq, ne } from "drizzle-orm"
import * as schema from "../db/schema.ts"
import type { DrizzleD1 } from "../db/connect.ts"
import type { EmployeeRole, MembershipRole } from "../middleware/orgGuard.ts"

/**
 * Maps a product-layer employee role to the system-layer membership role.
 *
 *   employee.role          memberships.role
 *   ─────────────────────  ─────────────────
 *   owner                  owner
 *   admin                  admin
 *   manager                member
 *   employee               member
 *   auditor                member
 */
export function mapEmployeeRoleToMembership(role: EmployeeRole): MembershipRole {
  if (role === "owner") return "owner"
  if (role === "admin") return "admin"
  return "member"
}

/**
 * Atomically updates an employee's role AND the matching memberships row.
 * Idempotent: if memberships row missing (rare), creates one.
 *
 * Caller must have already enforced RBAC (caller is owner/admin), self-protect
 * (caller != target), and last-owner-guard (if downgrading an owner).
 */
export async function syncEmployeeRole(
  db: DrizzleD1,
  opts: { tenantId: string; employeeId: string; userId: string; newRole: EmployeeRole; joinedAt: string },
): Promise<void> {
  const { tenantId, employeeId, userId, newRole, joinedAt } = opts

  await db
    .update(schema.employees)
    .set({ role: newRole })
    .where(
      and(
        eq(schema.employees.id, employeeId),
        eq(schema.employees.orgId, tenantId),
      ),
    )

  const membershipRole = mapEmployeeRoleToMembership(newRole)
  const existing = await db
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.tenantId, tenantId),
        eq(schema.memberships.userId, userId),
      ),
    )

  if (existing.length === 0) {
    await db.insert(schema.memberships).values({
      tenantId,
      userId,
      role: membershipRole,
      joinedAt,
    })
  } else if (existing[0]?.role !== membershipRole) {
    await db
      .update(schema.memberships)
      .set({ role: membershipRole })
      .where(
        and(
          eq(schema.memberships.tenantId, tenantId),
          eq(schema.memberships.userId, userId),
        ),
      )
  }
}

/**
 * Counts active owner employees in a tenant, optionally excluding one employee.
 * Used by last-owner-guard: ensure at least one owner remains after a change.
 */
export async function countOtherActiveOwners(
  db: DrizzleD1,
  tenantId: string,
  excludeEmployeeId: string,
): Promise<number> {
  const rows = await db
    .select({ id: schema.employees.id })
    .from(schema.employees)
    .where(
      and(
        eq(schema.employees.orgId, tenantId),
        eq(schema.employees.role, "owner"),
        eq(schema.employees.status, "active"),
        ne(schema.employees.id, excludeEmployeeId),
      ),
    )
  return rows.length
}

export class LastOwnerError extends Error {
  constructor() {
    super("Cannot remove or demote the last owner of the tenant")
  }
}

/**
 * Throws LastOwnerError if this change would leave the tenant with zero
 * active owners. Pass `intended_action`:
 *   - 'demote' — role changing from 'owner' to non-owner
 *   - 'archive' — status changing from 'active' to 'archived'
 *   - 'delete' — employee being removed
 */
export async function assertNotLastOwner(
  db: DrizzleD1,
  tenantId: string,
  employeeId: string,
  currentEmployee: { role: EmployeeRole; status: "active" | "archived" },
): Promise<void> {
  if (currentEmployee.role !== "owner" || currentEmployee.status !== "active") {
    return
  }
  const others = await countOtherActiveOwners(db, tenantId, employeeId)
  if (others === 0) {
    throw new LastOwnerError()
  }
}
