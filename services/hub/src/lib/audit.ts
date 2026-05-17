import { nanoid } from "nanoid"
import * as schema from "../db/schema.ts"
import type { DrizzleD1 } from "../db/connect.ts"

/**
 * Audit log writer — sprint 2026-05-17 M12.
 *
 * Centralises all audit_log inserts so the new columns added in migration
 * 0009 (actor_type, resource_type, resource_id, payload) are populated
 * consistently. The legacy `target_id` column is also written (mirrors
 * resource.id) for back-compat with any reader that still queries it.
 *
 * Per rules.md §Q1: callers MUST use this module. Direct
 * `db.insert(schema.auditLog).values(...)` is banned.
 *
 * Two APIs:
 *   - `writeAudit(db, params)`  — async insert; typical use
 *   - `auditValues(params)`     — sync; builds the row object so callers
 *                                 can include the insert in a `db.batch([...])`
 *                                 for atomicity with other writes
 *
 * DURABILITY MODEL — best-effort, NOT transactional with the mutation.
 *   Most callers do:  await mutate(...); await writeAudit(...).
 *   If writeAudit throws (D1 transient, schema mismatch), the mutation
 *   already committed and the audit row is lost. The exception bubbles
 *   to the request handler and becomes a 500, but no rollback occurs.
 *
 *   For events where audit loss is unacceptable (compliance-grade trails:
 *   role.changed, boundary.updated, invitation.accepted, etc.), callers
 *   MUST use `auditValues()` inside a `db.batch([...])` alongside the
 *   mutation — see invitations.ts for the canonical pattern. NOTE that
 *   D1's batch() is serialized-not-transactional, so even with batch the
 *   caller must catch partial-failure and roll back manually.
 *
 *   For lower-stakes events (tenant.created, task.started, etc.) the
 *   silent-loss-on-D1-flake risk is accepted as the cost of simpler code.
 */

export type AuditActorType = "human" | "agent" | "system"

export interface AuditWriteParams {
  /** Null only for system-level events not tied to a tenant (rare). */
  tenantId: string | null
  actor: { type: AuditActorType; id: string }
  /** Dot-namespaced, e.g. "tenant.created", "a2a_message.approved". */
  action: string
  /** Optional target resource. Strongly recommended for record-level audits. */
  resource?: { type: string; id: string }
  /** Free-form JSON payload (diff, context, etc.). Serialised here. */
  payload?: Record<string, unknown>
}

/** Build the audit_log row values; safe to embed in db.batch([...]). */
export function auditValues(
  p: AuditWriteParams,
): typeof schema.auditLog.$inferInsert {
  return {
    id: nanoid(21),
    tenantId: p.tenantId,
    actorId: p.actor.id,
    actorType: p.actor.type,
    action: p.action,
    // Mirror resource.id into legacy target_id for back-compat.
    targetId: p.resource?.id ?? null,
    resourceType: p.resource?.type ?? null,
    resourceId: p.resource?.id ?? null,
    payload: p.payload ? JSON.stringify(p.payload) : null,
    createdAt: new Date().toISOString(),
  }
}

export async function writeAudit(
  db: DrizzleD1,
  p: AuditWriteParams,
): Promise<void> {
  await db.insert(schema.auditLog).values(auditValues(p))
}
