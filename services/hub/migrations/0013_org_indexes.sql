-- 0013_org_indexes.sql
--
-- Round-23 reviewer M (departments/projects org_id index gap):
-- Both `departments` and `projects` are queried by `org_id` on every list
-- endpoint, but neither table had a standalone index on `org_id`. Without
-- the index, SQLite full-scans the entire (cross-tenant) table per request
-- — a DoS-at-scale vector. Adding the indexes brings these two tables in
-- line with employees / tasks / a2a_threads / a2a_messages / knowledge_*
-- / skills, all of which already have an org-scoped index.
--
-- Idempotent (IF NOT EXISTS) so re-application on already-migrated D1
-- instances is a no-op.

CREATE INDEX IF NOT EXISTS idx_departments_org ON departments(org_id);
CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(org_id);
