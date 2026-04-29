// GET /api/audit/threads/{id} — full thread with messages + audit entries.

import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import {
  a2aMessages,
  a2aThreads,
  auditLog,
} from "@firefly-mesh/core/db/schema";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { isUserSession } from "@/lib/middleware/types";

function parseId(req: NextRequest): string | null {
  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  // .../api/audit/threads/{id}
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

    const [thread] = await db
      .select()
      .from(a2aThreads)
      .where(and(eq(a2aThreads.id, id), eq(a2aThreads.orgId, ctx.session.orgId)))
      .limit(1);
    if (!thread) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND" } },
        { status: 404 },
      );
    }

    const messages = await db
      .select({
        id: a2aMessages.id,
        threadId: a2aMessages.threadId,
        type: a2aMessages.type,
        senderEmployeeId: a2aMessages.senderEmployeeId,
        receiverEmployeeId: a2aMessages.receiverEmployeeId,
        content: a2aMessages.content,
        senderApprovalStatus: a2aMessages.senderApprovalStatus,
        receiverActionStatus: a2aMessages.receiverActionStatus,
        relatedTaskId: a2aMessages.relatedTaskId,
        createdAt: a2aMessages.createdAt,
      })
      .from(a2aMessages)
      .where(eq(a2aMessages.threadId, id))
      .orderBy(asc(a2aMessages.createdAt));

    const isParticipant = messages.some(
      (m) =>
        m.senderEmployeeId === ctx.session.employeeId ||
        m.receiverEmployeeId === ctx.session.employeeId,
    );
    const isPrivileged =
      ctx.session.role === "owner" ||
      ctx.session.role === "admin" ||
      ctx.session.role === "auditor";
    if (!isPrivileged && !isParticipant) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN" } },
        { status: 403 },
      );
    }

    // Audit entries pinned to messages or to the thread itself
    const messageIds = messages.map((m) => m.id);
    const auditEntries = await db
      .select({
        id: auditLog.id,
        actorType: auditLog.actorType,
        actorId: auditLog.actorId,
        action: auditLog.action,
        resourceType: auditLog.resourceType,
        resourceId: auditLog.resourceId,
        payload: auditLog.payload,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.orgId, ctx.session.orgId),
          eq(auditLog.resourceType, "a2a_message"),
        ),
      );
    const filteredAudit = auditEntries.filter(
      (e) => e.resourceId !== null && messageIds.includes(e.resourceId),
    );

    return NextResponse.json({
      data: { thread, messages, auditEntries: filteredAudit },
    });
  }),
);
