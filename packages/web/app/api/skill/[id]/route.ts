// GET    /api/skill/{id} — full manifest + conflict preview
// PUT    /api/skill/{id} — update manifest (auto-bump patch version by default)
// DELETE /api/skill/{id} — soft delete (status='archived')

import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import { skills } from "@firefly-mesh/core/db/schema";
import type { SkillManifest } from "@firefly-mesh/core/db/schema";
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

function bumpPatch(version: string): string {
  const parts = version.split("-");
  const semverPart = parts[0]!;
  const [maj, min, pat] = semverPart.split(".").map((n) => parseInt(n, 10));
  if (Number.isNaN(maj) || Number.isNaN(min) || Number.isNaN(pat)) {
    return version;
  }
  const next = `${maj}.${min}.${pat + 1}`;
  return parts.length > 1 ? `${next}-${parts.slice(1).join("-")}` : next;
}

function canWrite(
  s: { scope: string; ownerEmployeeId: string | null; departmentId: string | null },
  ctx: { role: string; employeeId: string },
): boolean {
  if (ctx.role === "owner" || ctx.role === "admin") return true;
  if (s.scope === "personal" && s.ownerEmployeeId === ctx.employeeId)
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

    const [skill] = await db
      .select()
      .from(skills)
      .where(
        and(eq(skills.id, id), eq(skills.orgId, ctx.session.orgId)),
      )
      .limit(1);
    if (!skill) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND" } },
        { status: 404 },
      );
    }

    // Conflict preview: any other rows with same manifestId in this org
    const peers = await db
      .select({
        id: skills.id,
        scope: skills.scope,
        version: skills.version,
        departmentId: skills.departmentId,
        ownerEmployeeId: skills.ownerEmployeeId,
      })
      .from(skills)
      .where(
        and(
          eq(skills.orgId, ctx.session.orgId),
          eq(skills.manifestId, skill.manifestId),
          ne(skills.id, id),
        ),
      );

    return NextResponse.json({ data: { skill, conflicts: peers } });
  }),
);

const PutBody = z.object({
  manifest: z
    .object({
      name: z.string().min(1).max(120),
      description: z.string().max(1000),
      version: z.string().optional(),
      tools: z.array(z.unknown()).optional(),
      files: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
  autoBumpVersion: z.boolean().default(true),
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
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", details: parsed.error.issues } },
        { status: 400 },
      );
    }

    const [skill] = await db
      .select()
      .from(skills)
      .where(and(eq(skills.id, id), eq(skills.orgId, ctx.session.orgId)))
      .limit(1);
    if (!skill) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND" } },
        { status: 404 },
      );
    }
    if (!canWrite(skill, ctx.session)) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN" } },
        { status: 403 },
      );
    }

    const newVersion =
      parsed.data.manifest?.version ??
      (parsed.data.autoBumpVersion ? bumpPatch(skill.version) : skill.version);

    const updates: Partial<typeof skills.$inferInsert> = {};
    if (parsed.data.manifest) {
      updates.manifest = {
        ...(skill.manifest as SkillManifest),
        ...(parsed.data.manifest as Partial<SkillManifest>),
        version: newVersion,
      } as SkillManifest;
      updates.version = newVersion;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "No fields" } },
        { status: 400 },
      );
    }

    const [updated] = await db
      .update(skills)
      .set(updates)
      .where(eq(skills.id, id))
      .returning();

    await logAction({
      orgId: ctx.session.orgId,
      actorType: "human",
      actorId: ctx.session.userId,
      action: "skill.updated",
      resourceType: "skill",
      resourceId: id,
      payload: { newVersion },
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

    const [skill] = await db
      .select()
      .from(skills)
      .where(and(eq(skills.id, id), eq(skills.orgId, ctx.session.orgId)))
      .limit(1);
    if (!skill) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND" } },
        { status: 404 },
      );
    }
    if (!canWrite(skill, ctx.session)) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN" } },
        { status: 403 },
      );
    }

    await db
      .update(skills)
      .set({ status: "archived" })
      .where(eq(skills.id, id));

    await logAction({
      orgId: ctx.session.orgId,
      actorType: "human",
      actorId: ctx.session.userId,
      action: "skill.archived",
      resourceType: "skill",
      resourceId: id,
    });

    return NextResponse.json({ data: { ok: true } });
  }),
);
