-- M10 sprint 2026-05-17 — tasks + HITL state machine
-- 7-state lifecycle. creator/assignee/reviewer all SET NULL on employee
-- delete so the task history is preserved even when an employee record
-- is removed. API layer enforces non-null creator at create time.
-- See docs/plans/2026-05-17-firefly-mesh-product-layer-m10-design.md

CREATE TABLE IF NOT EXISTS tasks (
  id                       TEXT PRIMARY KEY,
  org_id                   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  parent_id                TEXT,
  root_id                  TEXT,

  creator_employee_id      TEXT REFERENCES employees(id) ON DELETE SET NULL,
  assignee_employee_id     TEXT REFERENCES employees(id) ON DELETE SET NULL,
  reviewer_employee_id     TEXT REFERENCES employees(id) ON DELETE SET NULL,

  title                    TEXT NOT NULL,
  description              TEXT,
  output                   TEXT,
  deadline                 TEXT,

  status                   TEXT NOT NULL DEFAULT 'assigned'
    CHECK (status IN (
      'pending_dispatch_approval',
      'assigned',
      'in_progress',
      'pending_review',
      'rejected',
      'approved',
      'cancelled'
    )),

  dispatch_approval_id     TEXT REFERENCES a2a_messages(id) ON DELETE SET NULL,
  review_approval_id       TEXT REFERENCES a2a_messages(id) ON DELETE SET NULL,

  review_round             INTEGER NOT NULL DEFAULT 0,
  review_comment           TEXT,

  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_org ON tasks(org_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status
  ON tasks(assignee_employee_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_reviewer_status
  ON tasks(reviewer_employee_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_creator ON tasks(creator_employee_id);
