// Skill loader — Personal > Department > Company precedence merge.
// Per design §6.5 + plan M8-3.
//
// Returns the effective skill list for an employee:
//   For each manifest_id, pick the highest-priority scope that has a row.
//   Conflicts (same manifest_id at multiple scopes) get hidden — their
//   IDs are returned in `conflictResolved.hiddenSkillIds` so the UI can
//   surface them.

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "../db/index.ts";
import {
  agentSkills,
  departmentMembers,
  skills,
} from "../db/schema/index.ts";
import type { SkillManifest } from "../db/schema/skill.ts";

export interface LoadedSkill {
  id: string;
  manifestId: string;
  version: string;
  scope: "company" | "department" | "personal";
  manifest: SkillManifest;
  conflictResolved?: {
    winnerScope: "company" | "department" | "personal";
    hiddenSkillIds: string[];
  };
}

/**
 * Resolve effective skills for an employee.
 * Returns merged list + a stable cacheKey computed over included rows.
 */
export async function loadSkillsForEmployee(opts: {
  orgId: string;
  employeeId: string;
}): Promise<{ skills: LoadedSkill[]; cacheKey: string }> {
  // Find the employee's department list
  const deptRows = await db
    .select({ departmentId: departmentMembers.departmentId })
    .from(departmentMembers)
    .where(eq(departmentMembers.employeeId, opts.employeeId));
  const empDepts = deptRows.map((r) => r.departmentId);

  // Single pass: company OR (department AND in empDepts) OR (personal AND ownerEmployeeId === me)
  const conditions = [
    eq(skills.orgId, opts.orgId),
    eq(skills.status, "active"),
  ];

  const orFilters: Array<ReturnType<typeof sql>> = [];
  orFilters.push(sql`(${skills.scope} = 'company')`);
  if (empDepts.length > 0) {
    orFilters.push(
      sql`(${skills.scope} = 'department' AND ${inArray(skills.departmentId, empDepts)})`,
    );
  }
  orFilters.push(
    sql`(${skills.scope} = 'personal' AND ${skills.ownerEmployeeId} = ${opts.employeeId})`,
  );

  const orFilter = orFilters.reduce<ReturnType<typeof sql> | null>(
    (acc, cur) => (acc ? sql`${acc} OR ${cur}` : cur),
    null,
  );

  const rows = await db
    .select({
      id: skills.id,
      manifestId: skills.manifestId,
      version: skills.version,
      scope: skills.scope,
      manifest: skills.manifest,
    })
    .from(skills)
    .where(and(...conditions, sql`(${orFilter})`));

  // Group by manifestId, pick highest priority
  const PRIORITY = { personal: 3, department: 2, company: 1 } as const;
  const byManifest = new Map<
    string,
    { winner: (typeof rows)[number]; hidden: string[] }
  >();
  for (const r of rows) {
    const cur = byManifest.get(r.manifestId);
    if (!cur) {
      byManifest.set(r.manifestId, { winner: r, hidden: [] });
      continue;
    }
    const curScope = cur.winner.scope as keyof typeof PRIORITY;
    const newScope = r.scope as keyof typeof PRIORITY;
    if (PRIORITY[newScope] > PRIORITY[curScope]) {
      cur.hidden.push(cur.winner.id);
      cur.winner = r;
    } else {
      cur.hidden.push(r.id);
    }
  }

  const merged: LoadedSkill[] = Array.from(byManifest.values()).map(
    ({ winner, hidden }) => ({
      id: winner.id,
      manifestId: winner.manifestId,
      version: winner.version,
      scope: winner.scope as LoadedSkill["scope"],
      manifest: winner.manifest as SkillManifest,
      ...(hidden.length > 0
        ? {
            conflictResolved: {
              winnerScope: winner.scope as LoadedSkill["scope"],
              hiddenSkillIds: hidden,
            },
          }
        : {}),
    }),
  );

  const cacheKey = computeCacheKey(merged);
  return { skills: merged, cacheKey };
}

function computeCacheKey(rows: LoadedSkill[]): string {
  // Stable join of (id, version) — sorted lexicographically.
  const parts = rows
    .map((r) => `${r.id}:${r.version}`)
    .sort()
    .join("|");
  // Tiny FNV-1a hash → hex for cache invalidation comparison.
  let h = 0x811c9dc5;
  for (let i = 0; i < parts.length; i++) {
    h ^= parts.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

void agentSkills;
