// PUT    /api/department/{id} — update
// DELETE /api/department/{id} — delete

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import { departments } from "@firefly-mesh/core/db/schema";
import { logAction } from "@firefly-mesh/core/audit/log";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { withRBAC } from "@/lib/middleware/withRBAC";
import { isUserSession } from "@/lib/middleware/types";

function parseId(req: NextRequest): string | null {
  const segments = req.nextUrl.pathname.split("/");
  const id = segments[segments.length - 1];
  if (!id || !z.string().uuid().safeParse(id).success) return null;
  return id;
}

const PutBody = z.object({
  name: z.string().min(1).max(100).optional(),
  parentId: z.string().uuid().nullable().optional(),
  description: z.string().max(500).optional(),
});

export const PUT = withAuth(
  withOrgGuard(
    withRBAC(["owner", "admin", "manager"])(async (req: NextRequest, ctx) => {
      if (!isUserSession(ctx.session)) {
        return NextResponse.json(
          { error: { code: "FORBIDDEN" } },
          { status: 403 },
        );
      }
      const id = parseId(req);
      if (!id) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "id must be uuid" } },
          { status: 400 },
        );
      }
      const parsed = PutBody.safeParse(await req.json());
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
      if (Object.keys(parsed.data).length === 0) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "No fields" } },
          { status: 400 },
        );
      }

      const [updated] = await db
        .update(departments)
        .set(parsed.data)
        .where(
          and(
            eq(departments.id, id),
            eq(departments.orgId, ctx.session.orgId),
          ),
        )
        .returning();

      if (!updated) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND" } },
          { status: 404 },
        );
      }

      await logAction({
        orgId: ctx.session.orgId,
        actorType: "human",
        actorId: ctx.session.userId,
        action: "department.updated",
        resourceType: "department",
        resourceId: id,
        payload: parsed.data,
      });

      return NextResponse.json({ data: updated });
    }),
  ),
);

export const DELETE = withAuth(
  withOrgGuard(
    withRBAC(["owner", "admin"])(async (req: NextRequest, ctx) => {
      if (!isUserSession(ctx.session)) {
        return NextResponse.json(
          { error: { code: "FORBIDDEN" } },
          { status: 403 },
        );
      }
      const id = parseId(req);
      if (!id) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "id must be uuid" } },
          { status: 400 },
        );
      }

      const result = await db
        .delete(departments)
        .where(
          and(
            eq(departments.id, id),
            eq(departments.orgId, ctx.session.orgId),
          ),
        )
        .returning({ id: departments.id });

      if (result.length === 0) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND" } },
          { status: 404 },
        );
      }

      await logAction({
        orgId: ctx.session.orgId,
        actorType: "human",
        actorId: ctx.session.userId,
        action: "department.deleted",
        resourceType: "department",
        resourceId: id,
      });

      return NextResponse.json({ data: { id, deleted: true } });
    }),
  ),
);
