// POST /api/knowledge/{id}/reindex — re-run chunk + embed pipeline
// against the original file persisted under FIREFLY_MESH_KB_STORAGE.

import { readFile } from "node:fs/promises";

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import { knowledgeDocuments } from "@firefly-mesh/core/db/schema";
import { indexDocument } from "@firefly-mesh/core/knowledge/upload";
import type { FileType } from "@firefly-mesh/core/knowledge/parse";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { isUserSession } from "@/lib/middleware/types";

function parseId(req: NextRequest): string | null {
  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  // .../api/knowledge/{id}/reindex
  const id = segs[segs.length - 2];
  if (!id || !z.string().uuid().safeParse(id).success) return null;
  return id;
}

export const POST = withAuth(
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

    const isPrivileged =
      ctx.session.role === "owner" || ctx.session.role === "admin";
    const isOwner =
      doc.scope === "personal" && doc.ownerEmployeeId === ctx.session.employeeId;
    if (!isPrivileged && !isOwner) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN" } },
        { status: 403 },
      );
    }

    if (!doc.fileUrl || !doc.fileUrl.startsWith("file://")) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "Source file not available for reindex",
          },
        },
        { status: 409 },
      );
    }

    const filePath = doc.fileUrl.slice("file://".length);
    const buffer = await readFile(filePath);

    // Pipeline runs async; we return immediately and the client subscribes
    // to SSE knowledge.indexing.{id} for progress.
    void indexDocument({
      documentId: doc.id,
      orgId: ctx.session.orgId,
      buffer,
      fileType: doc.fileType as FileType,
      scope: doc.scope as "company" | "department" | "personal",
      departmentId: doc.departmentId ?? undefined,
      ownerEmployeeId: doc.ownerEmployeeId ?? undefined,
      actorEmployeeId: ctx.session.employeeId,
    }).catch(() => {
      // pipeline reports its own state via DB + SSE
    });

    return NextResponse.json({
      data: { documentId: doc.id, indexStatus: "pending" },
    });
  }),
);
