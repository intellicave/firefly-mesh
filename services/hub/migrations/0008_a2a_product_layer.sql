-- M11 sprint 2026-05-17 — A2A product tier
-- a2a_threads + a2a_messages with HITL bidirectional state machine.
-- Bridges to hub encryption layer via a2a_messages.encrypted_message_id
-- → messages_meta.id (cascade keeps the two layers consistent).
-- See docs/plans/2026-05-17-firefly-mesh-product-layer-m11-m12-design.md

CREATE TABLE IF NOT EXISTS a2a_threads (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  topic           TEXT,
  related_task_id TEXT,
  message_count   INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_a2a_threads_org ON a2a_threads(org_id);

CREATE TABLE IF NOT EXISTS a2a_messages (
  id                       TEXT PRIMARY KEY,
  org_id                   TEXT NOT NULL REFERENCES tenants(id)        ON DELETE CASCADE,
  thread_id                TEXT NOT NULL REFERENCES a2a_threads(id)    ON DELETE CASCADE,
  encrypted_message_id     TEXT NOT NULL REFERENCES messages_meta(id)  ON DELETE CASCADE,
  reply_to_message_id      TEXT,

  sender_agent_id          TEXT NOT NULL REFERENCES agents(id)    ON DELETE CASCADE,
  sender_employee_id       TEXT REFERENCES employees(id)          ON DELETE SET NULL,
  receiver_agent_id        TEXT NOT NULL REFERENCES agents(id)    ON DELETE CASCADE,
  receiver_employee_id     TEXT REFERENCES employees(id)          ON DELETE SET NULL,

  type                     TEXT NOT NULL CHECK (type IN
    ('inform','sync','request','commit','handoff','escalate','block')),

  sender_approval_status   TEXT NOT NULL DEFAULT 'auto'
    CHECK (sender_approval_status IN ('pending','approved','rejected','auto')),
  sender_approval_by       TEXT REFERENCES employees(id),
  sender_approval_at       TEXT,

  receiver_action_status   TEXT NOT NULL DEFAULT 'auto'
    CHECK (receiver_action_status IN ('pending','accepted','rejected','auto')),
  receiver_action_by       TEXT REFERENCES employees(id),
  receiver_action_at       TEXT,

  related_task_id          TEXT,
  created_at               TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_a2a_messages_org ON a2a_messages(org_id);
CREATE INDEX IF NOT EXISTS idx_a2a_messages_thread ON a2a_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_a2a_messages_receiver_emp
  ON a2a_messages(receiver_employee_id, receiver_action_status);
CREATE INDEX IF NOT EXISTS idx_a2a_messages_sender_emp
  ON a2a_messages(sender_employee_id, sender_approval_status);
CREATE INDEX IF NOT EXISTS idx_a2a_messages_encrypted
  ON a2a_messages(encrypted_message_id);
