import { and, eq } from "drizzle-orm"
import * as schema from "../db/schema.ts"
import type { DrizzleD1 } from "../db/connect.ts"

/**
 * Shared agent → owner-employee lookup, tenant-scoped. Round-3 reviewer
 * arch M1 consolidation: previously lib/tasks.ts (resolveAgentOwnerEmployee)
 * and lib/a2a-messages.ts (resolveAgentEmployee) implemented the same query
 * under different names — the duplication risked drift if one was changed
 * (e.g. add status check) and the other wasn't. Both callers now import
 * from this module.
 *
 * Returns:
 *   - agentExists=false when the (agentId, tenantId) pair isn't found
 *     (cross-tenant guard: agent in another tenant looks identical to
 *     "doesn't exist" to the caller — safe by default).
 *   - employeeId=null for legacy agents (pre-M5) that don't yet have an
 *     owner_employee_id set. Callers decide whether to refuse or fall back.
 */
export async function resolveAgentOwnerEmployee(
  db: DrizzleD1,
  agentId: string,
  tenantId: string,
): Promise<{ agentExists: boolean; employeeId: string | null }> {
  const rows = await db
    .select({
      id: schema.agents.id,
      ownerEmployeeId: schema.agents.ownerEmployeeId,
    })
    .from(schema.agents)
    .where(
      and(eq(schema.agents.id, agentId), eq(schema.agents.tenantId, tenantId)),
    )
  const row = rows[0]
  if (!row) return { agentExists: false, employeeId: null }
  return { agentExists: true, employeeId: row.ownerEmployeeId }
}
