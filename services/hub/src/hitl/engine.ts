/**
 * HITL (Human In The Loop) state machine — server-side truth (rules.md R9).
 *
 * `computeHitlFlags(messageType)` is the single source of truth for whether a
 * message requires receiver approval before action proceeds.
 *
 * Per design.md HITL simplification: no client may "self-report HITL completed",
 * the server decides based on message type.
 */

export type A2AMessageType =
  | "inform"
  | "sync"
  | "request"
  | "commit"
  | "handoff"
  | "escalate"
  | "block"

export interface HitlFlags {
  /** Receiver must explicitly accept before action proceeds. */
  requireApproval: boolean
  /** Hub auto-accepts on the receiver's behalf (no UI prompt). */
  autoAccept: boolean
}

export function computeHitlFlags(messageType: A2AMessageType): HitlFlags {
  switch (messageType) {
    case "inform":
    case "sync":
      // Informational only — no human in loop required.
      return { requireApproval: false, autoAccept: true }
    case "request":
    case "handoff":
      // Action requested from receiver — require explicit accept.
      return { requireApproval: true, autoAccept: false }
    case "commit":
      // Side-effecting action — require explicit accept.
      return { requireApproval: true, autoAccept: false }
    case "escalate":
    case "block":
      // High-priority — receiver must consciously accept/reject.
      return { requireApproval: true, autoAccept: false }
  }
}
