// GET    /api/knowledge/{id} — document metadata + first 5 chunks
// PUT    /api/knowledge/{id} — title/description/tags edit
// DELETE /api/knowledge/{id} — cascade delete chunks

import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import {
  knowledgeChunks,
  knowledgeDocuments,
} from "@firefly-mesh/core/db/schema";
import { logAction } from "@firefly-mesh/core/audit/log";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { isUserSession } from "@/lib/middleware/types";

function parseId(req: NextRequest): string | null {
  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  const id = segs[segs.length - 1];
  if (!id || !z.string().uuid().safeParse(id).success) return null;
  return id;
}

function canWrite(
  doc: { scope: string; ownerEmployeeId: string | null },
  ctx: {
    role: "owner" | "admin" | "manager" | "employee" | "auditor";
    employeeId: string;
  },
): boolean {
  if (ctx.role === "owner" || ctx.role === "admin") return true;
  if (doc.scope === "personal" && doc.ownerEmployeeId === ctx.employeeId)
    return true;
  return false;
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

    const [doc] = await db
      .select()
      .from(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.id, id),
          eq(knowledgeDocuments.orgId, ctx.session.orgId),
        ),
      )
      .limit(1);
    if (!doc) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND" } },
        { status: 404 },
      );
    }

    // Scope read check
    const isPrivileged =
      ctx.session.role === "owner" ||
      ctx.session.role === "admin" ||
      ctx.session.role === "auditor";
    if (!isPrivileged) {
      if (
        doc.scope === "personal" &&
        doc.ownerEmployeeId !== ctx.session.employeeId
      ) {
        return NextResponse.json(
          { error: { code: "FORBIDDEN" } },
          { status: 403 },
        );
      }
    }

    const previewChunks = await db
      .select({
        id: knowledgeChunks.id,
        chunkIndex: knowledgeChunks.chunkIndex,
        content: knowledgeChunks.content,
        headingPath: knowledgeChunks.headingPath,
      })
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.documentId, id))
      .orderBy(asc(knowledgeChunks.chunkIndex))
      .limit(5);

    return NextResponse.json({
      data: { document: doc, previewChunks },
    });
  }),
);

const PutBody = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
});

export const PUT = withAuth(
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
    const parsed = PutBody.safeParse(await req.json());
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR" } },
        { status: 400 },
      );
    }

    const [doc] = await db
      .select({
        id: knowledgeDocuments.id,
        scope: knowledgeDocuments.scope,
        ownerEmployeeId: knowledgeDocuments.ownerEmployeeId,
      })
      .from(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.id, id),
          eq(knowledgeDocuments.orgId, ctx.session.orgId),
        ),
      )
      .limit(1);
    if (!doc) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND" } },
        { status: 404 },
      );
    }
    if (!canWrite(doc, { role: ctx.session.role, employeeId: ctx.session.employeeId })) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN" } },
        { status: 403 },
      );
    }

    const [updated] = await db
      .update(knowledgeDocuments)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(knowledgeDocuments.id, id))
      .returning();

    await logAction({
      orgId: ctx.session.orgId,
      actorType: "human",
      actorId: ctx.session.userId,
      action: "knowledge.updated",
      resourceType: "knowledge_document",
      resourceId: id,
      payload: parsed.data,
    });

    return NextResponse.json({ data: updated });
  }),
);

export const DELETE = withAuth(
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

    const [doc] = await db
      .select({
        id: knowledgeDocuments.id,
        scope: knowledgeDocuments.scope,
        ownerEmployeeId: knowledgeDocuments.ownerEmployeeId,
      })
      .from(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.id, id),
          eq(knowledgeDocuments.orgId, ctx.session.orgId),
        ),
      )
      .limit(1);
    if (!doc) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND" } },
        { status: 404 },
      );
    }
    if (!canWrite(doc, { role: ctx.session.role, employeeId: ctx.session.employeeId })) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN" } },
        { status: 403 },
      );
    }

    await db.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, id));

    await logAction({
      orgId: ctx.session.orgId,
      actorType: "human",
      actorId: ctx.session.userId,
      action: "knowledge.deleted",
      resourceType: "knowledge_document",
      resourceId: id,
    });

    return NextResponse.json({ data: { ok: true } });
  }),
);
