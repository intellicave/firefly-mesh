// POST /api/knowledge/upload — multipart upload.
// Creates document row → triggers async indexing pipeline → returns
// documentId immediately. Client subscribes to SSE knowledge.indexing.{id}
// for progress.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import {
  departmentMembers,
  knowledgeDocuments,
} from "@firefly-mesh/core/db/schema";
import { logAction } from "@firefly-mesh/core/audit/log";
import { indexDocument } from "@firefly-mesh/core/knowledge/upload";
import type { FileType } from "@firefly-mesh/core/knowledge/parse";

const STORAGE_ROOT =
  process.env.FIREFLY_MESH_KB_STORAGE ?? join(process.cwd(), "var", "knowledge");

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { isUserSession } from "@/lib/middleware/types";

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

function inferFileType(name: string, mime: string): FileType | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf") || mime === "application/pdf") return "pdf";
  if (
    lower.endsWith(".docx") ||
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "docx";
  if (lower.endsWith(".md") || mime === "text/markdown") return "md";
  if (lower.endsWith(".txt") || mime === "text/plain") return "txt";
  if (lower.endsWith(".html") || mime === "text/html") return "html";
  return null;
}

const FormSchema = z.object({
  scope: z.enum(["company", "department", "personal"]),
  deptId: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
});

export const POST = withAuth(
  withOrgGuard(async (req: NextRequest, ctx) => {
    if (!isUserSession(ctx.session)) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN" } },
        { status: 403 },
      );
    }

    if (!(req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "multipart/form-data required",
          },
        },
        { status: 400 },
      );
    }

    const form = await req.formData();
    const fileEntry = form.get("file");
    if (!(fileEntry instanceof File)) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "form field 'file' is required",
          },
        },
        { status: 400 },
      );
    }
    if (fileEntry.size > MAX_BYTES) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: `File too large (max ${MAX_BYTES / 1024 / 1024} MB)`,
          },
        },
        { status: 413 },
      );
    }

    const fileType = inferFileType(fileEntry.name, fileEntry.type);
    if (!fileType) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Unsupported file type. Allowed: pdf, docx, md, txt, html",
          },
        },
        { status: 400 },
      );
    }

    const fields = FormSchema.safeParse({
      scope: form.get("scope"),
      deptId: form.get("deptId") || undefined,
      title: form.get("title"),
      description: form.get("description") || undefined,
    });
    if (!fields.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", details: fields.error.issues } },
        { status: 400 },
      );
    }

    // Authorize scope
    const isPrivileged =
      ctx.session.role === "owner" || ctx.session.role === "admin";
    if (fields.data.scope === "company" && !isPrivileged) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Only owner/admin may publish to company scope",
          },
        },
        { status: 403 },
      );
    }
    if (fields.data.scope === "department") {
      if (!fields.data.deptId) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "deptId required for department scope",
            },
          },
          { status: 400 },
        );
      }
      if (!isPrivileged) {
        const [member] = await db
          .select({
            departmentId: departmentMembers.departmentId,
            role: departmentMembers.role,
          })
          .from(departmentMembers)
          .where(eq(departmentMembers.employeeId, ctx.session.employeeId))
          .limit(50);
        if (!member || member.role !== "head") {
          return NextResponse.json(
            {
              error: {
                code: "FORBIDDEN",
                message: "Only department head / admin may publish to department",
              },
            },
            { status: 403 },
          );
        }
      }
    }

    const buffer = Buffer.from(await fileEntry.arrayBuffer());

    const [created] = await db
      .insert(knowledgeDocuments)
      .values({
        orgId: ctx.session.orgId,
        scope: fields.data.scope,
        departmentId:
          fields.data.scope === "department" ? fields.data.deptId : null,
        ownerEmployeeId:
          fields.data.scope === "personal" ? ctx.session.employeeId : null,
        title: fields.data.title,
        description: fields.data.description,
        fileType,
        fileSize: String(buffer.byteLength),
        indexStatus: "pending",
        createdBy: ctx.session.employeeId,
      })
      .returning({ id: knowledgeDocuments.id });

    if (!created) {
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR" } },
        { status: 500 },
      );
    }

    // Persist source bytes to local storage so /reindex can re-run pipeline
    // without re-uploading. Path: <root>/<orgId>/<docId>.<ext>.
    const orgDir = join(STORAGE_ROOT, ctx.session.orgId);
    await mkdir(orgDir, { recursive: true });
    const filePath = join(orgDir, `${created.id}.${fileType}`);
    await writeFile(filePath, buffer);
    await db
      .update(knowledgeDocuments)
      .set({ fileUrl: `file://${filePath}` })
      .where(eq(knowledgeDocuments.id, created.id));

    await logAction({
      orgId: ctx.session.orgId,
      actorType: "human",
      actorId: ctx.session.userId,
      action: "knowledge.uploaded",
      resourceType: "knowledge_document",
      resourceId: created.id,
      payload: { scope: fields.data.scope, title: fields.data.title },
    });

    // Fire-and-forget index pipeline. Client subscribes to SSE for progress.
    void indexDocument({
      documentId: created.id,
      orgId: ctx.session.orgId,
      buffer,
      fileType,
      scope: fields.data.scope,
      departmentId:
        fields.data.scope === "department" ? fields.data.deptId : undefined,
      ownerEmployeeId:
        fields.data.scope === "personal" ? ctx.session.employeeId : undefined,
      actorEmployeeId: ctx.session.employeeId,
    }).catch(() => {
      // Pipeline reports its own state via knowledgeDocuments.indexStatus
      // and SSE; nothing more to do here.
    });

    return NextResponse.json({
      data: { documentId: created.id, indexStatus: "pending" },
    });
  }),
);
