-- Better Auth core tables.
-- Timestamp columns are INTEGER (unix-seconds) so Drizzle's D1 driver can
-- (de)serialise the Date objects Better Auth passes — D1 cannot bind raw Date.
CREATE TABLE IF NOT EXISTS "user" (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  image       TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
  id          TEXT PRIMARY KEY,
  expires_at  INTEGER NOT NULL,
  token       TEXT NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  ip_address  TEXT,
  user_agent  TEXT,
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  id                        TEXT PRIMARY KEY,
  account_id                TEXT NOT NULL,
  provider_id               TEXT NOT NULL,
  user_id                   TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  access_token              TEXT,
  refresh_token             TEXT,
  id_token                  TEXT,
  access_token_expires_at   INTEGER,
  refresh_token_expires_at  INTEGER,
  scope                     TEXT,
  password                  TEXT,
  created_at                INTEGER NOT NULL,
  updated_at                INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
  id          TEXT PRIMARY KEY,
  identifier  TEXT NOT NULL,
  value       TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER,
  updated_at  INTEGER
);

-- App tables
CREATE TABLE IF NOT EXISTS tenants (
  id           TEXT PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  owner_id     TEXT NOT NULL REFERENCES "user"(id),
  plan         TEXT NOT NULL DEFAULT 'free',
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member',
  joined_at  TEXT NOT NULL,
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS invitations (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  token       TEXT NOT NULL UNIQUE,
  role        TEXT NOT NULL DEFAULT 'member',
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  invited_by  TEXT NOT NULL REFERENCES "user"(id),
  created_at  TEXT NOT NULL
);

-- audit_log (append-only)
-- Append-only is enforced by SQLite triggers, but those live OUTSIDE this
-- migration file: wrangler's `d1 migrations apply` splits SQL on `;`, which
-- breaks any BEGIN/END trigger body. The triggers are installed by the
-- post-migration script `scripts/install-audit-triggers.mjs` instead, which
-- uses `wrangler d1 execute --command` (single-statement API).
-- See docs/deploy/edge.md §1.4.
CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT REFERENCES tenants(id),
  actor_id   TEXT NOT NULL,
  action     TEXT NOT NULL,
  target_id  TEXT,
  created_at TEXT NOT NULL
);
