-- M3: encryption layer

-- Extend agents table with X25519 identity key
ALTER TABLE agents ADD COLUMN identity_key_x TEXT;

-- One-time prekeys (X25519, consumed on first use)
CREATE TABLE IF NOT EXISTS one_time_prekeys (
  id          TEXT PRIMARY KEY,
  agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  key_id      INTEGER NOT NULL,
  public_key  TEXT NOT NULL,
  consumed_at TEXT,
  created_at  TEXT NOT NULL,
  UNIQUE (agent_id, key_id)
);

CREATE INDEX IF NOT EXISTS idx_one_time_prekeys_agent_unconsumed
  ON one_time_prekeys (agent_id, consumed_at);
