-- M5 — sprint 2026-05-17
-- agents table: add product-layer columns so an agent is associated with
-- the employee profile (not just the Better Auth user) and so the runtime
-- (openclaw / claude-code / etc.) is recorded for display + audit purposes.
--
-- owner_user_id is RETAINED as fallback (see rules.md §N1).
-- New code should prefer owner_employee_id.
-- See docs/plans/2026-05-17-firefly-mesh-product-layer-m5-m7-design.md

ALTER TABLE agents ADD COLUMN owner_employee_id TEXT
  REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE agents ADD COLUMN runtime_kind TEXT NOT NULL DEFAULT 'unknown'
  CHECK (runtime_kind IN (
    'openclaw',
    'hermes',
    'claude-code',
    'cursor',
    'claude-desktop',
    'other-mcp',
    'unknown'
  ));

ALTER TABLE agents ADD COLUMN runtime_meta TEXT;

ALTER TABLE agents ADD COLUMN activated_at TEXT;
