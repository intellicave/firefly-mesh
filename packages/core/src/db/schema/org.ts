import { pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth.ts";

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const employees = pgTable("employees", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Better Auth user.id is text (cuid). Nullable allows account_mode='none'.
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  orgId: uuid("org_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  title: text("title"),
  avatarUrl: text("avatar_url"),
  status: text("status", { enum: ["active", "archived"] })
    .default("active")
    .notNull(),
  role: text("role", {
    enum: ["owner", "admin", "manager", "employee", "auditor"],
  })
    .default("employee")
    .notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const departments = pgTable("departments", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  parentId: uuid("parent_id"),
  name: text("name").notNull(),
  description: text("description"),
});

export const departmentMembers = pgTable(
  "department_members",
  {
    departmentId: uuid("department_id")
      .references(() => departments.id, { onDelete: "cascade" })
      .notNull(),
    employeeId: uuid("employee_id")
      .references(() => employees.id, { onDelete: "cascade" })
      .notNull(),
    role: text("role", { enum: ["head", "member"] }).default("member"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.departmentId, table.employeeId] }),
  }),
);

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status", {
    enum: ["planning", "active", "done", "archived"],
  }).default("planning"),
  startAt: timestamp("start_at"),
  endAt: timestamp("end_at"),
});

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    employeeId: uuid("employee_id")
      .references(() => employees.id, { onDelete: "cascade" })
      .notNull(),
    role: text("role"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.projectId, table.employeeId] }),
  }),
);
