-- Product layer — sprint 2026-05-16
-- Adds the v0 organization-collaboration product layer (employees,
-- departments, projects) on top of hub's agent-mesh substrate.
-- Does NOT touch existing 15 tables.
-- See docs/plans/2026-05-16-firefly-mesh-product-layer-design.md
--
-- organizations API exposes /api/organizations but reuses the `tenants` table.
-- V1.1 decision: rename physical table or keep alias.

CREATE TABLE IF NOT EXISTS employees (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  title       TEXT,
  avatar_url  TEXT,
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('active','archived')),
  role        TEXT NOT NULL DEFAULT 'employee'
              CHECK (role IN ('owner','admin','manager','employee','auditor')),
  created_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS employees_org_email_uq
  ON employees(org_id, email);
CREATE UNIQUE INDEX IF NOT EXISTS employees_org_user_uq
  ON employees(org_id, user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS departments (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_id   TEXT,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS department_members (
  department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  employee_id   TEXT NOT NULL REFERENCES employees(id)   ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'member'
                CHECK (role IN ('head','member')),
  joined_at     TEXT NOT NULL,
  PRIMARY KEY (department_id, employee_id)
);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'planning'
              CHECK (status IN ('planning','active','done','archived')),
  start_at    TEXT,
  end_at      TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id  TEXT NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  role        TEXT,
  joined_at   TEXT NOT NULL,
  PRIMARY KEY (project_id, employee_id)
);
