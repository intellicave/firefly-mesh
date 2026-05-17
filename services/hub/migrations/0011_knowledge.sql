-- M8 sprint 2026-05-18 — knowledge base (three-tier scope)
-- knowledge_documents + knowledge_chunks with kb_scope_check CHECK.
-- embedding column is BLOB nullable; populated by Vectorize binding in
-- V1.1. Inline-text upload only (md/txt) this sprint; pdf/docx land in
-- V1.1 with R2 + external parser.
-- See docs/plans/2026-05-18-firefly-mesh-product-layer-m8-m9-design.md §2.1-2.2

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id                TEXT PRIMARY KEY,
  org_id            TEXT NOT NULL REFERENCES tenants(id)     ON DELETE CASCADE,
  scope             TEXT NOT NULL
    CHECK (scope IN ('company','department','personal')),
  department_id     TEXT REFERENCES departments(id) ON DELETE CASCADE,
  owner_employee_id TEXT REFERENCES employees(id)   ON DELETE CASCADE,
  title             TEXT NOT NULL,
  description       TEXT,
  tags              TEXT NOT NULL DEFAULT '[]',
  file_type         TEXT NOT NULL
    CHECK (file_type IN ('md','txt','pdf','docx','html')),
  file_url          TEXT,
  file_size         INTEGER,
  index_status      TEXT NOT NULL DEFAULT 'ready'
    CHECK (index_status IN ('pending','indexing','ready','failed')),
  chunk_count       INTEGER NOT NULL DEFAULT 0,
  embed_model       TEXT,
  last_indexed_at   TEXT,
  created_by        TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  CHECK (
    (scope = 'company'    AND department_id IS NULL  AND owner_employee_id IS NULL)
 OR (scope = 'department' AND department_id IS NOT NULL)
 OR (scope = 'personal'   AND owner_employee_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_kb_documents_org ON knowledge_documents(org_id);
CREATE INDEX IF NOT EXISTS idx_kb_documents_scope_org
  ON knowledge_documents(org_id, scope);
CREATE INDEX IF NOT EXISTS idx_kb_documents_dept
  ON knowledge_documents(department_id);
CREATE INDEX IF NOT EXISTS idx_kb_documents_owner
  ON knowledge_documents(owner_employee_id);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id                TEXT PRIMARY KEY,
  document_id       TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  org_id            TEXT NOT NULL REFERENCES tenants(id)             ON DELETE CASCADE,
  scope             TEXT NOT NULL
    CHECK (scope IN ('company','department','personal')),
  department_id     TEXT,
  owner_employee_id TEXT,
  chunk_index       INTEGER NOT NULL,
  content           TEXT NOT NULL,
  embedding         BLOB,
  start_offset      INTEGER,
  end_offset        INTEGER,
  heading_path      TEXT,
  created_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_doc   ON knowledge_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_org   ON knowledge_chunks(org_id);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_scope ON knowledge_chunks(org_id, scope);
