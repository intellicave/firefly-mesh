// GET /api/a2a/inbox?tab=approve|action — list pending HITL items.
//
// tab=approve: messages where sender = me, senderApprovalStatus=pending
// tab=action:  messages where receiver = me, receiverActionStatus=pending
//              + tasks where reviewer = me, status=pending_review

import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import { a2aMessages, employees, tasks } from "@firefly-mesh/core/db/schema";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { isUserSession } from "@/lib/middleware/types";

const Query = z.object({
  tab: z.enum(["approve", "action"]).default("action"),
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

    const parsed = Query.safeParse({
      tab: req.nextUrl.searchParams.get("tab") ?? undefined,
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

    const meEmp = ctx.session.employeeId;
    const orgId = ctx.session.orgId;
    const senderEmp = employees;
    const receiverEmp = employees;

    if (parsed.data.tab === "approve") {
      const rows = await db
        .select({
          id: a2aMessages.id,
          type: a2aMessages.type,
          summary: a2aMessages.content,
          createdAt: a2aMessages.createdAt,
          threadId: a2aMessages.threadId,
          relatedTaskId: a2aMessages.relatedTaskId,
          senderAgentId: a2aMessages.senderAgentId,
          senderEmployeeId: a2aMessages.senderEmployeeId,
          receiverEmployeeId: a2aMessages.receiverEmployeeId,
          receiverEmployeeName: employees.name,
        })
        .from(a2aMessages)
        .innerJoin(
          employees,
          eq(employees.id, a2aMessages.receiverEmployeeId),
        )
        .where(
          and(
            eq(a2aMessages.orgId, orgId),
            eq(a2aMessages.senderEmployeeId, meEmp),
            eq(a2aMessages.senderApprovalStatus, "pending"),
          ),
        )
        .orderBy(desc(a2aMessages.createdAt))
        .limit(parsed.data.limit);

      return NextResponse.json({
        data: {
          tab: "approve",
          items: rows.map((r) => ({
            kind: "a2a" as const,
            id: r.id,
            type: r.type,
            summary:
              (r.summary as { summary?: string })?.summary ?? "(no summary)",
            createdAt: r.createdAt,
            threadId: r.threadId,
            relatedTaskId: r.relatedTaskId,
            senderAgentId: r.senderAgentId,
            counterpartName: r.receiverEmployeeName,
          })),
        },
      });
    }

    // tab = "action"
    const a2aRows = await db
      .select({
        id: a2aMessages.id,
        type: a2aMessages.type,
        summary: a2aMessages.content,
        createdAt: a2aMessages.createdAt,
        threadId: a2aMessages.threadId,
        relatedTaskId: a2aMessages.relatedTaskId,
        senderAgentId: a2aMessages.senderAgentId,
        senderEmployeeName: senderEmp.name,
      })
      .from(a2aMessages)
      .innerJoin(senderEmp, eq(senderEmp.id, a2aMessages.senderEmployeeId))
      .where(
        and(
          eq(a2aMessages.orgId, orgId),
          eq(a2aMessages.receiverEmployeeId, meEmp),
          eq(a2aMessages.receiverActionStatus, "pending"),
        ),
      )
      .orderBy(desc(a2aMessages.createdAt))
      .limit(parsed.data.limit);

    const taskRows = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        createdAt: tasks.updatedAt,
        assigneeEmployeeId: tasks.assigneeEmployeeId,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.orgId, orgId),
          eq(tasks.reviewerEmployeeId, meEmp),
          eq(tasks.status, "pending_review"),
        ),
      )
      .orderBy(desc(tasks.updatedAt))
      .limit(parsed.data.limit);

    const items = [
      ...a2aRows.map((r) => ({
        kind: "a2a" as const,
        id: r.id,
        type: r.type,
        summary:
          (r.summary as { summary?: string })?.summary ?? "(no summary)",
        createdAt: r.createdAt,
        threadId: r.threadId,
        relatedTaskId: r.relatedTaskId,
        senderAgentId: r.senderAgentId,
        counterpartName: r.senderEmployeeName,
      })),
      ...taskRows.map((r) => ({
        kind: "task_review" as const,
        id: r.id,
        type: "review" as const,
        summary: r.title,
        createdAt: r.createdAt,
        threadId: null,
        relatedTaskId: r.id,
        senderAgentId: null,
        counterpartName: null,
      })),
    ];

    items.sort(
      (a, b) =>
        new Date(b.createdAt as Date).getTime() -
        new Date(a.createdAt as Date).getTime(),
    );

    return NextResponse.json({
      data: { tab: "action", items: items.slice(0, parsed.data.limit) },
    });
  }),
);
