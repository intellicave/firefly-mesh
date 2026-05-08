// GET /api/knowledge — list documents in caller-visible scopes.

import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import {
  departmentMembers,
  knowledgeDocuments,
} from "@firefly-mesh/core/db/schema";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { isUserSession } from "@/lib/middleware/types";

const Query = z.object({
  scope: z.enum(["company", "department", "personal", "all"]).default("all"),
  deptId: z.string().uuid().optional(),
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const GET = withAuth(
  withOrgGuard(async (req: NextRequest, ctx) => {
    if (!isUserSession(ctx.session)) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN" } },
        { status: 403 },
      );
    }
    const parsed = Query.safeParse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", details: parsed.error.issues } },
        { status: 400 },
      );
    }
    const q = parsed.data;

    const empDepts = await db
      .select({ departmentId: departmentMembers.departmentId })
      .from(departmentMembers)
      .where(eq(departmentMembers.employeeId, ctx.session.employeeId));
    const myDepts = empDepts.map((r) => r.departmentId);

    const conditions = [eq(knowledgeDocuments.orgId, ctx.session.orgId)];
    if (q.cursor)
      conditions.push(lt(knowledgeDocuments.createdAt, new Date(q.cursor)));

    const isPrivileged =
      ctx.session.role === "owner" ||
      ctx.session.role === "admin" ||
      ctx.session.role === "auditor";

    if (q.scope === "company") {
      conditions.push(eq(knowledgeDocuments.scope, "company"));
    } else if (q.scope === "department") {
      if (q.deptId) {
        conditions.push(eq(knowledgeDocuments.departmentId, q.deptId));
        if (!isPrivileged && !myDepts.includes(q.deptId)) {
          return NextResponse.json(
            {
              error: {
                code: "FORBIDDEN",
                message: "Not a member of that department",
              },
            },
            { status: 403 },
          );
        }
      } else {
        conditions.push(eq(knowledgeDocuments.scope, "department"));
        if (!isPrivileged) {
          if (myDepts.length === 0) {
            return NextResponse.json({
              data: { documents: [], nextCursor: null },
            });
          }
          conditions.push(inArray(knowledgeDocuments.departmentId, myDepts));
        }
      }
    } else if (q.scope === "personal") {
      conditions.push(eq(knowledgeDocuments.scope, "personal"));
      conditions.push(
        eq(knowledgeDocuments.ownerEmployeeId, ctx.session.employeeId),
      );
    } else {
      // 'all' — three-tier OR
      const personalFilter = and(
        eq(knowledgeDocuments.scope, "personal"),
        eq(knowledgeDocuments.ownerEmployeeId, ctx.session.employeeId),
      );
      const companyFilter = eq(knowledgeDocuments.scope, "company");
      const deptFilter = isPrivileged
        ? eq(knowledgeDocuments.scope, "department")
        : myDepts.length > 0
          ? and(
              eq(knowledgeDocuments.scope, "department"),
              inArray(knowledgeDocuments.departmentId, myDepts),
            )
          : sql`1=0`;
      conditions.push(or(companyFilter, deptFilter, personalFilter)!);
    }

    const rows = await db
      .select()
      .from(knowledgeDocuments)
      .where(and(...conditions))
      .orderBy(desc(knowledgeDocuments.createdAt))
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const documents = rows.slice(0, q.limit);
    const nextCursor =
      hasMore && documents.length > 0
        ? documents[documents.length - 1]!.createdAt.toISOString()
        : null;

    return NextResponse.json({ data: { documents, nextCursor } });
  }),
);
