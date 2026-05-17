import { and, eq } from "drizzle-orm"
import * as schema from "../db/schema.ts"
import type { DrizzleD1 } from "../db/connect.ts"

/**
 * Task state machine — sprint 2026-05-17 M10.
 *
 * 7 states; main flow uses 6 (pending_dispatch_approval reserved for V1.1
 * LLM-based dispatch). Approved and cancelled are terminal.
 *
 * Rejection bumps review_round and lets the assignee re-submit
 * (rejected → pending_review).
 */

export type TaskStatus =
  | "pending_dispatch_approval"
  | "assigned"
  | "in_progress"
  | "pending_review"
  | "rejected"
  | "approved"
  | "cancelled"

const TRANSITIONS: Record<TaskStatus, ReadonlyArray<TaskStatus>> = {
  pending_dispatch_approval: ["assigned", "cancelled"],
  assigned: ["in_progress", "pending_review", "cancelled"],
  in_progress: ["pending_review", "cancelled"],
  pending_review: ["approved", "rejected", "cancelled"],
  rejected: ["pending_review", "cancelled"],
  approved: [],
  cancelled: [],
}

export class InvalidTaskTransitionError extends Error {
  readonly code = "INVALID_TRANSITION"
  constructor(from: TaskStatus, to: TaskStatus) {
    super(`Invalid task status transition: ${from} → ${to}`)
  }
}

export function assertValidTransition(
  from: TaskStatus,
  to: TaskStatus,
): void {
  // No silent idempotent no-op: every state change must be a real
  // transition. Re-approving an already-approved task must 409, not 200.
  if (!TRANSITIONS[from].includes(to)) {
    throw new InvalidTaskTransitionError(from, to)
  }
}

export class SelfReviewError extends Error {
  readonly code = "SELF_REVIEW_FORBIDDEN"
  constructor() {
    super("Assignee cannot review their own task")
  }
}

/**
 * Look up the employee that owns the given agent, scoped to a tenant.
 * Used by POST /api/tasks/:id/submit when called via agent JWT.
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
