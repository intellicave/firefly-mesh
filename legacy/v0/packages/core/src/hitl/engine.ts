// HITL state machine (M3-1).
//
// Bidirectional approval per api §4.5 + design §6.7:
// - Sender side: pending_sender_approval → approved | rejected
// - Receiver side: pending_recvr_action → accepted | rejected
//
// Per rules.md R9: only this engine flips senderApprovalStatus /
// receiverActionStatus. Routes call these functions; routes never
// update those columns directly.

import { and, eq } from "drizzle-orm";

import { db } from "../db/index.ts";
import { a2aMessages, agents, employees } from "../db/schema/index.ts";
import { logAction } from "../audit/log.ts";

export type HitlError =
  | "MESSAGE_NOT_FOUND"
  | "WRONG_ORG"
  | "NOT_PENDING"
  | "NOT_ALLOWED";

interface HitlResult<T = void> {
  ok: boolean;
  error?: HitlError;
  data?: T;
}

/**
 * Sender-side approval. Caller must already be authenticated as the
 * sender's owner employee (route's job).
 *
 * On approve: senderApprovalStatus → 'approved'.
 *   If receiverActionRequired (commit/request/handoff) → receiver
 *   notification will be triggered by the broker layer.
 *
 * On reject: senderApprovalStatus → 'rejected'. Message NOT delivered.
 */
export async function approveSenderSide(
  messageId: string,
  approverEmployeeId: string,
  orgId: string,
  comment?: string,
): Promise<HitlResult> {
  const [msg] = await db
    .select({
      id: a2aMessages.id,
      senderEmployeeId: a2aMessages.senderEmployeeId,
      senderApprovalStatus: a2aMessages.senderApprovalStatus,
      type: a2aMessages.type,
      orgId: a2aMessages.orgId,
    })
    .from(a2aMessages)
    .where(eq(a2aMessages.id, messageId))
    .limit(1);

  if (!msg) return { ok: false, error: "MESSAGE_NOT_FOUND" };
  if (msg.orgId !== orgId) return { ok: false, error: "WRONG_ORG" };
  if (msg.senderEmployeeId !== approverEmployeeId) {
    return { ok: false, error: "NOT_ALLOWED" };
  }
  if (msg.senderApprovalStatus !== "pending") {
    return { ok: false, error: "NOT_PENDING" };
  }

  await db
    .update(a2aMessages)
    .set({
      senderApprovalStatus: "approved",
      senderApprovalBy: approverEmployeeId,
      senderApprovalAt: new Date(),
    })
    .where(eq(a2aMessages.id, messageId));

  await logAction({
    orgId,
    actorType: "human",
    actorId: approverEmployeeId,
    action: "a2a.message.approved",
    resourceType: "a2a_message",
    resourceId: messageId,
    payload: comment ? { comment } : undefined,
  });

  return { ok: true };
}

export async function rejectSenderSide(
  messageId: string,
  approverEmployeeId: string,
  orgId: string,
  comment?: string,
): Promise<HitlResult> {
  const [msg] = await db
    .select({
      id: a2aMessages.id,
      senderEmployeeId: a2aMessages.senderEmployeeId,
      senderApprovalStatus: a2aMessages.senderApprovalStatus,
      orgId: a2aMessages.orgId,
    })
    .from(a2aMessages)
    .where(eq(a2aMessages.id, messageId))
    .limit(1);

  if (!msg) return { ok: false, error: "MESSAGE_NOT_FOUND" };
  if (msg.orgId !== orgId) return { ok: false, error: "WRONG_ORG" };
  if (msg.senderEmployeeId !== approverEmployeeId) {
    return { ok: false, error: "NOT_ALLOWED" };
  }
  if (msg.senderApprovalStatus !== "pending") {
    return { ok: false, error: "NOT_PENDING" };
  }

  await db
    .update(a2aMessages)
    .set({
      senderApprovalStatus: "rejected",
      senderApprovalBy: approverEmployeeId,
      senderApprovalAt: new Date(),
    })
    .where(eq(a2aMessages.id, messageId));

  await logAction({
    orgId,
    actorType: "human",
    actorId: approverEmployeeId,
    action: "a2a.message.rejected",
    resourceType: "a2a_message",
    resourceId: messageId,
    payload: comment ? { comment } : undefined,
  });

  return { ok: true };
}

/**
 * Receiver-side accept. Caller must be the receiver's owner employee.
 * Only valid when the message has been sender-approved + needs receiver action.
 */
