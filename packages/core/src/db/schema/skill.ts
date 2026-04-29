import { check, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { agents } from "./agent.ts";
import { departments, employees, organizations } from "./org.ts";

export interface SkillManifest {
  name: string;
  description: string;
  version: string;
  tools?: Array<{
    name: string;
    description: string;
    inputSchema: unknown;
  }>;
  files?: string[];
  tags?: string[];
}

// Skills follow the agentskills.io standard.
// Three-tier scope: company / department / personal.
// Priority on load: personal > department > company (resolved in
// skill/loader.ts with ROW_NUMBER PARTITION BY manifest_id).
export const skills = pgTable(
  "skills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),

    manifestId: text("manifest_id").notNull(), // e.g. "firefly-mesh/email-draft"
    version: text("version").notNull(), // SemVer
    manifest: jsonb("manifest").$type<SkillManifest>().notNull(),

    scope: text("scope", { enum: ["company", "department", "personal"] })
      .default("company")
      .notNull(),

    // scope-specific FK (CHECK constraint enforces correct combo)
    departmentId: uuid("department_id").references(() => departments.id, {
      onDelete: "cascade",
    }),
    ownerEmployeeId: uuid("owner_employee_id").references(() => employees.id, {
      onDelete: "cascade",
    }),

    status: text("status", { enum: ["active", "deprecated", "archived"] })
      .default("active")
      .notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    scopeCheck: check(
      "skill_scope_check",
      sql`(${table.scope} = 'company' AND ${table.departmentId} IS NULL AND ${table.ownerEmployeeId} IS NULL)
        OR (${table.scope} = 'department' AND ${table.departmentId} IS NOT NULL)
        OR (${table.scope} = 'personal' AND ${table.ownerEmployeeId} IS NOT NULL)`,
    ),
  }),
);

export const agentSkills = pgTable(
  "agent_skills",
  {
    agentId: uuid("agent_id")
      .references(() => agents.id, { onDelete: "cascade" })
      .notNull(),
    skillId: uuid("skill_id")
      .references(() => skills.id, { onDelete: "cascade" })
      .notNull(),
    enabled: text("enabled").default("true"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.agentId, table.skillId] }),
  }),
);
