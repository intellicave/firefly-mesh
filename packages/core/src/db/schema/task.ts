import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { employees, organizations } from "./org.ts";

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),

  // Goal ancestry — borrowed from Paperclip's design
  parentId: uuid("parent_id"),
  rootId: uuid("root_id"),

  creatorEmployeeId: uuid("creator_employee_id")
    .references(() => employees.id)
    .notNull(),
  assigneeEmployeeId: uuid("assignee_employee_id").references(
    () => employees.id,
  ),
  reviewerEmployeeId: uuid("reviewer_employee_id").references(
    () => employees.id,
  ),

  title: text("title").notNull(),
  description: text("description"),
  output: jsonb("output"),

  status: text("status", {
    enum: [
      "pending_dispatch_approval", // CEO submitted, waiting for own approval before routing
      "assigned",
      "in_progress",
      "pending_review", // employee submitted, waiting reviewer
      "rejected",
      "approved",
      "cancelled",
    ],
  })
    .default("assigned")
    .notNull(),

  dispatchApprovalId: uuid("dispatch_approval_id"),
  reviewApprovalId: uuid("review_approval_id"),

  reviewRound: text("review_round").default("0"),
  reviewComment: text("review_comment"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
