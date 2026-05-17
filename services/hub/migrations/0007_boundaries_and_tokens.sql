-- M6 + M7 — sprint 2026-05-17
-- M6: representation_boundaries gives each agent a JSON scopes array
--     (server-side enforced via enforceScope() in lib/scopes.ts).
-- M7: agent_tokens allows admins to issue one-time tokens for employees
--     (client-side activate-by-token deferred to V1.1).
-- See docs/plans/2026-05-17-firefly-mesh-product-layer-m5-m7-design.md

CREATE TABLE IF NOT EXISTS representation_boundaries (
  id          TEXT PRIMARY KEY,
  agent_id    TEXT NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
  scopes      TEXT NOT NULL DEFAULT '[]',
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_tokens (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES tenants(id)    ON DELETE CASCADE,
  employee_id  TEXT NOT NULL REFERENCES employees(id)  ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  agent_id     TEXT REFERENCES agents(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','consumed','revoked','expired')),
  expires_at   TEXT NOT NULL,
  consumed_at  TEXT,
  revoked_at   TEXT,
  created_at   TEXT NOT NULL,
  created_by   TEXT REFERENCES employees(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_tokens_org_uq
  ON agent_tokens(org_id, id);
CREATE INDEX IF NOT EXISTS idx_agent_tokens_employee
  ON agent_tokens(employee_id);
CREATE INDEX IF NOT EXISTS idx_agent_tokens_token_hash
  ON agent_tokens(token_hash);
