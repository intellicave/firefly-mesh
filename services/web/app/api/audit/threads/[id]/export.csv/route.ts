// GET /api/audit/threads/{id}/export.csv — CSV stream of thread messages.
// Privileged-only (owner/admin/auditor) per api §4.6.

import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import { a2aMessages, a2aThreads } from "@firefly-mesh/core/db/schema";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { withRBAC } from "@/lib/middleware/withRBAC";

function parseId(req: NextRequest): string | null {
  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  // .../api/audit/threads/{id}/export.csv
  const id = segs[segs.length - 2];
  if (!id || !z.string().uuid().safeParse(id).success) return null;
  return id;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const GET = withAuth(
  withOrgGuard(
    withRBAC(["owner", "admin", "auditor"])(
      async (req: NextRequest, ctx) => {
        const id = parseId(req);
        if (!id) {
          return NextResponse.json(
            { error: { code: "VALIDATION_ERROR" } },
            { status: 400 },
          );
        }

        const [thread] = await db
          .select({ id: a2aThreads.id })
          .from(a2aThreads)
          .where(
            and(
              eq(a2aThreads.id, id),
              eq(a2aThreads.orgId, ctx.session.orgId),
            ),
          )
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
            type: a2aMessages.type,
            senderEmployeeId: a2aMessages.senderEmployeeId,
            receiverEmployeeId: a2aMessages.receiverEmployeeId,
            summary: a2aMessages.content,
            senderApprovalStatus: a2aMessages.senderApprovalStatus,
            receiverActionStatus: a2aMessages.receiverActionStatus,
            relatedTaskId: a2aMessages.relatedTaskId,
            createdAt: a2aMessages.createdAt,
          })
          .from(a2aMessages)
          .where(eq(a2aMessages.threadId, id))
          .orderBy(asc(a2aMessages.createdAt));

        const header = [
          "id",
          "type",
          "senderEmployeeId",
          "receiverEmployeeId",
          "summary",
          "senderApprovalStatus",
          "receiverActionStatus",
          "relatedTaskId",
          "createdAt",
        ].join(",");

        const lines = messages.map((m) =>
          [
            m.id,
            m.type,
            m.senderEmployeeId,
            m.receiverEmployeeId,
            (m.summary as { summary?: string })?.summary ?? "",
            m.senderApprovalStatus,
            m.receiverActionStatus,
            m.relatedTaskId ?? "",
            m.createdAt.toISOString(),
          ]
            .map(csvEscape)
            .join(","),
        );

        const csv = [header, ...lines].join("\r\n") + "\r\n";

        return new Response(csv, {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="thread-${id}.csv"`,
            "cache-control": "no-store",
          },
        });
      },
    ),
  ),
);
