import { and, eq } from "drizzle-orm"
import * as schema from "../db/schema.ts"
import type { DrizzleD1 } from "../db/connect.ts"

export type ProjectStatus = "planning" | "active" | "done" | "archived"

const VALID_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  planning: ["active", "archived"],
  active: ["done", "archived"],
  done: ["archived"],
  // Terminal — only DELETE can remove an archived project.
  archived: [],
}

export class InvalidProjectTransitionError extends Error {
  constructor(from: ProjectStatus, to: ProjectStatus) {
    super(`Invalid project status transition: ${from} → ${to}`)
  }
}

/**
 * Returns true if the status transition is valid per the state machine.
 * Throws InvalidProjectTransitionError otherwise.
 *
 * Allowed transitions:
 *   planning → active | archived
 *   active   → done | archived
 *   done     → archived
 *   archived → (none — use DELETE)
 */
export function assertValidProjectTransition(
  from: ProjectStatus,
  to: ProjectStatus,
): void {
  if (from === to) return // no-op accepted at lib level; caller decides
  const valid = VALID_TRANSITIONS[from]
  if (!valid.includes(to)) {
    throw new InvalidProjectTransitionError(from, to)
  }
}

/**
 * Returns true if the given employee has role 'lead' in the given project.
 */
export async function isProjectLead(
  db: DrizzleD1,
  projectId: string,
  employeeId: string,
): Promise<boolean> {
  const rows = await db
    .select({ role: schema.projectMembers.role })
    .from(schema.projectMembers)
    .where(
      and(
        eq(schema.projectMembers.projectId, projectId),
        eq(schema.projectMembers.employeeId, employeeId),
      ),
    )
  return rows.some((r) => r.role === "lead")
}
