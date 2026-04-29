// POST /api/task/{id}/approve-dispatch — HITL point 1.
// Sender (creator employee) approves the LLM-proposed decomposition.
// Server then:
//   1) Creates one child task per subtask, routed to assignee via dispatcher.
//   2) Sends one a2a handoff message per assignee through broker.
//   3) Updates root task status='assigned' (or in_progress).

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import {
  agents,
  departmentMembers,
  departments,
  tasks,
} from "@firefly-mesh/core/db/schema";
import { sendMessage } from "@firefly-mesh/core/a2a/broker";
import { audit, logAction } from "@firefly-mesh/core/audit/log";
import { bus } from "@firefly-mesh/core/events/bus";
import { routeSubTasks, type SubTask } from "@firefly-mesh/core/task/dispatcher";

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
  /** Sender can edit the LLM proposal before approving. */
  adjustments: z
    .array(
      z.object({
        subtaskIndex: z.number().int().min(0),
        title: z.string().max(120).optional(),
        summary: z.string().max(500).optional(),
        targetEmployeeId: z.string().uuid().optional(),
        skip: z.boolean().optional(),
      }),
    )
    .optional(),
});

export const POST = withAuth(
  withOrgGuard(async (req: NextRequest, ctx) => {
    if (!isUserSession(ctx.session)) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Approve-dispatch requires user session (HITL point 1)",
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

    let body: z.infer<typeof Body> = {};
    try {
      const parsed = Body.safeParse(await req.json());
      if (parsed.success) body = parsed.data;
    } catch {
      // empty body is fine — accept LLM proposal as-is
    }

    const [rootTask] = await db
      .select({
        id: tasks.id,
        creatorEmployeeId: tasks.creatorEmployeeId,
        status: tasks.status,
        output: tasks.output,
      })
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.orgId, ctx.session.orgId)))
      .limit(1);

    if (!rootTask) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND" } },
        { status: 404 },
      );
    }

    // Only the creator (or admin/owner) can approve dispatch
    const isCreator = rootTask.creatorEmployeeId === ctx.session.employeeId;
    const isPrivileged =
      ctx.session.role === "owner" || ctx.session.role === "admin";
    if (!isCreator && !isPrivileged) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Only the task creator (or admin) may approve dispatch",
          },
        },
        { status: 403 },
      );
    }

    if (rootTask.status !== "pending_dispatch_approval") {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: `Task is not pending dispatch (status=${rootTask.status})`,
          },
        },
        { status: 409 },
      );
    }

    const stored = (rootTask.output ?? {}) as {
      decomposition?: SubTask[];
      deadline?: string | null;
    };
    const subtasks = stored.decomposition ?? [];
    if (subtasks.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "Stored decomposition is empty",
          },
        },
        { status: 409 },
      );
    }

    // Apply adjustments
    const adjMap = new Map(
      (body.adjustments ?? []).map((a) => [a.subtaskIndex, a]),
    );
    const finalSubtasks: SubTask[] = subtasks.map((s, idx) => {
      const adj = adjMap.get(idx);
      if (!adj) return s;
      return {
        ...s,
        title: adj.title ?? s.title,
        summary: adj.summary ?? s.summary,
      };
    });
    const skipIndices = new Set(
      (body.adjustments ?? [])
        .filter((a) => a.skip)
        .map((a) => a.subtaskIndex),
    );
    const activeSubtasks = finalSubtasks.filter(
      (_, idx) => !skipIndices.has(idx),
    );

    // Route to employees (uses dispatcher's algorithm; honors per-row override)
    const routed = await routeSubTasks(ctx.session.orgId, activeSubtasks);

    // Apply per-row override from adjustments
    for (let i = 0; i < routed.length; i++) {
      const adj = (body.adjustments ?? []).find(
        (a) => !a.skip && a.subtaskIndex === i,
      );
      if (adj?.targetEmployeeId) {
        routed[i] = {
          ...routed[i]!,
          assigneeEmployeeId: adj.targetEmployeeId,
        };
      }
    }

    // Find sender's active agent — we'll be the sender for handoff a2a messages
    const [senderAgent] = await db
      .select({ id: agents.id, publicKey: agents.publicKey })
      .from(agents)
      .where(
        and(
          eq(agents.ownerEmployeeId, rootTask.creatorEmployeeId),
          eq(agents.orgId, ctx.session.orgId),
          eq(agents.status, "active"),
        ),
      )
      .limit(1);

    // Persist + dispatch in a single transaction
    const result = await db.transaction(async (tx) => {
      // Create child tasks
      const created: Array<{
        id: string;
        title: string;
        assigneeEmployeeId: string | null;
      }> = [];

      for (const r of routed) {
        const inserted = await tx
          .insert(tasks)
          .values({
            orgId: ctx.session.orgId,
            parentId: id,
            rootId: id,
            creatorEmployeeId: rootTask.creatorEmployeeId,
            assigneeEmployeeId: r.assigneeEmployeeId,
            title: r.subtask.title,
            description: r.subtask.summary,
            status: r.assigneeEmployeeId ? "assigned" : "pending_dispatch_approval",
          })
          .returning({ id: tasks.id });

        const t = inserted[0];
        if (t) {
          created.push({
            id: t.id,
            title: r.subtask.title,
            assigneeEmployeeId: r.assigneeEmployeeId,
          });
        }
      }

      // Update root task to assigned
      await tx
        .update(tasks)
        .set({ status: "assigned", updatedAt: new Date() })
        .where(eq(tasks.id, id));

      return { created };
    });

    // Send A2A handoff messages outside the transaction (broker hits its own
    // tables + emits SSE — keep separate for clarity).
    let handoffsSent = 0;
    let handoffsSkipped = 0;
    if (senderAgent) {
      for (const child of result.created) {
        if (!child.assigneeEmployeeId) {
          handoffsSkipped++;
          continue;
        }
        const sent = await sendMessage({
          orgId: ctx.session.orgId,
          senderAgentId: senderAgent.id,
          senderEmployeeId: rootTask.creatorEmployeeId,
          senderSignature: "system_dispatch", // server-internal dispatch — bypass signature
          receiverEmployeeId: child.assigneeEmployeeId,
          type: "handoff",
          content: {
            summary: child.title,
            structured: {
              taskId: child.id,
              parentTaskId: id,
            },
          },
          relatedTaskId: child.id,
        });
        if (sent.ok) handoffsSent++;
        else handoffsSkipped++;
      }
    }

    await logAction({
      orgId: ctx.session.orgId,
      actorType: "human",
      actorId: ctx.session.userId,
      action: "task.dispatch_approved",
      resourceType: "task",
      resourceId: id,
      payload: {
        childCount: result.created.length,
        handoffsSent,
        handoffsSkipped,
      },
    });

    bus.publish(`audit.org.${ctx.session.orgId}`, "task.dispatched", {
      rootTaskId: id,
      childCount: result.created.length,
    });

    return NextResponse.json({
      data: {
        rootTaskId: id,
        children: result.created,
        handoffsSent,
        handoffsSkipped,
      },
    });
  }),
);

void audit;
