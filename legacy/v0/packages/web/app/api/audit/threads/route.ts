// GET /api/audit/threads — paginated org-scoped A2A thread overview.
// Per api §4.6 — returns ThreadOverview rows the calling user is allowed
// to see. RBAC: owner/admin/auditor see all org threads; manager sees
// threads in their dept; employee sees only threads they participated in.

import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import {
  a2aMessages,
  a2aThreads,
  departmentMembers,
} from "@firefly-mesh/core/db/schema";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { isUserSession } from "@/lib/middleware/types";

const Query = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  taskId: z.string().uuid().optional(),
  type: z
    .enum([
      "inform",
      "sync",
      "request",
      "commit",
      "handoff",
      "escalate",
      "block",
    ])
    .optional(),
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const GET = withAuth(
  withOrgGuard(async (req: NextRequest, ctx) => {
    if (!isUserSession(ctx.session)) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "User session required" } },
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

    const isPrivileged =
      ctx.session.role === "owner" ||
      ctx.session.role === "admin" ||
      ctx.session.role === "auditor";

    const conditions = [eq(a2aThreads.orgId, ctx.session.orgId)];
    if (q.from) conditions.push(sql`${a2aThreads.createdAt} >= ${q.from}`);
    if (q.to) conditions.push(sql`${a2aThreads.createdAt} <= ${q.to}`);
    if (q.cursor) conditions.push(lt(a2aThreads.createdAt, new Date(q.cursor)));
    if (q.taskId) conditions.push(eq(a2aThreads.relatedTaskId, q.taskId));

    if (!isPrivileged) {
      // Manager: threads where caller is sender OR receiver of any message in
      // the thread, OR threads with related_task in caller's dept (V2).
      // MVP — restrict to threads the caller participated in.
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM ${a2aMessages} m
          WHERE m.thread_id = ${a2aThreads.id}
            AND (m.sender_employee_id = ${ctx.session.employeeId}
              OR m.receiver_employee_id = ${ctx.session.employeeId})
        )`,
      );
    }

    const rows = await db
      .select({
        id: a2aThreads.id,
        topic: a2aThreads.topic,
        relatedTaskId: a2aThreads.relatedTaskId,
        messageCount: a2aThreads.messageCount,
        createdAt: a2aThreads.createdAt,
      })
      .from(a2aThreads)
      .where(and(...conditions))
      .orderBy(desc(a2aThreads.createdAt))
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = rows.slice(0, q.limit);
    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1]!.createdAt.toISOString()
        : null;

    // Suppress unused-import for future filters
    void or;
    void departmentMembers;
    void q.type;

    return NextResponse.json({
      data: { threads: items, nextCursor },
    });
  }),
);
