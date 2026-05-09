import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core"

// ---------------------------------------------------------------------------
// Better Auth core tables
//
// Better Auth passes JS Date objects directly to its database adapter.
// Drizzle's D1 driver cannot bind a raw Date — D1 only accepts string,
// number, boolean, null, or Uint8Array. So Better Auth's timestamp columns
// must use integer-timestamp mode (Unix ms), which Drizzle then transparently
// (de)serialises Date <-> integer. App tables further down stay text/ISO8601.
// ---------------------------------------------------------------------------

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
})

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
})

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
})

// ---------------------------------------------------------------------------
// App tables
// ---------------------------------------------------------------------------

export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id),
  plan: text("plan", { enum: ["free", "pro"] }).notNull().default("free"),
  createdAt: text("created_at").notNull(),
})

export const memberships = sqliteTable(
  "memberships",
  {
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "admin", "member"] })
      .notNull()
      .default("member"),
    joinedAt: text("joined_at").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.tenantId, t.userId] }) }),
)

export const invitations = sqliteTable("invitations", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  invitedBy: text("invited_by")
    .notNull()
    .references(() => user.id),
  createdAt: text("created_at").notNull(),
})

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenants.id),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  targetId: text("target_id"),
  createdAt: text("created_at").notNull(),
})

// ---------------------------------------------------------------------------
// M2: Delivery tables
// ---------------------------------------------------------------------------

export const devicePairingCodes = sqliteTable("device_pairing_codes", {
  code: text("code").primaryKey(),
  deviceName: text("device_name").notNull(),
  userId: text("user_id").references(() => user.id),
  tenantId: text("tenant_id").references(() => tenants.id),
  agentId: text("agent_id"),
  expiresAt: text("expires_at").notNull(),
  claimedAt: text("claimed_at"),
})

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => user.id),
  displayName: text("display_name").notNull(),
  type: text("type", { enum: ["skill", "bot"] }).notNull().default("skill"),
  identityKey: text("identity_key"),
  identityKeyX: text("identity_key_x"),
  signedPrekey: text("signed_prekey"),
  signedPrekeySig: text("signed_prekey_sig"),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at"),
})

export const oneTimePrekeys = sqliteTable(
  "one_time_prekeys",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    keyId: integer("key_id").notNull(),
    publicKey: text("public_key").notNull(),
    consumedAt: text("consumed_at"),
    createdAt: text("created_at").notNull(),
  },
)

export const threads = sqliteTable("threads", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  participants: text("participants").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
  lastMessageAt: text("last_message_at").notNull(),
})

export const messagesMeta = sqliteTable("messages_meta", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").references(() => threads.id),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  senderAgentId: text("sender_agent_id").references(() => agents.id),
  recipientAgentId: text("recipient_agent_id").references(() => agents.id),
  type: text("type").notNull().default("inform"),
  summary: text("summary"),
  createdAt: text("created_at").notNull(),
})

export const pendingMessages = sqliteTable("pending_messages", {
  id: text("id").primaryKey(),
  messageId: text("message_id")
    .notNull()
    .references(() => messagesMeta.id, { onDelete: "cascade" }),
  recipientAgentId: text("recipient_agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  senderAgentId: text("sender_agent_id").references(() => agents.id),
  threadId: text("thread_id"),
  payload: text("payload").notNull(),
  ciphertext: text("ciphertext"),
  nonce: text("nonce"),
  ephemeralPk: text("ephemeral_pk"),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
})

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: text("created_at").notNull(),
})
