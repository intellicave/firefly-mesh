// GET  /api/department — list
// POST /api/department — create (admin/manager)

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import { departments } from "@firefly-mesh/core/db/schema";
import { logAction } from "@firefly-mesh/core/audit/log";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { withRBAC } from "@/lib/middleware/withRBAC";
import { isUserSession } from "@/lib/middleware/types";

export const GET = withAuth(
  withOrgGuard(async (_req, ctx) => {
    if (!isUserSession(ctx.session)) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN" } },
        { status: 403 },
      );
    }
    const rows = await db
      .select()
      .from(departments)
      .where(eq(departments.orgId, ctx.session.orgId));
    return NextResponse.json({ data: rows });
  }),
);

const CreateBody = z.object({
  name: z.string().min(1).max(100),
  parentId: z.string().uuid().optional(),
  description: z.string().max(500).optional(),
});

export const POST = withAuth(
  withOrgGuard(
    withRBAC(["owner", "admin", "manager"])(async (req: NextRequest, ctx) => {
      if (!isUserSession(ctx.session)) {
        return NextResponse.json(
          { error: { code: "FORBIDDEN" } },
          { status: 403 },
        );
      }
      const parsed = CreateBody.safeParse(await req.json());
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

      const [created] = await db
        .insert(departments)
        .values({
          orgId: ctx.session.orgId,
          ...parsed.data,
        })
        .returning();

      if (!created) {
        return NextResponse.json(
          { error: { code: "INTERNAL_ERROR" } },
          { status: 500 },
        );
      }

      await logAction({
        orgId: ctx.session.orgId,
        actorType: "human",
        actorId: ctx.session.userId,
        action: "department.created",
        resourceType: "department",
        resourceId: created.id,
        payload: { name: created.name },
      });

      return NextResponse.json({ data: created }, { status: 201 });
    }),
  ),
);
