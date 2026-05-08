import { jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

import { agents } from "./agent.ts";

// Per-agent JWT scope catalog. Server-side enforcement via withScope middleware.
// Scope strings come from packages/core/boundary/catalog.ts.
export const representationBoundaries = pgTable("representation_boundaries", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentId: uuid("agent_id")
    .references(() => agents.id, { onDelete: "cascade" })
    .notNull(),
  scopes: jsonb("scopes").$type<string[]>().default([]).notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
