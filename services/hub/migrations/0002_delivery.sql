-- Device pairing codes (OAuth Device Authorization style)
CREATE TABLE IF NOT EXISTS device_pairing_codes (
  code        TEXT PRIMARY KEY,
  device_name TEXT NOT NULL,
  user_id     TEXT REFERENCES "user"(id),
  tenant_id   TEXT REFERENCES tenants(id),
  agent_id    TEXT,
  expires_at  TEXT NOT NULL,
  claimed_at  TEXT
);

-- Agents
CREATE TABLE IF NOT EXISTS agents (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_user_id     TEXT NOT NULL REFERENCES "user"(id),
  display_name      TEXT NOT NULL,
  type              TEXT NOT NULL DEFAULT 'skill',
  identity_key      TEXT,
  signed_prekey     TEXT,
  signed_prekey_sig TEXT,
  created_at        TEXT NOT NULL,
  last_seen_at      TEXT
);

-- Threads
CREATE TABLE IF NOT EXISTS threads (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  participants    TEXT NOT NULL DEFAULT '[]',
  created_at      TEXT NOT NULL,
  last_message_at TEXT NOT NULL
);

-- Message metadata (hub never stores plaintext body/structured)
CREATE TABLE IF NOT EXISTS messages_meta (
  id                TEXT PRIMARY KEY,
  thread_id         TEXT REFERENCES threads(id),
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sender_agent_id   TEXT REFERENCES agents(id),
  recipient_agent_id TEXT REFERENCES agents(id),
  type              TEXT NOT NULL DEFAULT 'inform',
  summary           TEXT,
  created_at        TEXT NOT NULL
);

-- Pending messages (72h TTL, delivery queue for offline agents)
CREATE TABLE IF NOT EXISTS pending_messages (
  id                TEXT PRIMARY KEY,
  message_id        TEXT NOT NULL REFERENCES messages_meta(id) ON DELETE CASCADE,
  recipient_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  sender_agent_id   TEXT REFERENCES agents(id),
  thread_id         TEXT,
  payload           TEXT NOT NULL,
  ciphertext        TEXT,
  nonce             TEXT,
  ephemeral_pk      TEXT,
  created_at        TEXT NOT NULL,
  expires_at        TEXT NOT NULL
);

-- Web Push subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id        TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  endpoint  TEXT NOT NULL UNIQUE,
  p256dh    TEXT NOT NULL,
  auth      TEXT NOT NULL,
  created_at TEXT NOT NULL
);
