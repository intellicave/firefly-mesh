-- M9 sprint 2026-05-18 — skills + agent_skills (three-tier scope)
-- manifest_id @ version uniqueness within (scope, dept|owner) enforced at
-- app layer (dup check returns 409 CONFLICT). agent_skills.enabled is
-- INTEGER 0/1 (D1 has no native boolean).
-- skill loader endpoint + execution engine land in V1.1/V2.
-- See docs/plans/2026-05-18-firefly-mesh-product-layer-m8-m9-design.md §2.3-2.4

CREATE TABLE IF NOT EXISTS skills (
  id                TEXT PRIMARY KEY,
  org_id            TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  manifest_id       TEXT NOT NULL,
  version           TEXT NOT NULL,
  manifest          TEXT NOT NULL,
  scope             TEXT NOT NULL
    CHECK (scope IN ('company','department','personal')),
  department_id     TEXT REFERENCES departments(id) ON DELETE CASCADE,
  owner_employee_id TEXT REFERENCES employees(id)   ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','deprecated','archived')),
  created_by        TEXT REFERENCES employees(id)   ON DELETE SET NULL,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  CHECK (
    (scope = 'company'    AND department_id IS NULL  AND owner_employee_id IS NULL)
 OR (scope = 'department' AND department_id IS NOT NULL)
 OR (scope = 'personal'   AND owner_employee_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_skills_org          ON skills(org_id);
CREATE INDEX IF NOT EXISTS idx_skills_scope_org    ON skills(org_id, scope);
CREATE INDEX IF NOT EXISTS idx_skills_manifest     ON skills(org_id, manifest_id);

CREATE TABLE IF NOT EXISTS agent_skills (
  agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  skill_id    TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  enabled     INTEGER NOT NULL DEFAULT 1,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (agent_id, skill_id)
);
