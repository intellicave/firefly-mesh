import { sqliteTable, text, integer, primaryKey, uniqueIndex, blob } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"

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
  // M12 sprint 2026-05-17 — extended fields. All nullable for back-compat.
  // New code writes via lib/audit.ts::writeAudit() and populates these +
  // mirrors resource_id into target_id.
  actorType: text("actor_type", {
    enum: ["human", "agent", "system"],
  }),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  payload: text("payload"),
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
  // Product-layer M5 sprint 2026-05-17: agents reattached to employees.
  // owner_user_id retained for back-compat; new code prefers owner_employee_id.
  ownerEmployeeId: text("owner_employee_id").references(() => employees.id, {
    onDelete: "set null",
  }),
  runtimeKind: text("runtime_kind", {
    enum: [
      "openclaw",
      "hermes",
      "claude-code",
      "cursor",
      "claude-desktop",
      "other-mcp",
      "unknown",
    ],
  })
    .notNull()
    .default("unknown"),
  runtimeMeta: text("runtime_meta"),
  activatedAt: text("activated_at"),
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

// ---------------------------------------------------------------------------
// Product layer — sprint 2026-05-16
// Adds the v0 organization-collaboration product layer (employees, departments,
// projects) on top of hub's agent-mesh communication substrate.
// See docs/plans/2026-05-16-firefly-mesh-product-layer-design.md
//
// organizations API exposes /api/organizations but physically reuses `tenants`.
// V1.1 may rename the physical table; not in this sprint's scope.
// ---------------------------------------------------------------------------

export const employees = sqliteTable(
  "employees",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // Nullable: account_mode='none' supports non-login employees (admin-only audit personas).
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    title: text("title"),
    avatarUrl: text("avatar_url"),
    status: text("status", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    role: text("role", {
      enum: ["owner", "admin", "manager", "employee", "auditor"],
    })
      .notNull()
      .default("employee"),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    orgEmailUq: uniqueIndex("employees_org_email_uq").on(t.orgId, t.email),
    orgUserUq: uniqueIndex("employees_org_user_uq")
      .on(t.orgId, t.userId)
      .where(sql`${t.userId} IS NOT NULL`),
  }),
)

export const departments = sqliteTable("departments", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  // Self-reference is soft (no FK) per rules.md §G2 — SQLite self-ref FK
  // causes migration headaches; application layer enforces cycle prevention.
  parentId: text("parent_id"),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: text("created_at").notNull(),
})

export const departmentMembers = sqliteTable(
  "department_members",
  {
    departmentId: text("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["head", "member"] })
      .notNull()
      .default("member"),
    joinedAt: text("joined_at").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.departmentId, t.employeeId] }),
  }),
)

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status", {
    enum: ["planning", "active", "done", "archived"],
  })
    .notNull()
    .default("planning"),
  startAt: text("start_at"),
  endAt: text("end_at"),
  createdAt: text("created_at").notNull(),
})

export const projectMembers = sqliteTable(
  "project_members",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    // Free-form role label (e.g. "lead", "contributor"); UI surfaces a "lead"
    // marker for project-lead RBAC checks.
    role: text("role"),
    joinedAt: text("joined_at").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectId, t.employeeId] }),
  }),
)

// ---------------------------------------------------------------------------
// Product layer M5-M7 — sprint 2026-05-17
// Adds per-agent boundary scopes (M6) and admin-issued agent tokens (M7).
// M5's agents-table extension (owner_employee_id + runtime_kind +
// runtime_meta + activated_at) lives inline on the `agents` table above.
// See docs/plans/2026-05-17-firefly-mesh-product-layer-m5-m7-design.md
// ---------------------------------------------------------------------------

export const representationBoundaries = sqliteTable("representation_boundaries", {
  id: text("id").primaryKey(),
  // 1:1 with agents — one boundary row per agent. UNIQUE enforces this.
  agentId: text("agent_id")
    .notNull()
    .unique()
    .references(() => agents.id, { onDelete: "cascade" }),
  // JSON-serialised string[] of scope IDs (e.g. ["read_kb", "submit_task"]).
  // App layer uses JSON.parse/stringify; D1 has no JSONB.
  scopes: text("scopes").notNull().default("[]"),
  updatedAt: text("updated_at").notNull(),
})

