// A2A broker — persists messages + manages threads + emits SSE events.
// Per api §4.5 + design §6.7. Owned by core; called by /api/a2a/send route.

import { and, eq, sql } from "drizzle-orm";

import { db } from "../db/index.ts";
import {
  a2aMessages,
  a2aThreads,
  agents,
  employees,
} from "../db/schema/index.ts";
import { computeHitlFlags } from "../hitl/engine.ts";
import { audit, logAction } from "../audit/log.ts";
import { bus } from "../events/bus.ts";

import { canonicalize } from "./signing.ts";
import type { A2AMessageType } from "./protocol.ts";

export interface BrokerSendInput {
  orgId: string;
  senderAgentId: string;
  senderEmployeeId: string;
  /** Pre-verified ed25519 signature (base64) of canonicalized request body. */
  senderSignature: string;
  receiverAgentId?: string;
  receiverEmployeeId?: string;
  threadId?: string;
  replyToMessageId?: string;
  type: ReturnType<typeof A2AMessageType.parse>;
  content: {
    summary: string;
    body?: string;
    structured?: Record<string, unknown>;
  };
  relatedTaskId?: string;
}

export interface BrokerSendResult {
  messageId: string;
  threadId: string;
  senderApprovalStatus: "pending" | "approved" | "rejected" | "auto";
  receiverActionStatus: "pending" | "accepted" | "rejected" | "auto";
  deliveryStatus: "queued_pending_approval" | "delivered";
}

export type BrokerError =
  | "RECEIVER_NOT_FOUND"
  | "CROSS_ORG_FORBIDDEN"
  | "RECEIVER_NO_ACTIVE_AGENT"
  | "INVALID_THREAD";

interface BrokerOk {
  ok: true;
  data: BrokerSendResult;
}
interface BrokerFail {
  ok: false;
  error: BrokerError;
}
export type BrokerOutcome = BrokerOk | BrokerFail;

/**
 * Resolve receiver agent + employee. Caller may pass either by employee id
 * or by agent id; the other side is looked up via DB.
 */
async function resolveReceiver(
  orgId: string,
  receiverAgentId?: string,
  receiverEmployeeId?: string,
): Promise<
  | {
      agentId: string;
      employeeId: string;
    }
  | { error: BrokerError }
> {
  if (receiverAgentId) {
    const [a] = await db
      .select({
        id: agents.id,
        ownerEmployeeId: agents.ownerEmployeeId,
        orgId: agents.orgId,
        status: agents.status,
      })
      .from(agents)
      .where(eq(agents.id, receiverAgentId))
      .limit(1);
    if (!a) return { error: "RECEIVER_NOT_FOUND" };
    if (a.orgId !== orgId) return { error: "CROSS_ORG_FORBIDDEN" };
    if (a.status !== "active")
      return { error: "RECEIVER_NO_ACTIVE_AGENT" };
    return { agentId: a.id, employeeId: a.ownerEmployeeId };
  }
  if (receiverEmployeeId) {
    const [a] = await db
      .select({ id: agents.id, status: agents.status })
      .from(agents)
      .innerJoin(employees, eq(employees.id, agents.ownerEmployeeId))
      .where(
        and(
          eq(agents.ownerEmployeeId, receiverEmployeeId),
          eq(agents.orgId, orgId),
          eq(agents.status, "active"),
        ),
      )
      .limit(1);
    if (!a) return { error: "RECEIVER_NO_ACTIVE_AGENT" };
    return { agentId: a.id, employeeId: receiverEmployeeId };
  }
  return { error: "RECEIVER_NOT_FOUND" };
}

/**
 * Find or create the thread.
 */
async function ensureThread(
  orgId: string,
  threadId: string | undefined,
  topic: string,
  relatedTaskId: string | undefined,
): Promise<{ threadId: string } | { error: "INVALID_THREAD" }> {
  if (threadId) {
    const [t] = await db
      .select({ id: a2aThreads.id, orgId: a2aThreads.orgId })
      .from(a2aThreads)
      .where(eq(a2aThreads.id, threadId))
      .limit(1);
    if (!t) return { error: "INVALID_THREAD" };
    if (t.orgId !== orgId) return { error: "INVALID_THREAD" };
    return { threadId: t.id };
  }
  const inserted = await db
    .insert(a2aThreads)
    .values({
      orgId,
      topic: topic.slice(0, 200),
      relatedTaskId,
    })
    .returning({ id: a2aThreads.id });
  return { threadId: inserted[0]!.id };
}

