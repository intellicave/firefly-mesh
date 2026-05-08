import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { employees, organizations } from "./org.ts";

export const agents = pgTable("agents", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  ownerEmployeeId: uuid("owner_employee_id")
    .references(() => employees.id, { onDelete: "cascade" })
    .notNull(),

  // BYO-agent: server stores only metadata, runtime lives client-side
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
    .default("unknown")
    .notNull(),
  runtimeMeta: jsonb("runtime_meta")
    .$type<{
      version?: string;
      protocolVersion?: string;
      skillManifestVersion?: string;
    }>()
    .default({}),

  // ed25519 public key (base64), registered at activate-time for A2A signature verify
  publicKey: text("public_key"),

  status: text("status", { enum: ["inactive", "active", "archived"] })
    .default("inactive")
    .notNull(),
  lastSeenAt: timestamp("last_seen_at"),
  activatedAt: timestamp("activated_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