export const agentTokens = sqliteTable(
  "agent_tokens",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    // SHA-256 hex hash of the plain token; plain token is returned ONCE at
    // creation/regenerate and never stored.
    tokenHash: text("token_hash").notNull().unique(),
    // Set after a successful client-side activate-by-token (M7 V1.1 sprint).
    agentId: text("agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    status: text("status", {
      enum: ["pending", "consumed", "revoked", "expired"],
    })
      .notNull()
      .default("pending"),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull(),
    createdBy: text("created_by").references(() => employees.id),
  },
  (t) => ({
    orgIdx: uniqueIndex("idx_agent_tokens_org_uq").on(t.orgId, t.id),
  }),
)

// ---------------------------------------------------------------------------
// Product layer M11 — sprint 2026-05-17 (a2a product tier)
// Product-tier A2A messages with HITL bidirectional state machine + thread
// topic + employee-to-employee identity. Hub's existing messages_meta +
// pending_messages remain the encryption layer; a2a_messages.encrypted_message_id
// is the bridge.
// See docs/plans/2026-05-17-firefly-mesh-product-layer-m11-m12-design.md §2
// ---------------------------------------------------------------------------

export const a2aThreads = sqliteTable("a2a_threads", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  topic: text("topic"),
  // Soft ref to tasks (M10 sprint). No FK so we can ship M11 without tasks.
  relatedTaskId: text("related_task_id"),
  messageCount: integer("message_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
})

export const a2aMessages = sqliteTable("a2a_messages", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  threadId: text("thread_id")
    .notNull()
    .references(() => a2aThreads.id, { onDelete: "cascade" }),
  // Bridge to the encryption layer. Cascade delete keeps the two layers
  // consistent (deleting an encrypted message also removes its product row).
  encryptedMessageId: text("encrypted_message_id")
    .notNull()
    .references(() => messagesMeta.id, { onDelete: "cascade" }),
  // Soft self-ref (no FK to avoid SQLite self-ref migration headaches).
  replyToMessageId: text("reply_to_message_id"),

  senderAgentId: text("sender_agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  // Nullable: agents created before M5 don't have owner_employee_id; we set
  // null and the a2a row stays valid (HITL still works for receiver side).
  senderEmployeeId: text("sender_employee_id").references(() => employees.id, {
    onDelete: "set null",
  }),
  receiverAgentId: text("receiver_agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  receiverEmployeeId: text("receiver_employee_id").references(
    () => employees.id,
    { onDelete: "set null" },
  ),

  type: text("type", {
    enum: [
      "inform",
      "sync",
      "request",
      "commit",
      "handoff",
      "escalate",
      "block",
    ],
  }).notNull(),

  // HITL bidirectional state. 'auto' = initial terminal (no human needed).
  senderApprovalStatus: text("sender_approval_status", {
    enum: ["pending", "approved", "rejected", "auto"],
  })
    .notNull()
    .default("auto"),
  senderApprovalBy: text("sender_approval_by").references(() => employees.id),
  senderApprovalAt: text("sender_approval_at"),

  receiverActionStatus: text("receiver_action_status", {
    enum: ["pending", "accepted", "rejected", "auto"],
  })
    .notNull()
    .default("auto"),
  receiverActionBy: text("receiver_action_by").references(() => employees.id),
  receiverActionAt: text("receiver_action_at"),

  // Soft ref to tasks (M10 sprint).
  relatedTaskId: text("related_task_id"),
  createdAt: text("created_at").notNull(),
})

// ---------------------------------------------------------------------------
// Product layer M10 — sprint 2026-05-17 (tasks + HITL state machine)
// 7-state task lifecycle with creator / assignee / reviewer trio.
// assignee != reviewer is enforced at the API layer.
// See docs/plans/2026-05-17-firefly-mesh-product-layer-m10-design.md
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Product layer M8 — sprint 2026-05-18 (knowledge base, three-tier scope)
// 2 tables with three-tier scope (company / department / personal).
// embedding column is BLOB nullable; populated by Vectorize binding in V1.1.
// Inline-text only this sprint (md/txt); pdf/docx land in V1.1 with R2.
// See docs/plans/2026-05-18-firefly-mesh-product-layer-m8-m9-design.md §2
// ---------------------------------------------------------------------------