export async function acceptReceiverSide(
  messageId: string,
  accepterEmployeeId: string,
  orgId: string,
  comment?: string,
): Promise<HitlResult> {
  const [msg] = await db
    .select({
      id: a2aMessages.id,
      receiverEmployeeId: a2aMessages.receiverEmployeeId,
      receiverActionStatus: a2aMessages.receiverActionStatus,
      senderApprovalStatus: a2aMessages.senderApprovalStatus,
      orgId: a2aMessages.orgId,
    })
    .from(a2aMessages)
    .where(eq(a2aMessages.id, messageId))
    .limit(1);

  if (!msg) return { ok: false, error: "MESSAGE_NOT_FOUND" };
  if (msg.orgId !== orgId) return { ok: false, error: "WRONG_ORG" };
  if (msg.receiverEmployeeId !== accepterEmployeeId) {
    return { ok: false, error: "NOT_ALLOWED" };
  }
  if (msg.receiverActionStatus !== "pending") {
    return { ok: false, error: "NOT_PENDING" };
  }
  // sender must have approved (or auto) before receiver can accept
  if (
    msg.senderApprovalStatus !== "approved" &&
    msg.senderApprovalStatus !== "auto"
  ) {
    return { ok: false, error: "NOT_PENDING" };
  }

  await db
    .update(a2aMessages)
    .set({
      receiverActionStatus: "accepted",
      receiverActionBy: accepterEmployeeId,
      receiverActionAt: new Date(),
    })
    .where(eq(a2aMessages.id, messageId));

  await logAction({
    orgId,
    actorType: "human",
    actorId: accepterEmployeeId,
    action: "a2a.message.accepted",
    resourceType: "a2a_message",
    resourceId: messageId,
    payload: comment ? { comment } : undefined,
  });

  return { ok: true };
}

export async function rejectReceiverSide(
  messageId: string,
  rejecterEmployeeId: string,
  orgId: string,
  comment?: string,
): Promise<HitlResult> {
  const [msg] = await db
    .select({
      id: a2aMessages.id,
      receiverEmployeeId: a2aMessages.receiverEmployeeId,
      receiverActionStatus: a2aMessages.receiverActionStatus,
      orgId: a2aMessages.orgId,
    })
    .from(a2aMessages)
    .where(eq(a2aMessages.id, messageId))
    .limit(1);

  if (!msg) return { ok: false, error: "MESSAGE_NOT_FOUND" };
  if (msg.orgId !== orgId) return { ok: false, error: "WRONG_ORG" };
  if (msg.receiverEmployeeId !== rejecterEmployeeId) {
    return { ok: false, error: "NOT_ALLOWED" };
  }
  if (msg.receiverActionStatus !== "pending") {
    return { ok: false, error: "NOT_PENDING" };
  }

  await db
    .update(a2aMessages)
    .set({
      receiverActionStatus: "rejected",
      receiverActionBy: rejecterEmployeeId,
      receiverActionAt: new Date(),
    })
    .where(eq(a2aMessages.id, messageId));

  await logAction({
    orgId,
    actorType: "human",
    actorId: rejecterEmployeeId,
    action: "a2a.message.rejected_receiver",
    resourceType: "a2a_message",
    resourceId: messageId,
    payload: comment ? { comment } : undefined,
  });

  return { ok: true };
}

/**
 * HITL matrix from api §4.3:
 * - inform / sync: senderApprovalRequired=false, receiverActionRequired=false
 * - request / commit / handoff: both required
 * - escalate: senderApprovalRequired=false (agent can auto), receiver must process
 * - block: senderApprovalRequired=false, receiver must respond
 */
export function computeHitlFlags(
  type: "inform" | "sync" | "request" | "commit" | "handoff" | "escalate" | "block",
): {
  senderApprovalRequired: boolean;
  receiverActionRequired: boolean;
  senderApprovalStatus: "pending" | "auto";
  receiverActionStatus: "pending" | "auto";
} {
  switch (type) {
    case "inform":
    case "sync":
      return {
        senderApprovalRequired: false,
        receiverActionRequired: false,
        senderApprovalStatus: "auto",
        receiverActionStatus: "auto",
      };
    case "request":
    case "commit":
    case "handoff":
      return {
        senderApprovalRequired: true,
        receiverActionRequired: true,
        senderApprovalStatus: "pending",
        receiverActionStatus: "pending",
      };
    case "escalate":
      return {
        senderApprovalRequired: false,
        receiverActionRequired: true,
        senderApprovalStatus: "auto",
        receiverActionStatus: "pending",
      };
    case "block":
      return {
        senderApprovalRequired: false,
        receiverActionRequired: true,
        senderApprovalStatus: "auto",
        receiverActionStatus: "pending",
      };
  }
}

/**
 * Resolve an employee's agent. Used by tooling that needs to map
 * message endpoints employees↔agents.
 */
export async function getEmployeeActiveAgent(employeeId: string, orgId: string) {
  const [agent] = await db
    .select({ id: agents.id, status: agents.status })
    .from(agents)
    .innerJoin(employees, eq(employees.id, agents.ownerEmployeeId))
    .where(
      and(
        eq(agents.ownerEmployeeId, employeeId),
        eq(agents.orgId, orgId),
        eq(agents.status, "active"),
      ),
    )
    .limit(1);
  return agent ?? null;
}

export function hitlErrorToHttp(err: HitlError): {
  status: number;
  code: string;
  message: string;
} {
  switch (err) {
    case "MESSAGE_NOT_FOUND":
      return { status: 404, code: "NOT_FOUND", message: "Message not found" };
    case "WRONG_ORG":
      return { status: 404, code: "NOT_FOUND", message: "Message not found" };
    case "NOT_PENDING":
      return {
        status: 409,
        code: "CONFLICT",
        message: "Message is not in a pending state",
      };
    case "NOT_ALLOWED":
      return {
        status: 403,
        code: "FORBIDDEN",
        message: "Not authorized for this action",
      };
  }
}
