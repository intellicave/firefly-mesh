/**
 * Scheduled cleanup tasks (per plan.md M2 acceptance, P0-4 hardening).
 *
 * Triggers (configured in wrangler.toml):
 *   - hourly: drain expired pending_messages (delivery TTL = 72h)
 *   - daily : truncate audit_log to last 90 days
 *
 * Design notes (P0-4 — Linus blocker + Schneier critical):
 * The previous implementation did `CREATE TABLE audit_log_keep AS SELECT…`
 * then DROP TABLE / RENAME / re-trigger. Three problems:
 *   1. Cloudflare cron triggers are NOT single-instance guaranteed: two
 *      overlapping firings could both hit `audit_log_keep` and overwrite
 *      each other, silently destroying retained rows.
 *   2. D1 batches do NOT give DDL atomicity — any mid-flight failure
 *      between DROP and RENAME leaves audit_log gone permanently.
 *   3. R16's "cron.*truncate" regex whitelist is too loose (Schneier).
 *
 * New flow (this file):
 *   - Single-statement CAS lease on cron_locks (re-entrancy guard).
 *   - One D1 batch: drop both append-only triggers, DELETE old rows,
 *     recreate both triggers. The trigger gap is bounded to one batch;
 *     no DROP TABLE means data is never destroyed by a partial failure.
 *   - Release the lease in `finally`. Stale leases auto-expire so a
 *     crashed Worker can never permanently lock out the cron path.
 *
 * R16 markers — the SQL strings below contain "audit_log" and "DELETE".
 * Each affected line carries a `cron.truncate(audit_log)` marker comment
 * so the red-line.yml regex `(\.test\.|cron.*truncate)` exclusion still
 * matches at the precise call site, not just somewhere in the file.
 */

import { drizzle } from "drizzle-orm/d1"
import { lt } from "drizzle-orm"
import * as schema from "../db/schema.ts"
import type { Bindings } from "../auth.ts"

export type CronTask = "hourly-pending" | "daily-audit-truncate"

/** Lease TTL — chosen to be comfortably larger than a healthy cron run. */
const LEASE_TTL_MS = 5 * 60 * 1000

/**
 * Compare-and-swap lease acquisition.
 *
 * Returns true if THIS invocation now holds the named lease. The INSERT
 * succeeds for a never-seen lease name; the ON CONFLICT UPDATE replaces
 * a STALE lease (older than ttlMs) but leaves a fresh lease untouched —
 * `WHERE cron_locks.acquired_at < :expiry` is the lock.
 *
 * Single SQL statement = no TOCTOU; D1 serialises writes inside one
 * prepared statement.
 */
async function acquireLease(env: Bindings, name: string): Promise<boolean> {
  const nowIso = new Date().toISOString()
  const expiryIso = new Date(Date.now() - LEASE_TTL_MS).toISOString()
  const res = await env.DB.prepare(
    "INSERT INTO cron_locks (name, acquired_at) VALUES (?, ?) " +
      "ON CONFLICT(name) DO UPDATE SET acquired_at = excluded.acquired_at " +
      "WHERE cron_locks.acquired_at < ?",
  )
    .bind(name, nowIso, expiryIso)
    .run()
  return ((res.meta?.changes ?? 0) as number) > 0
}

/** Release the lease — best-effort; stale leases auto-expire via TTL anyway. */
async function releaseLease(env: Bindings, name: string): Promise<void> {
  try {
    await env.DB.prepare("DELETE FROM cron_locks WHERE name = ?").bind(name).run()
  } catch {
    /* swallow; TTL will clean up */
  }
}

/**
 * cron.truncate(audit_log) — daily retention enforcement.
 *
 * Lease-guarded so concurrent firings (CF cron is not single-instance
 * guaranteed) do not interleave. The destructive work is one D1 batch
 * (drop triggers → DELETE old rows → recreate triggers) so the trigger
 * gap is bounded to a single batch round-trip.
 *
 * @returns count of rows deleted (0 if lease busy / nothing to delete).
 */
async function cronTruncateAuditLog(env: Bindings, cutoffIso: string): Promise<number> {
  const got = await acquireLease(env, "audit_truncate")
  if (!got) {
    console.warn(
      "[cron] audit_truncate: another invocation holds the lease — skipping this run",
    )
    return 0
  }

  try {
    const result = await env.DB.batch([
      // cron.truncate(audit_log) — drop append-only triggers for this batch only
      env.DB.prepare("DROP TRIGGER IF EXISTS audit_log_no_update"),
      env.DB.prepare("DROP TRIGGER IF EXISTS audit_log_no_delete"),
      // cron.truncate(audit_log) — purge rows older than the retention cutoff
      env.DB.prepare("DELETE FROM audit_log WHERE created_at < ?").bind(cutoffIso), // cron.truncate(audit_log)
      // cron.truncate(audit_log) — reinstate append-only triggers atomically.
      // Marker comment appears on every line that contains the trigger-body
      // tokens (BEFORE UPDATE ON audit_log / BEFORE DELETE ON audit_log) so // cron.truncate(audit_log)
      // R16's line-by-line grep matches and exempts them. These statements
      // re-INSTALL the protection; they are not destructive themselves.
      env.DB.prepare(
        "CREATE TRIGGER IF NOT EXISTS audit_log_no_update " +
          "BEFORE UPDATE ON audit_log " + // cron.truncate(audit_log)
          "BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END",
      ),
      env.DB.prepare(
        "CREATE TRIGGER IF NOT EXISTS audit_log_no_delete " +
          "BEFORE DELETE ON audit_log " + // cron.truncate(audit_log)
          "BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END",
      ),
    ])
    // Statement index 2 is the DELETE; meta.changes is the purged row count.
    const purged = ((result[2]?.meta as { changes?: number } | undefined)?.changes ?? 0) as number
    // Only release on full success — see below for the failure path rationale.
    await releaseLease(env, "audit_truncate")
    return purged
  } catch (err) {
    // CRITICAL: do NOT release the lease on batch failure.
    //
    // SQLite DDL (DROP TRIGGER / CREATE TRIGGER) is auto-committed per-
    // statement; D1's batch transaction only rolls back DML. If the batch
    // throws after the two DROP TRIGGER statements but before the CREATE
    // TRIGGER re-installs, the table is left WITHOUT append-only triggers
    // until they get recreated. Releasing the lease here would let another
    // cron firing (or a stale-reclaim) immediately enter the same batch
    // path against a triggerless table — compounding the gap.
    //
    // By holding the lease until TTL expires (5 min), we give operators
    // time to notice the error, manually re-create the missing triggers
    // (e.g. via scripts/install-audit-triggers.mjs), and prevent a second
    // cron invocation from making things worse in the meantime.
    console.error(
      "[cron] audit_truncate: batch failed — lease retained until TTL to " +
        "prevent re-entry into a possibly triggerless audit_log. " +
        "Run scripts/install-audit-triggers.mjs --remote to restore triggers if needed.",
      err,
    )
    throw err
  }
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
    const purged = await cronTruncateAuditLog(env, ninetyDaysAgo)
    return { task, outcome: `audit_log purged ${purged} rows older than ${ninetyDaysAgo}` }
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
