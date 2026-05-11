-- Cron leases (P0-4 — audit_log truncate concurrency guard).
-- Each scheduled task takes a named lease before doing destructive work.
-- The compare-and-swap UPDATE in services/hub/src/cron/cleanup.ts uses
-- the `acquired_at` column to detect stale leases (older than the task's
-- max runtime) and reclaim them, so a worker that died mid-flight cannot
-- permanently lock the cron path out.
CREATE TABLE IF NOT EXISTS cron_locks (
  name        TEXT PRIMARY KEY,
  acquired_at TEXT NOT NULL
);
