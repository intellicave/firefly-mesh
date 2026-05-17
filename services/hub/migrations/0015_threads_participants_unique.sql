-- 0015_threads_participants_unique.sql
--
-- Round-30 reviewer M: migration 0014 added a non-unique index on
-- threads(tenant_id, participants). Without UNIQUE, two concurrent first-
-- sends for the same participant pair can both miss the existing-thread
-- lookup and both insert a new threads row — producing orphan threads
-- that are silent and permanently unbounded.
--
-- Fix:
--   1. Dedupe any existing duplicates per (tenant_id, participants):
--      keep the OLDEST thread (lowest created_at), redirect messages_meta
--      .thread_id references on duplicates to the kept thread, then
--      delete the duplicate threads.
--   2. Drop the non-unique index from 0014, add a UNIQUE one.
--
-- pending_messages.thread_id is TEXT without FK (see schema.ts line 228)
-- so it does not need redirection.

-- Step 1: redirect messages_meta.thread_id from duplicates to the kept (oldest) thread.
UPDATE messages_meta
SET thread_id = (
  SELECT keeper.id
  FROM threads keeper
  WHERE keeper.tenant_id = (
    SELECT t.tenant_id FROM threads t WHERE t.id = messages_meta.thread_id
  )
  AND keeper.participants = (
    SELECT t.participants FROM threads t WHERE t.id = messages_meta.thread_id
  )
  ORDER BY keeper.created_at ASC, keeper.id ASC
  LIMIT 1
)
WHERE messages_meta.thread_id IS NOT NULL
AND messages_meta.thread_id <> (
  SELECT keeper.id
  FROM threads keeper
  WHERE keeper.tenant_id = (
    SELECT t.tenant_id FROM threads t WHERE t.id = messages_meta.thread_id
  )
  AND keeper.participants = (
    SELECT t.participants FROM threads t WHERE t.id = messages_meta.thread_id
  )
  ORDER BY keeper.created_at ASC, keeper.id ASC
  LIMIT 1
);

-- Step 2: delete duplicate threads (keep only the oldest per group).
DELETE FROM threads
WHERE id NOT IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY tenant_id, participants
             ORDER BY created_at ASC, id ASC
           ) AS rn
    FROM threads
  ) WHERE rn = 1
);

-- Step 3: drop the non-unique index from 0014 and add the unique one.
DROP INDEX IF EXISTS idx_threads_tenant_participants;
CREATE UNIQUE INDEX IF NOT EXISTS idx_threads_tenant_participants_unique
  ON threads(tenant_id, participants);
