/**
 * Task state machine — sprint 2026-05-17 M10.
 *
 * 7 states; main flow uses 6 (pending_dispatch_approval reserved for V1.1
 * LLM-based dispatch). Approved and cancelled are terminal.
 *
 * Rejection bumps review_round and lets the assignee re-submit
 * (rejected → pending_review).
 */

// Re-export the shared helper so existing imports
// `import { resolveAgentOwnerEmployee } from "../lib/tasks.ts"` keep working
// without forcing every route to update — round-3 arch M1 consolidation.
export { resolveAgentOwnerEmployee } from "./agents.ts"

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
