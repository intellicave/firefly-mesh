import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { agents } from "./agent.ts";
import { employees, organizations } from "./org.ts";

// One-time access token issued by admin, consumed by agent during activate.
// Plain token returned only at creation; only SHA-256 hash is stored.
export const agentTokens = pgTable("agent_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  employeeId: uuid("employee_id")
    .references(() => employees.id, { onDelete: "cascade" })
    .notNull(),

  tokenHash: text("token_hash").notNull(), // SHA-256 hash of plain token
  agentId: uuid("agent_id").references(() => agents.id, {
    onDelete: "set null",
  }),

  status: text("status", {
    enum: ["pending", "consumed", "revoked", "expired"],
  })
    .default("pending")
    .notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: uuid("created_by").references(() => employees.id),
});
