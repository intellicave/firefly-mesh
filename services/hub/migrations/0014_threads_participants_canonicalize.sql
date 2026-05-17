-- 0014_threads_participants_canonicalize.sql
--
-- Round-29 reviewer H1: a2a-messages.ts encryption-thread lookup loaded
-- ALL threads for the tenant into the Worker isolate and used Array.find
-- + JSON.parse to canonicalize participants (because legacy rows might
-- have stored unsorted [sender, recipient] order). At scale this is an
-- O(N) memory fetch that can exceed D1's 10MB result limit and burns
-- per-request latency.
--
-- Fix:
--   1. Normalize ALL existing threads.participants to sorted JSON form so
--      string equality matches the canonical participantKey the app builds.
--   2. Add a composite index on (tenant_id, participants) so the lookup
--      becomes a single indexed point query instead of a full-table scan.
--
-- Normalization uses SQLite's json_group_array(value) — for each thread
-- whose participants is a JSON array, we sort it lexically and rewrite.
-- D1 supports json_each() / json_group_array() from the SQLite JSON1
-- extension which is enabled by default.
--
-- For threads where participants is malformed (not a JSON array), the
-- json_each call returns no rows and the json_group_array returns NULL —
-- the COALESCE keeps the original value to avoid blanking valid data.

UPDATE threads
SET participants = COALESCE(
  (
    SELECT json_group_array(value)
    FROM (
      SELECT value
      FROM json_each(participants)
      ORDER BY value
    )
  ),
  participants
);

CREATE INDEX IF NOT EXISTS idx_threads_tenant_participants
  ON threads(tenant_id, participants);
