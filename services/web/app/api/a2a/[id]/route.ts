// GET /api/a2a/{id} — single message detail (for inbox drawer).

import { NextRequest, NextResponse } from "next/server";
import { alias } from "drizzle-orm/pg-core";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import { a2aMessages, agents, employees } from "@firefly-mesh/core/db/schema";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { isUserSession } from "@/lib/middleware/types";

function parseId(req: NextRequest): string | null {
  const segs = req.nextUrl.pathname.split("/");
  const id = segs[segs.length - 1];
  if (!id || !z.string().uuid().safeParse(id).success) return null;
  return id;
}

export const GET = withAuth(
  withOrgGuard(async (req: NextRequest, ctx) => {
    if (!isUserSession(ctx.session)) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN" } },
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

    const senderEmp = alias(employees, "sender_emp");
    const receiverEmp = alias(employees, "recv_emp");
    const senderAgent = alias(agents, "sender_agent");
    const receiverAgent = alias(agents, "recv_agent");

    const [msg] = await db
      .select({
        id: a2aMessages.id,
        threadId: a2aMessages.threadId,
        replyToMessageId: a2aMessages.replyToMessageId,
        type: a2aMessages.type,
        content: a2aMessages.content,
        createdAt: a2aMessages.createdAt,
        relatedTaskId: a2aMessages.relatedTaskId,
        senderApprovalRequired: a2aMessages.senderApprovalRequired,
        senderApprovalStatus: a2aMessages.senderApprovalStatus,
        senderApprovalAt: a2aMessages.senderApprovalAt,
        receiverActionRequired: a2aMessages.receiverActionRequired,
        receiverActionStatus: a2aMessages.receiverActionStatus,
        receiverActionAt: a2aMessages.receiverActionAt,
        senderEmployeeId: a2aMessages.senderEmployeeId,
        senderEmployeeName: senderEmp.name,
        senderEmployeeTitle: senderEmp.title,
        senderAgentId: a2aMessages.senderAgentId,
        senderAgentRuntime: senderAgent.runtimeKind,
        receiverEmployeeId: a2aMessages.receiverEmployeeId,
        receiverEmployeeName: receiverEmp.name,
        receiverEmployeeTitle: receiverEmp.title,
        receiverAgentId: a2aMessages.receiverAgentId,
        receiverAgentRuntime: receiverAgent.runtimeKind,
      })
      .from(a2aMessages)
      .innerJoin(senderEmp, eq(senderEmp.id, a2aMessages.senderEmployeeId))
      .innerJoin(receiverEmp, eq(receiverEmp.id, a2aMessages.receiverEmployeeId))
      .innerJoin(senderAgent, eq(senderAgent.id, a2aMessages.senderAgentId))
      .innerJoin(
        receiverAgent,
        eq(receiverAgent.id, a2aMessages.receiverAgentId),
      )
      .where(
        and(
          eq(a2aMessages.id, id),
          eq(a2aMessages.orgId, ctx.session.orgId),
        ),
      )
      .limit(1);

    if (!msg) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND" } },
        { status: 404 },
      );
    }

    // Authorization: only sender, receiver, or admin/owner/auditor can read
    const isSender = msg.senderEmployeeId === ctx.session.employeeId;
    const isReceiver = msg.receiverEmployeeId === ctx.session.employeeId;
    const isPrivileged =
      ctx.session.role === "owner" ||
      ctx.session.role === "admin" ||
      ctx.session.role === "auditor";

    if (!isSender && !isReceiver && !isPrivileged) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN" } },
        { status: 403 },
      );
    }

    return NextResponse.json({ data: msg });
  }),
);
