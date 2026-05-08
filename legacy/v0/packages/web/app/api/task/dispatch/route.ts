// POST /api/task/dispatch — agent submits a high-level task description.
// Server calls LLM to decompose into subtasks, stores root task with
// status='pending_dispatch_approval'. The actual sub-task creation
// + a2a handoff happens at /approve-dispatch (HITL point 1).
// Per api §4.4 + plan §M5-1.

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import { departments, tasks } from "@firefly-mesh/core/db/schema";
import { decomposeTask } from "@firefly-mesh/core/task/dispatcher";
import { audit } from "@firefly-mesh/core/audit/log";
import { bus } from "@firefly-mesh/core/events/bus";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { withScope } from "@/lib/middleware/withScope";
import { isAgentSession } from "@/lib/middleware/types";
import type { Handler, BaseContext } from "@/lib/middleware/types";

const Body = z.object({
  description: z.string().min(10).max(2000),
  deadline: z.string().datetime().optional(),
  priorityHint: z.enum(["low", "normal", "high"]).optional(),
  rootTaskId: z.string().uuid().optional(), // nested task case (V2 — currently unused)
});

const handler: Handler = async (req, ctx) => {
  if (!isAgentSession(ctx.session)) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "Task dispatch requires Bearer agent token",
        },
      },
      { status: 403 },
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

  // Fetch org's departments for LLM context
  const deptRows = await db
    .select({ name: departments.name })
    .from(departments)
    .where(eq(departments.orgId, ctx.session.orgId));

  // LLM decomposition — 3-retry inside helper, no silent fallback
  let decomposition;
  try {
    decomposition = await decomposeTask({
      description: parsed.data.description,
      deadline: parsed.data.deadline,
      priorityHint: parsed.data.priorityHint,
      availableDepartments: deptRows.map((d) => d.name),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "LLM_DECOMPOSITION_FAILED",
          message:
            err instanceof Error
              ? err.message
              : "LLM decomposition failed after retries",
        },
      },
      { status: 422 },
    );
  }

  // Persist root task with decomposition stored in output (await sender approval)
  const [created] = await db
    .insert(tasks)
    .values({
      orgId: ctx.session.orgId,
      creatorEmployeeId: ctx.session.employeeId,
      title: parsed.data.description.slice(0, 120),
      description: parsed.data.description,
      status: "pending_dispatch_approval",
      output: {
        decomposition: decomposition.subtasks,
        priorityHint: parsed.data.priorityHint ?? "normal",
        deadline: parsed.data.deadline ?? null,
      },
    })
    .returning({ id: tasks.id });

  if (!created) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR" } },
      { status: 500 },
    );
  }

  // Set rootId = self for top-level dispatch
  await db
    .update(tasks)
    .set({ rootId: created.id })
    .where(eq(tasks.id, created.id));

  await audit.task.dispatched(ctx.session.orgId, ctx.session.employeeId, created.id, {
    description: parsed.data.description.slice(0, 200),
    subtaskCount: decomposition.subtasks.length,
  });

  // Notify creator's web inbox: "1 task pending your dispatch approval"
  bus.publish(`inbox.${ctx.session.employeeId}`, "task.dispatch_pending_approval", {
    taskId: created.id,
  });

  return NextResponse.json({
    data: {
      rootTaskId: created.id,
      pendingApprovalId: created.id, // task itself is the approval handle
      decomposition: decomposition.subtasks,
    },
  });
};

export const POST = withAuth(
  withOrgGuard(withScope("dispatch_task")(handler)),
);

// keep BaseContext import live for future composition
void ({} as BaseContext);
