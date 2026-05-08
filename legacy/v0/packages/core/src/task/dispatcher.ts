// Task dispatcher (M5-1).
// LLM-based decomposition of high-level tasks into actionable subtasks
// that can be routed to employees by department/role.

import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db/index.ts";
import {
  departmentMembers,
  departments,
  employees,
} from "../db/schema/index.ts";
import { generateObjectHelper } from "../llm/helper.ts";

export const SubTaskSchema = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(500),
  targetDept: z.string().nullable().optional(),
  targetRole: z
    .enum(["owner", "admin", "manager", "employee"])
    .nullable()
    .optional(),
  estimatedHours: z.number().min(0.25).max(160).nullable().optional(),
  deadlineOffsetDays: z.number().int().min(1).max(60).nullable().optional(),
});

export const DecompositionSchema = z.object({
  subtasks: z.array(SubTaskSchema).min(1).max(20),
});

export type SubTask = z.infer<typeof SubTaskSchema>;
export type Decomposition = z.infer<typeof DecompositionSchema>;

interface DecomposeOpts {
  description: string;
  deadline?: string; // ISO timestamp
  priorityHint?: "low" | "normal" | "high";
  availableDepartments: string[];
}

/**
 * Decompose high-level task description into 2-7 actionable subtasks.
 * Calls LLM via AI Gateway (no ToolLoopAgent — R7).
 * Throws on 3-retry failure (handled by AI Gateway internally).
 */
export async function decomposeTask(
  opts: DecomposeOpts,
): Promise<Decomposition> {
  const prompt = [
    `You are a task decomposer for a multi-agent organizational platform.`,
    `A CEO or manager has submitted this high-level task:`,
    ``,
    `>>> ${opts.description}`,
    ``,
    opts.deadline ? `Deadline: ${opts.deadline}` : "",
    opts.priorityHint ? `Priority: ${opts.priorityHint}` : "",
    ``,
    `Available departments in this organization:`,
    opts.availableDepartments.length > 0
      ? opts.availableDepartments.map((d) => `  - ${d}`).join("\n")
      : "  (no departments configured yet — leave targetDept null)",
    ``,
    `Available roles: owner, admin, manager, employee.`,
    ``,
    `Decompose into 2 to 7 actionable subtasks. Each subtask MUST:`,
    `  - Have a clear, action-oriented title (≤ 120 chars)`,
    `  - Have a summary that explains the goal (1-3 sentences, ≤ 500 chars)`,
    `  - Specify EITHER targetDept (must be from the list above)`,
    `    OR targetRole (one of: owner / admin / manager / employee)`,
    `    or both (more specific routing).`,
    `  - Optional: estimatedHours (work effort in hours)`,
    `  - Optional: deadlineOffsetDays (days from today this subtask is due)`,
    ``,
    `Return JSON matching the schema. Subtasks should not overlap; together`,
    `they should cover the original task.`,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await generateObjectHelper(prompt, DecompositionSchema, {
    maxRetries: 3,
  });
  return result.object;
}

interface RouteResolution {
  subtask: SubTask;
  /** Resolved assignee. null when no matching employee exists in the org. */
  assigneeEmployeeId: string | null;
  resolvedDepartmentId: string | null;
}

/**
 * Match a subtask to an employee in the org based on targetDept/targetRole.
 * Returns null assignee when no match — caller decides what to do
 * (escalate to admin, leave unassigned for manual claim, etc).
 */
export async function routeSubTasks(
  orgId: string,
  subtasks: SubTask[],
): Promise<RouteResolution[]> {
  const deptRows = await db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(eq(departments.orgId, orgId));
  const deptByName = new Map(
    deptRows.map((d) => [d.name.toLowerCase(), d.id] as const),
  );

  const out: RouteResolution[] = [];

  for (const subtask of subtasks) {
    const targetDeptName = subtask.targetDept?.toLowerCase();
    const targetDeptId = targetDeptName ? deptByName.get(targetDeptName) : null;

    // Build employee filter
    const filters = [eq(employees.orgId, orgId), eq(employees.status, "active")];
    if (subtask.targetRole) {
      filters.push(eq(employees.role, subtask.targetRole));
    }

    let candidates: Array<{ id: string }>;

    if (targetDeptId) {
      candidates = await db
        .select({ id: employees.id })
        .from(employees)
        .innerJoin(
          departmentMembers,
          eq(departmentMembers.employeeId, employees.id),
        )
        .where(
          and(...filters, eq(departmentMembers.departmentId, targetDeptId)),
        )
        .limit(1);
    } else {
      candidates = await db
        .select({ id: employees.id })
        .from(employees)
        .where(and(...filters))
        .limit(1);
    }

    out.push({
      subtask,
      assigneeEmployeeId: candidates[0]?.id ?? null,
      resolvedDepartmentId: targetDeptId ?? null,
    });
  }

  return out;
}

// Suppress unused-import warnings for things kept for future expansion.
void inArray;
void sql;
