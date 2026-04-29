// POST /api/task/{id}/submit — assignee (or their agent) submits work output.
// Transitions task to pending_review. HITL point 2: human acknowledged
// completion via this endpoint (R9 — agent can't auto-mark done; agent
// calls this on the employee's behalf with submit_task scope).

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import { tasks } from "@firefly-mesh/core/db/schema";
import { audit } from "@firefly-mesh/core/audit/log";
import { bus } from "@firefly-mesh/core/events/bus";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { withScope } from "@/lib/middleware/withScope";
import { isAgentSession, isUserSession } from "@/lib/middleware/types";
import type { Handler, BaseContext } from "@/lib/middleware/types";

function parseId(req: NextRequest): string | null {
  const segs = req.nextUrl.pathname.split("/");
  const id = segs[segs.length - 2];
  if (!id || !z.string().uuid().safeParse(id).success) return null;
  return id;
}

const Body = z.object({
  output: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
});

const handler: Handler = async (req, ctx) => {
  const id = parseId(req);
  if (!id) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR" } },
      { status: 400 },
    );
  }

  let parsedOutput: unknown;
  try {
    const parsed = Body.safeParse(await req.json());
    if (parsed.success) parsedOutput = parsed.data.output;
  } catch {
    // empty body is OK
  }

  const [task] = await db
    .select({
      id: tasks.id,
      assigneeEmployeeId: tasks.assigneeEmployeeId,
      reviewerEmployeeId: tasks.reviewerEmployeeId,
      status: tasks.status,
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

  // Authorization: assignee employee (user session) OR agent owned by assignee
  const sessionEmpId = isUserSession(ctx.session) || isAgentSession(ctx.session)
    ? ctx.session.employeeId
    : null;
  if (!sessionEmpId || task.assigneeEmployeeId !== sessionEmpId) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Only the assignee can submit" } },
      { status: 403 },
    );
  }

  // State precondition: only allow submit from assigned/in_progress/rejected
  const allowed: Array<typeof task.status> = ["assigned", "in_progress", "rejected"];
  if (!allowed.includes(task.status)) {
    return NextResponse.json(
      {
        error: {
          code: "CONFLICT",
          message: `Cannot submit from status '${task.status}'`,
        },
      },
      { status: 409 },
    );
  }

  await db
    .update(tasks)
    .set({
      output: parsedOutput as Record<string, unknown> | undefined,
      status: "pending_review",
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, id));

  await audit.task.submitted(ctx.session.orgId, sessionEmpId, id);

  // Notify reviewer's inbox
  if (task.reviewerEmployeeId) {
    bus.publish(`inbox.${task.reviewerEmployeeId}`, "task.review_requested", {
      taskId: id,
    });
  }

  return NextResponse.json({ data: { id, status: "pending_review" } });
};

// Apply withScope only when called by an agent (Bearer JWT). User-session
// callers don't need scope check — they're submitting as the assignee.
export const POST = withAuth(
  withOrgGuard(async (req, ctx: BaseContext) => {
    if (isAgentSession(ctx.session)) {
      // re-wrap with withScope at agent path
      return withScope("submit_task")(handler)(req, ctx);
    }
    return handler(req, ctx);
  }),
);
