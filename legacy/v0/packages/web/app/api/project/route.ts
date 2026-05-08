// GET  /api/project — list
// POST /api/project — create (admin/manager)

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import { projects } from "@firefly-mesh/core/db/schema";
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
      .from(projects)
      .where(eq(projects.orgId, ctx.session.orgId));
    return NextResponse.json({ data: rows });
  }),
);

const CreateBody = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  status: z
    .enum(["planning", "active", "done", "archived"])
    .default("planning"),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
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
        .insert(projects)
        .values({
          orgId: ctx.session.orgId,
          name: parsed.data.name,
          description: parsed.data.description,
          status: parsed.data.status,
          startAt: parsed.data.startAt ? new Date(parsed.data.startAt) : null,
          endAt: parsed.data.endAt ? new Date(parsed.data.endAt) : null,
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
        action: "project.created",
        resourceType: "project",
        resourceId: created.id,
        payload: { name: created.name },
      });

      return NextResponse.json({ data: created }, { status: 201 });
    }),
  ),
);
