import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { agents } from "./agent.ts";
import { employees, organizations } from "./org.ts";
import { tasks } from "./task.ts";

export const a2aThreads = pgTable("a2a_threads", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  topic: text("topic"),
  relatedTaskId: uuid("related_task_id").references(() => tasks.id),
  messageCount: text("message_count").default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const a2aMessages = pgTable("a2a_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  threadId: uuid("thread_id")
    .references(() => a2aThreads.id, { onDelete: "cascade" })
    .notNull(),
  replyToMessageId: uuid("reply_to_message_id"),

  // Sender / receiver identity
  senderAgentId: uuid("sender_agent_id")
    .references(() => agents.id)
    .notNull(),
  senderEmployeeId: uuid("sender_employee_id")
    .references(() => employees.id)
    .notNull(),
  senderSignature: text("sender_signature").notNull(),

  receiverAgentId: uuid("receiver_agent_id")
    .references(() => agents.id)
    .notNull(),
  receiverEmployeeId: uuid("receiver_employee_id")
    .references(() => employees.id)
    .notNull(),

  // Google A2A v1.2 — 7 message types
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

  content: jsonb("content")
    .$type<{
      summary: string;
      body?: string;
      structured?: Record<string, unknown>;
    }>()
    .notNull(),

  // HITL bidirectional state machine
  senderApprovalRequired: text("sender_approval_required").default("false"),
  senderApprovalStatus: text("sender_approval_status", {
    enum: ["pending", "approved", "rejected", "auto"],
  }).default("auto"),
  senderApprovalBy: uuid("sender_approval_by").references(() => employees.id),
  senderApprovalAt: timestamp("sender_approval_at"),

  receiverActionRequired: text("receiver_action_required").default("false"),
  receiverActionStatus: text("receiver_action_status", {
    enum: ["pending", "accepted", "rejected", "auto"],
  }).default("auto"),
  receiverActionBy: uuid("receiver_action_by").references(() => employees.id),
  receiverActionAt: timestamp("receiver_action_at"),

  relatedTaskId: uuid("related_task_id").references(() => tasks.id),

  confidenceScore: text("confidence_score"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