export const knowledgeDocuments = sqliteTable("knowledge_documents", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  scope: text("scope", { enum: ["company", "department", "personal"] }).notNull(),
  departmentId: text("department_id").references(() => departments.id, {
    onDelete: "cascade",
  }),
  ownerEmployeeId: text("owner_employee_id").references(() => employees.id, {
    onDelete: "cascade",
  }),
  title: text("title").notNull(),
  description: text("description"),
  tags: text("tags").notNull().default("[]"), // JSON string[]
  fileType: text("file_type", {
    enum: ["md", "txt", "pdf", "docx", "html"],
  }).notNull(),
  fileUrl: text("file_url"),
  fileSize: integer("file_size"),
  indexStatus: text("index_status", {
    enum: ["pending", "indexing", "ready", "failed"],
  })
    .notNull()
    .default("ready"),
  chunkCount: integer("chunk_count").notNull().default(0),
  embedModel: text("embed_model"),
  lastIndexedAt: text("last_indexed_at"),
  createdBy: text("created_by").references(() => employees.id, {
    onDelete: "set null",
  }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
})

export const knowledgeChunks = sqliteTable("knowledge_chunks", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
  orgId: text("org_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  // Denormalised — avoids JOIN in RAG hot path. Mirrors v0 behaviour.
  scope: text("scope", { enum: ["company", "department", "personal"] }).notNull(),
  departmentId: text("department_id"),
  ownerEmployeeId: text("owner_employee_id"),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  // Float32 serialised; null this sprint, populated by V1.1 Vectorize sprint.
  embedding: blob("embedding"),
  startOffset: integer("start_offset"),
  endOffset: integer("end_offset"),
  headingPath: text("heading_path"), // JSON string[]
  createdAt: text("created_at").notNull(),
})

// ---------------------------------------------------------------------------
// Product layer M9 — sprint 2026-05-18 (skills + agent_skills)
// agentskills.io standard manifest stored as JSON. Three-tier scope per
// kb (with same CHECK semantics). loader + execution engine → V1.1/V2.
// ---------------------------------------------------------------------------

export const skills = sqliteTable("skills", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  manifestId: text("manifest_id").notNull(), // e.g. "firefly-mesh/email-draft"
  version: text("version").notNull(), // SemVer
  manifest: text("manifest").notNull(), // JSON serialised SkillManifest
  scope: text("scope", { enum: ["company", "department", "personal"] }).notNull(),
  departmentId: text("department_id").references(() => departments.id, {
    onDelete: "cascade",
  }),
  ownerEmployeeId: text("owner_employee_id").references(() => employees.id, {
    onDelete: "cascade",
  }),
  status: text("status", { enum: ["active", "deprecated", "archived"] })
    .notNull()
    .default("active"),
  createdBy: text("created_by").references(() => employees.id, {
    onDelete: "set null",
  }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
})

export const agentSkills = sqliteTable(
  "agent_skills",
  {
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    enabled: integer("enabled").notNull().default(1),
    assignedAt: text("assigned_at").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.agentId, t.skillId] }),
  }),
)

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),

  // Goal ancestry — fields ship now, traversal V1.1.
  parentId: text("parent_id"),
  rootId: text("root_id"),

  // Nullable so ON DELETE SET NULL preserves task history when the creator
  // employee record is removed. API layer enforces non-null at create time.
  creatorEmployeeId: text("creator_employee_id").references(
    () => employees.id,
    { onDelete: "set null" },
  ),
  assigneeEmployeeId: text("assignee_employee_id").references(
    () => employees.id,
    { onDelete: "set null" },
  ),
  reviewerEmployeeId: text("reviewer_employee_id").references(
    () => employees.id,
    { onDelete: "set null" },
  ),

  title: text("title").notNull(),
  description: text("description"),
  output: text("output"),
  deadline: text("deadline"),

  status: text("status", {
    enum: [
      "pending_dispatch_approval",
      "assigned",
      "in_progress",
      "pending_review",
      "rejected",
      "approved",
      "cancelled",
    ],
  })
    .notNull()
    .default("assigned"),

  // a2a linkage — populate in V1.1 when agent-triggered.
  dispatchApprovalId: text("dispatch_approval_id").references(
    () => a2aMessages.id,
    { onDelete: "set null" },
  ),
  reviewApprovalId: text("review_approval_id").references(
    () => a2aMessages.id,
    { onDelete: "set null" },
  ),

  reviewRound: integer("review_round").notNull().default(0),
  reviewComment: text("review_comment"),

  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
})
