-- M12 sprint 2026-05-17 — audit_log extension
-- Adds 4 nullable columns. target_id is retained for back-compat;
-- new code (lib/audit.ts::writeAudit) mirrors resource_id into target_id
-- so old readers continue to work.
-- See docs/plans/2026-05-17-firefly-mesh-product-layer-m11-m12-design.md §2.3

ALTER TABLE audit_log ADD COLUMN actor_type TEXT
  CHECK (actor_type IN ('human','agent','system'));

ALTER TABLE audit_log ADD COLUMN resource_type TEXT;

ALTER TABLE audit_log ADD COLUMN resource_id TEXT;

ALTER TABLE audit_log ADD COLUMN payload TEXT;
