import { and, eq } from "drizzle-orm"
import * as schema from "../db/schema.ts"
import type { DrizzleD1 } from "../db/connect.ts"
import { computeHitlFlags, type A2AMessageType } from "../hitl/engine.ts"

/**
 * Product-layer A2A messages — sprint 2026-05-17 M11.
 *
 * The HITL bidirectional state machine lives here. Hub's existing
 * computeHitlFlags(type) gives us the "does receiver need approval"
 * answer; we extend it to compute the SENDER-side initial state as well
 * (v0 spec: request/commit/handoff also block on sender approval).
 */

export type SenderApprovalStatus = "pending" | "approved" | "rejected" | "auto"
export type ReceiverActionStatus = "pending" | "accepted" | "rejected" | "auto"

export interface InitialA2aStatus {
  senderApprovalStatus: SenderApprovalStatus
  receiverActionStatus: ReceiverActionStatus
}

/**
 * Initial HITL state per message type.
 *
 *   inform / sync         → both auto (no human in the loop)
 *   request / commit /
 *     handoff             → sender pending + receiver pending
 *   escalate / block      → sender auto + receiver pending
 */
export function computeInitialA2aStatus(
  type: A2AMessageType,
): InitialA2aStatus {
  // Receiver side comes straight from hub's existing engine.
  const recv = computeHitlFlags(type)
  const receiverActionStatus: ReceiverActionStatus = recv.autoAccept
    ? "auto"
    : "pending"

  // Sender side: request / commit / handoff block on sender approval too.
  let senderApprovalStatus: SenderApprovalStatus
  switch (type) {
    case "request":
    case "commit":
    case "handoff":
      senderApprovalStatus = "pending"
      break
    case "inform":
    case "sync":
    case "escalate":
    case "block":
    default:
      senderApprovalStatus = "auto"
  }

  return { senderApprovalStatus, receiverActionStatus }
}

/**
 * State machine validation: returns the next status for the given side.
 * Throws InvalidA2aTransitionError on illegal transition (e.g. already
 * approved → approve again).
 */
export class InvalidA2aTransitionError extends Error {
  readonly code = "INVALID_STATUS"
  constructor(side: "sender" | "receiver", current: string, action: string) {
    super(
      `Invalid ${side} state transition: ${current} → ${action} (already terminal)`,
    )
  }
}

const SENDER_TRANSITIONS: Record<
  SenderApprovalStatus,
  Record<"approve" | "reject", SenderApprovalStatus | null>
> = {
  pending: { approve: "approved", reject: "rejected" },
  approved: { approve: null, reject: null },
  rejected: { approve: null, reject: null },
  auto: { approve: null, reject: null },
}

const RECEIVER_TRANSITIONS: Record<
  ReceiverActionStatus,
  Record<"accept" | "reject", ReceiverActionStatus | null>
> = {
  pending: { accept: "accepted", reject: "rejected" },
  accepted: { accept: null, reject: null },
  rejected: { accept: null, reject: null },
  auto: { accept: null, reject: null },
}

export function nextSenderStatus(
  current: SenderApprovalStatus,
  action: "approve" | "reject",
): SenderApprovalStatus {
  const next = SENDER_TRANSITIONS[current][action]
  if (!next) throw new InvalidA2aTransitionError("sender", current, action)
  return next
}

export function nextReceiverStatus(
  current: ReceiverActionStatus,
  action: "accept" | "reject",
): ReceiverActionStatus {
  const next = RECEIVER_TRANSITIONS[current][action]
  if (!next) throw new InvalidA2aTransitionError("receiver", current, action)
  return next
}

/**
 * Look up the employee that owns the given agent in the given tenant.
 * Returns null if the agent doesn't have owner_employee_id set (legacy
 * agent pre-M5 sprint) — caller decides whether to proceed.
 */
export async function resolveAgentEmployee(
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
