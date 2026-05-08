// Append-only audit log writer (M1-4).
// Database-level RULE blocks UPDATE/DELETE — see post-migrate.ts.

import { db } from "../db/index.ts";
import { auditLog } from "../db/schema/audit.ts";

export interface AuditEntry {
  orgId: string;
  actorType: "human" | "agent" | "system";
  actorId?: string;
  action: string; // e.g. "task.dispatched", "a2a.message.created"
  resourceType?: string;
  resourceId?: string;
  payload?: Record<string, unknown>;
}

export async function logAction(entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    orgId: entry.orgId,
    actorType: entry.actorType,
    actorId: entry.actorId,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    payload: entry.payload,
  });
}

/**
 * Convenience wrappers — keep call sites readable.
 * action format: <domain>.<verb> per rules.md §10.1.
 */
export const audit = {
  task: {
    dispatched: (orgId: string, actorId: string, taskId: string, payload?: Record<string, unknown>) =>
      logAction({ orgId, actorType: "human", actorId, action: "task.dispatched", resourceType: "task", resourceId: taskId, payload }),
    submitted: (orgId: string, actorId: string, taskId: string) =>
      logAction({ orgId, actorType: "human", actorId, action: "task.submitted", resourceType: "task", resourceId: taskId }),
    reviewed: (orgId: string, actorId: string, taskId: string, decision: "approved" | "rejected") =>
      logAction({ orgId, actorType: "human", actorId, action: "task.reviewed", resourceType: "task", resourceId: taskId, payload: { decision } }),
  },
  a2a: {
    created: (orgId: string, actorId: string, messageId: string, type: string) =>
      logAction({ orgId, actorType: "agent", actorId, action: "a2a.message.created", resourceType: "a2a_message", resourceId: messageId, payload: { type } }),
    approved: (orgId: string, actorId: string, messageId: string) =>
      logAction({ orgId, actorType: "human", actorId, action: "a2a.message.approved", resourceType: "a2a_message", resourceId: messageId }),
  },
  agent: {
    activated: (orgId: string, agentId: string, runtimeKind: string) =>
      logAction({ orgId, actorType: "system", action: "agent.activated", resourceType: "agent", resourceId: agentId, payload: { runtimeKind } }),
  },
  knowledge: {
    indexed: (orgId: string, actorId: string, docId: string, chunkCount: number) =>
      logAction({ orgId, actorType: "system", actorId, action: "knowledge.indexed", resourceType: "knowledge_document", resourceId: docId, payload: { chunkCount } }),
  },
};
