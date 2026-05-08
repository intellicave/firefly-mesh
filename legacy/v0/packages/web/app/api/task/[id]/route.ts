// GET /api/task/{id} — single task with full context.

import { NextRequest, NextResponse } from "next/server";
import { alias } from "drizzle-orm/pg-core";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import { employees, tasks } from "@firefly-mesh/core/db/schema";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { isAgentSession, isUserSession } from "@/lib/middleware/types";

function parseId(req: NextRequest): string | null {
  const segs = req.nextUrl.pathname.split("/");
  const id = segs[segs.length - 1];
  if (!id || !z.string().uuid().safeParse(id).success) return null;
  return id;
}

export const GET = withAuth(
  withOrgGuard(async (req: NextRequest, ctx) => {
    const id = parseId(req);
    if (!id) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR" } },
        { status: 400 },
      );
    }

    const creatorEmp = alias(employees, "creator");
    const assigneeEmp = alias(employees, "assignee");
    const reviewerEmp = alias(employees, "reviewer");

    const [task] = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        output: tasks.output,
        status: tasks.status,
        parentId: tasks.parentId,
        rootId: tasks.rootId,
        reviewRound: tasks.reviewRound,
        reviewComment: tasks.reviewComment,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
        creator: {
          id: creatorEmp.id,
          name: creatorEmp.name,
        },
        assignee: {
          id: assigneeEmp.id,
          name: assigneeEmp.name,
        },
        reviewer: {
          id: reviewerEmp.id,
          name: reviewerEmp.name,
        },
      })
      .from(tasks)
      .innerJoin(creatorEmp, eq(creatorEmp.id, tasks.creatorEmployeeId))
      .leftJoin(assigneeEmp, eq(assigneeEmp.id, tasks.assigneeEmployeeId))
      .leftJoin(reviewerEmp, eq(reviewerEmp.id, tasks.reviewerEmployeeId))
      .where(and(eq(tasks.id, id), eq(tasks.orgId, ctx.session.orgId)))
      .limit(1);

    if (!task) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND" } },
        { status: 404 },
      );
    }

    // RBAC: creator / assignee / reviewer / admin / owner / auditor / agent of one of them
    if (isUserSession(ctx.session)) {
      const isPrivileged =
        ctx.session.role === "owner" ||
        ctx.session.role === "admin" ||
        ctx.session.role === "auditor";
      const isInvolved =
        task.creator.id === ctx.session.employeeId ||
        task.assignee?.id === ctx.session.employeeId ||
        task.reviewer?.id === ctx.session.employeeId;
      if (!isInvolved && !isPrivileged) {
        return NextResponse.json(
          { error: { code: "FORBIDDEN" } },
          { status: 403 },
        );
      }
    } else if (isAgentSession(ctx.session)) {
      // agent can only see tasks for its owner employee
      if (
        task.assignee?.id !== ctx.session.employeeId &&
        task.creator.id !== ctx.session.employeeId
      ) {
        return NextResponse.json(
          { error: { code: "FORBIDDEN" } },
          { status: 403 },
        );
      }
    }

    return NextResponse.json({ data: task });
  }),
);
