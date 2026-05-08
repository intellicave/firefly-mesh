// POST /api/task/{id}/review — reviewer approves or rejects (HITL point 3).
// Transitions pending_review → approved | rejected.
// On reject: reviewRound++, status='rejected' (assignee can resubmit).

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import { tasks } from "@firefly-mesh/core/db/schema";
import { audit, logAction } from "@firefly-mesh/core/audit/log";
import { bus } from "@firefly-mesh/core/events/bus";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { isUserSession } from "@/lib/middleware/types";

function parseId(req: NextRequest): string | null {
  const segs = req.nextUrl.pathname.split("/");
  const id = segs[segs.length - 2];
  if (!id || !z.string().uuid().safeParse(id).success) return null;
  return id;
}

const Body = z.object({
  decision: z.enum(["approved", "rejected"]),
  comment: z.string().max(2000).optional(),
});

export const POST = withAuth(
  withOrgGuard(async (req: NextRequest, ctx) => {
    if (!isUserSession(ctx.session)) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Review requires user session",
          },
        },
        { status: 403 },
      );
    }

    const id = parseId(req);
    if (!id) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR" } },
        { status: 400 },
      );
    }

    const parsed = Body.safeParse(await req.json());
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

    const [task] = await db
      .select({
        id: tasks.id,
        reviewerEmployeeId: tasks.reviewerEmployeeId,
        assigneeEmployeeId: tasks.assigneeEmployeeId,
        creatorEmployeeId: tasks.creatorEmployeeId,
        status: tasks.status,
        reviewRound: tasks.reviewRound,
      })
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.orgId, ctx.session.orgId)))
      .limit(1);

    if (!task) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND" } },
        { status: 404 },
      );
    }

    // RBAC: only the assigned reviewer (or admin/owner) can review
    const isReviewer = task.reviewerEmployeeId === ctx.session.employeeId;
    const isPrivileged =
      ctx.session.role === "owner" || ctx.session.role === "admin";
    if (!isReviewer && !isPrivileged) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Only the assigned reviewer (or admin) may review",
          },
        },
        { status: 403 },
      );
    }

    if (task.status !== "pending_review") {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: `Cannot review from status '${task.status}'`,
          },
        },
        { status: 409 },
      );
    }

    const newRound =
      parsed.data.decision === "rejected"
        ? String((Number(task.reviewRound ?? "0") || 0) + 1)
        : task.reviewRound;

    await db
      .update(tasks)
      .set({
        status: parsed.data.decision,
        reviewRound: newRound,
        reviewComment: parsed.data.comment,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id));

    await audit.task.reviewed(
      ctx.session.orgId,
      ctx.session.employeeId,
      id,
      parsed.data.decision,
    );

    if (parsed.data.comment) {
      await logAction({
        orgId: ctx.session.orgId,
        actorType: "human",
        actorId: ctx.session.employeeId,
        action: "task.review_comment",
        resourceType: "task",
        resourceId: id,
        payload: { comment: parsed.data.comment },
      });
    }

    // Notify assignee + creator
    if (task.assigneeEmployeeId) {
      bus.publish(
        `inbox.${task.assigneeEmployeeId}`,
        parsed.data.decision === "approved"
          ? "task.approved"
          : "task.rejected",
        { taskId: id, comment: parsed.data.comment },
      );
    }
    if (
      task.creatorEmployeeId &&
      task.creatorEmployeeId !== task.assigneeEmployeeId
    ) {
      bus.publish(`inbox.${task.creatorEmployeeId}`, "task.reviewed", {
        taskId: id,
        decision: parsed.data.decision,
      });
    }

    return NextResponse.json({
      data: {
        id,
        status: parsed.data.decision,
        reviewRound: newRound,
      },
    });
  }),
);
