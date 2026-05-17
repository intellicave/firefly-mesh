import { computeHitlFlags, type A2AMessageType } from "../hitl/engine.ts"
// Re-export the shared agent lookup so existing imports
// `import { resolveAgentEmployee } from "../lib/a2a-messages.ts"` keep
// working — round-3 arch M1 consolidation.
export { resolveAgentOwnerEmployee as resolveAgentEmployee } from "./agents.ts"

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
 * Map an A2A message type to the required boundary scope. Round-3 architecture
 * C2 fix: until now POST /api/a2a-messages enforced no scope, so an agent
 * whose admin had revoked send_a2a_request (for example) could still send
 * `request` messages. We now map every type to a scope and reject unmatched
 * agents up front.
 *
 * Sync types collapse onto send_a2a_inform (both are informational; no HITL
 * reachable on receiver). Escalate and block collapse onto send_a2a_handoff
 * because they both demand human action on the receiving side and "handoff"
 * is the closest existing scope (M6 P5 deferred adding dedicated
 * send_a2a_escalate / send_a2a_block scopes to a later sprint when the
 * boundary editor UI matures).
 */
export function scopeForA2aType(type: A2AMessageType): string {
  switch (type) {
    case "inform":
    case "sync":
      return "send_a2a_inform"
    case "request":
      return "send_a2a_request"
    case "commit":
      return "send_a2a_commit"
    case "handoff":
    case "escalate":
    case "block":
      return "send_a2a_handoff"
    default: {
      // Force exhaustive — TypeScript catches unknown types at compile time;
      // at runtime, refuse to send rather than silently fall back.
      const _exhaustive: never = type
      throw new Error(`scopeForA2aType: unknown message type "${_exhaustive}"`)
    }
  }
}

