// GET /api/a2a/inbox?tab=approve|action — list pending HITL items.
//
// tab=approve: messages where sender = me, senderApprovalStatus=pending
// tab=action:  messages where receiver = me, receiverActionStatus=pending
//              + tasks where reviewer = me, status=pending_review
//
// Optional filters (all wire-format):
//   type=inform|sync|request|commit|handoff|escalate|block — filter by message type
//   counterpart=<employeeId>                                — filter by other-side employee
//   sort=desc|asc                                          — order by createdAt
//   cursor=<ISO datetime>                                  — load older than this (for "Load earlier")

import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, gt, lt, type SQL } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import { a2aMessages, employees, tasks } from "@firefly-mesh/core/db/schema";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { isUserSession } from "@/lib/middleware/types";

const Query = z.object({
  tab: z.enum(["approve", "action"]).default("action"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
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
  counterpart: z.string().uuid().optional(),
  sort: z.enum(["desc", "asc"]).default("desc"),
  cursor: z.string().datetime().optional(),
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
      type: req.nextUrl.searchParams.get("type") ?? undefined,
      counterpart: req.nextUrl.searchParams.get("counterpart") ?? undefined,
      sort: req.nextUrl.searchParams.get("sort") ?? undefined,
      cursor: req.nextUrl.searchParams.get("cursor") ?? undefined,
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
    const cursorDate = parsed.data.cursor
      ? new Date(parsed.data.cursor)
      : null;
    const cursorOp = parsed.data.sort === "desc" ? lt : gt;
    const orderBy = parsed.data.sort === "desc" ? desc : asc;

    if (parsed.data.tab === "approve") {
      const conditions: SQL[] = [
        eq(a2aMessages.orgId, orgId),
        eq(a2aMessages.senderEmployeeId, meEmp),
        eq(a2aMessages.senderApprovalStatus, "pending"),
      ];
      if (parsed.data.type)
        conditions.push(eq(a2aMessages.type, parsed.data.type));
      if (parsed.data.counterpart)
        conditions.push(
          eq(a2aMessages.receiverEmployeeId, parsed.data.counterpart),
        );
      if (cursorDate)
        conditions.push(cursorOp(a2aMessages.createdAt, cursorDate));

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
          receiverEmployeeName: receiverEmp.name,
        })
        .from(a2aMessages)
        .innerJoin(
          receiverEmp,
          eq(receiverEmp.id, a2aMessages.receiverEmployeeId),
        )
        .where(and(...conditions))
        .orderBy(orderBy(a2aMessages.createdAt))
        .limit(parsed.data.limit + 1);

      const hasMore = rows.length > parsed.data.limit;
      const items = rows.slice(0, parsed.data.limit);
      const nextCursor =
        hasMore && items.length > 0
          ? items[items.length - 1]!.createdAt.toISOString()
          : null;

      return NextResponse.json({
        data: {
          tab: "approve",
          items: items.map((r) => ({
            kind: "a2a" as const,
            id: r.id,
            type: r.type,
            summary:
              (r.summary as { summary?: string })?.summary ?? "(no summary)",
            createdAt: r.createdAt,
            threadId: r.threadId,
            relatedTaskId: r.relatedTaskId,
            senderAgentId: r.senderAgentId,
            counterpartId: r.receiverEmployeeId,
            counterpartName: r.receiverEmployeeName,
          })),
          nextCursor,
        },
      });
    }

    // tab = "action"
    const a2aConditions: SQL[] = [
      eq(a2aMessages.orgId, orgId),
      eq(a2aMessages.receiverEmployeeId, meEmp),
      eq(a2aMessages.receiverActionStatus, "pending"),
    ];
    if (parsed.data.type)
      a2aConditions.push(eq(a2aMessages.type, parsed.data.type));
    if (parsed.data.counterpart)
      a2aConditions.push(
        eq(a2aMessages.senderEmployeeId, parsed.data.counterpart),
      );
    if (cursorDate)
      a2aConditions.push(cursorOp(a2aMessages.createdAt, cursorDate));

    const a2aRows = await db
      .select({
        id: a2aMessages.id,
        type: a2aMessages.type,
        summary: a2aMessages.content,
        createdAt: a2aMessages.createdAt,
        threadId: a2aMessages.threadId,
        relatedTaskId: a2aMessages.relatedTaskId,
        senderAgentId: a2aMessages.senderAgentId,
        senderEmployeeId: a2aMessages.senderEmployeeId,
        senderEmployeeName: senderEmp.name,
      })
      .from(a2aMessages)
      .innerJoin(senderEmp, eq(senderEmp.id, a2aMessages.senderEmployeeId))
      .where(and(...a2aConditions))
      .orderBy(orderBy(a2aMessages.createdAt))
      .limit(parsed.data.limit + 1);

    // task_review only when no `type` filter (review is its own kind)
    const taskRows = parsed.data.type
      ? []
      : await (() => {
          const conds: SQL[] = [
            eq(tasks.orgId, orgId),
            eq(tasks.reviewerEmployeeId, meEmp),
            eq(tasks.status, "pending_review"),
          ];
          if (cursorDate) conds.push(cursorOp(tasks.updatedAt, cursorDate));
          return db
            .select({
              id: tasks.id,
              title: tasks.title,
              description: tasks.description,
              createdAt: tasks.updatedAt,
              assigneeEmployeeId: tasks.assigneeEmployeeId,
            })
            .from(tasks)
            .where(and(...conds))
            .orderBy(orderBy(tasks.updatedAt))
            .limit(parsed.data.limit + 1);
        })();

    const merged = [
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
        counterpartId: r.senderEmployeeId,
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
        counterpartId: r.assigneeEmployeeId,
        counterpartName: null as string | null,
      })),
    ];

    merged.sort((a, b) => {
      const at = new Date(a.createdAt as Date).getTime();
      const bt = new Date(b.createdAt as Date).getTime();
      return parsed.data.sort === "desc" ? bt - at : at - bt;
    });

    const hasMore = merged.length > parsed.data.limit;
    const items = merged.slice(0, parsed.data.limit);
    const nextCursor =
      hasMore && items.length > 0
        ? new Date(items[items.length - 1]!.createdAt as Date).toISOString()
        : null;

    return NextResponse.json({
      data: { tab: "action", items, nextCursor },
    });
  }),
);