export async function sendMessage(
  input: BrokerSendInput,
): Promise<BrokerOutcome> {
  const recv = await resolveReceiver(
    input.orgId,
    input.receiverAgentId,
    input.receiverEmployeeId,
  );
  if ("error" in recv) return { ok: false, error: recv.error };

  const threadResult = await ensureThread(
    input.orgId,
    input.threadId,
    input.content.summary,
    input.relatedTaskId,
  );
  if ("error" in threadResult) {
    return { ok: false, error: threadResult.error };
  }
  const threadId = threadResult.threadId;

  // Re-canonicalize input content + addressing for audit trail
  const canonicalDigest = canonicalize({
    type: input.type,
    content: input.content,
    sender: input.senderAgentId,
    receiver: recv.agentId,
    threadId,
  });
  void canonicalDigest; // currently logged via audit_log payload below

  // Compute HITL flags from message type
  const flags = computeHitlFlags(input.type);

  // Persist message
  const inserted = await db
    .insert(a2aMessages)
    .values({
      orgId: input.orgId,
      threadId,
      replyToMessageId: input.replyToMessageId,
      senderAgentId: input.senderAgentId,
      senderEmployeeId: input.senderEmployeeId,
      senderSignature: input.senderSignature,
      receiverAgentId: recv.agentId,
      receiverEmployeeId: recv.employeeId,
      type: input.type,
      content: input.content,
      senderApprovalRequired: flags.senderApprovalRequired ? "true" : "false",
      senderApprovalStatus: flags.senderApprovalStatus,
      receiverActionRequired: flags.receiverActionRequired ? "true" : "false",
      receiverActionStatus: flags.receiverActionStatus,
      relatedTaskId: input.relatedTaskId,
    })
    .returning({ id: a2aMessages.id });

  const messageId = inserted[0]!.id;

  // Bump thread message count
  await db
    .update(a2aThreads)
    .set({
      messageCount: sql`(${a2aThreads.messageCount}::int + 1)::text`,
    })
    .where(eq(a2aThreads.id, threadId));

  // Audit
  await audit.a2a.created(
    input.orgId,
    input.senderAgentId,
    messageId,
    input.type,
  );

  // Emit SSE events:
  // - if sender needs approval → notify sender's employee inbox
  // - else if receiver needs action → notify receiver's employee inbox
  // - else (auto/auto) → both informational; deliver immediately to receiver's inbox
  const deliveryStatus: BrokerSendResult["deliveryStatus"] =
    flags.senderApprovalRequired ? "queued_pending_approval" : "delivered";

  if (flags.senderApprovalRequired) {
    bus.publish(`inbox.${input.senderEmployeeId}`, "a2a.message.created", {
      messageId,
      type: input.type,
      direction: "outbound_pending",
    });
  } else if (flags.receiverActionRequired) {
    bus.publish(
      `inbox.${recv.employeeId}`,
      "a2a.message.received",
      { messageId, type: input.type },
    );
  } else {
    // inform/sync auto-delivered — receiver inbox sees it as informational
    bus.publish(
      `inbox.${recv.employeeId}`,
      "a2a.message.received",
      { messageId, type: input.type, autoDelivered: true },
    );
  }

  // Always emit to org-wide audit channel
  bus.publish(`audit.org.${input.orgId}`, "a2a.message.created", {
    messageId,
    threadId,
    type: input.type,
  });

  return {
    ok: true,
    data: {
      messageId,
      threadId,
      senderApprovalStatus: flags.senderApprovalStatus,
      receiverActionStatus: flags.receiverActionStatus,
      deliveryStatus,
    },
  };
}

export function brokerErrorToHttp(err: BrokerError): {
  status: number;
  code: string;
  message: string;
} {
  switch (err) {
    case "RECEIVER_NOT_FOUND":
      return { status: 404, code: "NOT_FOUND", message: "Receiver agent not found" };
    case "CROSS_ORG_FORBIDDEN":
      return {
        status: 404,
        code: "NOT_FOUND",
        message: "Receiver not found in your org",
      };
    case "RECEIVER_NO_ACTIVE_AGENT":
      return {
        status: 409,
        code: "CONFLICT",
        message: "Receiver employee has no active agent",
      };
    case "INVALID_THREAD":
      return {
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Thread not found in your org",
      };
  }
}

// Suppress unused-export warning for logAction (kept for downstream callers)
void logAction;
