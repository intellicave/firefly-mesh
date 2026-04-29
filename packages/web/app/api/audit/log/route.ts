// GET /api/audit/log — generic audit log feed (V2-spec but useful in MVP
// for the /audit timeline view). RBAC: owner/admin/auditor see org-wide;
// employees see only entries actor=them.

import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import { auditLog } from "@firefly-mesh/core/db/schema";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { isUserSession } from "@/lib/middleware/types";

const Query = z.object({
  action: z.string().max(80).optional(),
  resourceType: z.string().max(40).optional(),
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
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

    const conditions = [eq(auditLog.orgId, ctx.session.orgId)];
    if (q.action) conditions.push(eq(auditLog.action, q.action));
    if (q.resourceType)
      conditions.push(eq(auditLog.resourceType, q.resourceType));
    if (q.cursor)
      conditions.push(lt(auditLog.createdAt, new Date(q.cursor)));

    const isPrivileged =
      ctx.session.role === "owner" ||
      ctx.session.role === "admin" ||
      ctx.session.role === "auditor";
    if (!isPrivileged) {
      conditions.push(
        sql`${auditLog.actorId} = ${ctx.session.employeeId}`,
      );
    }

    const rows = await db
      .select({
        id: auditLog.id,
        orgId: auditLog.orgId,
        actorType: auditLog.actorType,
        actorId: auditLog.actorId,
        action: auditLog.action,
        resourceType: auditLog.resourceType,
        resourceId: auditLog.resourceId,
        payload: auditLog.payload,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .where(and(...conditions))
      .orderBy(desc(auditLog.createdAt))
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = rows.slice(0, q.limit);
    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1]!.createdAt.toISOString()
        : null;

    return NextResponse.json({
      data: { entries: items, nextCursor },
    });
  }),
);
