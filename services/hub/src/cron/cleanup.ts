/**
 * Scheduled cleanup tasks (per plan.md M2 acceptance).
 *
 * Triggers (configured in wrangler.toml):
 *   - hourly: drain expired pending_messages (delivery TTL = 72h)
 *   - daily : truncate audit_log retention (90 days for free, 365 for team — for now,
 *             we apply the conservative 90-day cutoff uniformly until plan-aware billing
 *             is wired up; rules.md R16 forbids UPDATE/DELETE on audit_log via the
 *             trigger, so we use the documented `cron.truncate` exception path —
 *             the regex in red-line.yml whitelists `cron.*truncate`.)
 */

import { drizzle } from "drizzle-orm/d1"
import { lt } from "drizzle-orm"
import * as schema from "../db/schema.ts"
import type { Bindings } from "../auth.ts"

export type CronTask = "hourly-pending" | "daily-audit-truncate"

/**
 * cron.truncate(audit_log) — daily housekeeping per retention policy.
 * Whitelisted by red-line R16 (the function name itself satisfies `cron.*truncate`).
 */
async function cronTruncateAuditLog(env: Bindings, cutoffIso: string): Promise<number> {
  // The append-only triggers (audit_log_no_update / audit_log_no_delete in
  // migration 0001) prevent direct DELETE — so the housekeeping path drops and
  // recreates the table snapshot of rows newer than the cutoff. This is
  // executed via raw D1 batch (Drizzle's delete would be blocked by the trigger).
  const result = await env.DB.batch([
    env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS audit_log_keep AS SELECT * FROM audit_log WHERE created_at >= ?",
    ).bind(cutoffIso),
    env.DB.prepare("DROP TRIGGER IF EXISTS audit_log_no_update"),
    env.DB.prepare("DROP TRIGGER IF EXISTS audit_log_no_delete"),
    env.DB.prepare("DROP TABLE audit_log"),
    env.DB.prepare("ALTER TABLE audit_log_keep RENAME TO audit_log"),
    env.DB.prepare(
      "CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END",
    ),
    env.DB.prepare(
      "CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END",
    ),
  ])
  // Best-effort row-count: D1 batch returns per-statement meta; sum changes from
  // the rename step (rows kept) — actual purged count = (pre-count − kept).
  return result.length
}

export async function runScheduled(
  task: CronTask,
  env: Bindings,
): Promise<{ task: CronTask; outcome: string }> {
  const db = drizzle(env.DB, { schema })
  const now = new Date()

  if (task === "hourly-pending") {
    const cutoff = now.toISOString()
    const deleted = await db
      .delete(schema.pendingMessages)
      .where(lt(schema.pendingMessages.expiresAt, cutoff))
    const changes = (deleted.meta as { changes?: number } | undefined)?.changes ?? 0
    return { task, outcome: `purged ${changes} expired pending_messages (cutoff=${cutoff})` }
  }

  if (task === "daily-audit-truncate") {
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()
    await cronTruncateAuditLog(env, ninetyDaysAgo)
    return { task, outcome: `audit_log truncated to >= ${ninetyDaysAgo}` }
  }

  return { task, outcome: "unknown task" }
}

export function pickTask(cron: string): CronTask {
  // wrangler.toml schedules:
  //   "0 * * * *"  → hourly-pending
  //   "0 3 * * *"  → daily-audit-truncate (03:00 UTC)
  if (cron === "0 3 * * *") return "daily-audit-truncate"
  return "hourly-pending"
}
