// Three-tier RAG search: Personal > Department > Company precedence applied.
// Per design §6.5 + plan M7-5 — single-query SQL with scope OR filter.
// Cross-org and cross-dept access is blocked by the SQL itself (no
// post-filter — keeps the SQL surface tight for Aurora-style autz audit).

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "../db/index.ts";
import {
  departmentMembers,
  knowledgeChunks,
  knowledgeDocuments,
} from "../db/schema/index.ts";

import { embedQuery } from "./embed.ts";

export interface SearchOpts {
  orgId: string;
  employeeId: string;
  /** auditor role bypasses dept membership check. */
  auditorOverride?: boolean;
  query: string;
  topK?: number;
  /** When set, restrict to single scope. Default: all (3-tier OR). */
  scope?: "company" | "department" | "personal" | "all";
}

export interface SearchHit {
  id: string;
  documentId: string;
  text: string;
  scope: "company" | "department" | "personal";
  score: number;
  source?: { title?: string };
}

export async function searchKnowledge(
  opts: SearchOpts,
): Promise<SearchHit[]> {
  const topK = Math.min(Math.max(opts.topK ?? 5, 1), 20);

  // Resolve caller's department list (manager+ may match by membership)
  const deptRows = await db
    .select({ departmentId: departmentMembers.departmentId })
    .from(departmentMembers)
    .where(eq(departmentMembers.employeeId, opts.employeeId));
  const empDepts = deptRows.map((r) => r.departmentId);

  const queryVector = await embedQuery(opts.query);
  const vectorLiteral = `[${queryVector.join(",")}]`;

  // Build scope OR filter:
  //   company         — orgId === ours AND scope='company'
  //   department      — scope='department' AND department_id IN empDepts (auditor bypass)
  //   personal        — scope='personal' AND owner_employee_id === me
  const scopeFilters: ReturnType<typeof sql>[] = [];

  if (opts.scope === undefined || opts.scope === "all" || opts.scope === "company") {
    scopeFilters.push(sql`(${knowledgeChunks.scope} = 'company')`);
  }
  if (opts.scope === undefined || opts.scope === "all" || opts.scope === "department") {
    if (opts.auditorOverride) {
      scopeFilters.push(sql`(${knowledgeChunks.scope} = 'department')`);
    } else if (empDepts.length > 0) {
      scopeFilters.push(
        sql`(${knowledgeChunks.scope} = 'department' AND ${inArray(
          knowledgeChunks.departmentId,
          empDepts,
        )})`,
      );
    }
  }
  if (opts.scope === undefined || opts.scope === "all" || opts.scope === "personal") {
    scopeFilters.push(
      sql`(${knowledgeChunks.scope} = 'personal' AND ${knowledgeChunks.ownerEmployeeId} = ${opts.employeeId})`,
    );
  }

  if (scopeFilters.length === 0) return [];

  const orFilter = scopeFilters.reduce<ReturnType<typeof sql> | null>(
    (acc, cur) => (acc ? sql`${acc} OR ${cur}` : cur),
    null,
  );

  const rows = await db
    .select({
      id: knowledgeChunks.id,
      documentId: knowledgeChunks.documentId,
      content: knowledgeChunks.content,
      scope: knowledgeChunks.scope,
      title: knowledgeDocuments.title,
      distance: sql<number>`${knowledgeChunks.embedding} <=> ${vectorLiteral}::vector`,
    })
    .from(knowledgeChunks)
    .innerJoin(
      knowledgeDocuments,
      eq(knowledgeDocuments.id, knowledgeChunks.documentId),
    )
    .where(
      and(
        eq(knowledgeChunks.orgId, opts.orgId),
        sql`(${orFilter})`,
      ),
    )
    .orderBy(sql`${knowledgeChunks.embedding} <=> ${vectorLiteral}::vector`)
    .limit(topK);

  return rows.map((r) => ({
    id: r.id,
    documentId: r.documentId,
    text: r.content,
    scope: r.scope as SearchHit["scope"],
    score: 1 - r.distance, // cosine distance → similarity (rough)
    source: { title: r.title },
  }));
}
