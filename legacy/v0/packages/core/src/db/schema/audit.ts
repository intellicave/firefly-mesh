import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./org.ts";

// Append-only audit log.
// Database-level RULE in 19_constraints.sql blocks UPDATE / DELETE.
export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),

  actorType: text("actor_type", {
    enum: ["human", "agent", "system"],
  }).notNull(),
  actorId: text("actor_id"), // employee_id / agent_id / 'system'

  action: text("action").notNull(), // e.g. "task.dispatched", "a2a.send", "agent.activated"
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),

  payload: jsonb("payload"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});
