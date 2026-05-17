// GET /api/task/list?status=...&assigneeEmployeeId=... — task queue.
// Used by:
// - agent skill (firefly.task.list) to fetch its assignee tasks
// - web UI (Inbox / dashboard) to show "my tasks"

import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import { tasks } from "@firefly-mesh/core/db/schema";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { isUserSession } from "@/lib/middleware/types";

const Query = z.object({
  status: z
    .enum([
      "pending_dispatch_approval",
      "assigned",
      "in_progress",
      "pending_review",
      "rejected",
      "approved",
      "cancelled",
    ])
    .optional(),
  assigneeEmployeeId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const GET = withAuth(
  withOrgGuard(async (req: NextRequest, ctx) => {
    const parsed = Query.safeParse({
      status: req.nextUrl.searchParams.get("status") ?? undefined,
      assigneeEmployeeId:
        req.nextUrl.searchParams.get("assigneeEmployeeId") ?? undefined,
      limit: req.nextUrl.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            details: parsed.error.issues,
          },
        },
        { status: 400 },
      );
    }

    const filters = [eq(tasks.orgId, ctx.session.orgId)];

    if (parsed.data.status) {
      filters.push(eq(tasks.status, parsed.data.status));
    }

    // Default scoping:
    // - User session: if no assigneeEmployeeId given, return tasks where
    //   I'm assignee OR reviewer (admin/owner can omit filter to see all)
    // - Agent session: hard-scope to agent's owner employee
    if (parsed.data.assigneeEmployeeId) {
      filters.push(
        eq(tasks.assigneeEmployeeId, parsed.data.assigneeEmployeeId),
      );
    } else if (isUserSession(ctx.session)) {
      const role = ctx.session.role;
      if (role !== "owner" && role !== "admin" && role !== "auditor") {
        filters.push(eq(tasks.assigneeEmployeeId, ctx.session.employeeId));
      }
    } else {
      // agent session — strict assignee filter
      filters.push(eq(tasks.assigneeEmployeeId, ctx.session.employeeId));
    }

    const rows = await db
      .select()
      .from(tasks)
      .where(and(...filters))
      .orderBy(desc(tasks.updatedAt))
      .limit(parsed.data.limit);

    return NextResponse.json({ data: rows });
  }),
);
