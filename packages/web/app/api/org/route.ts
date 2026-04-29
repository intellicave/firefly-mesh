// GET /api/org — current org info
// PUT /api/org — update org (admin only)

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import { organizations } from "@firefly-mesh/core/db/schema";
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
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, ctx.session.orgId))
      .limit(1);
    if (!org) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND" } },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: org });
  }),
);

const PutBody = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters/digits/hyphens")
    .optional(),
});

export const PUT = withAuth(
  withOrgGuard(
    withRBAC(["owner", "admin"])(async (req: NextRequest, ctx) => {
      if (!isUserSession(ctx.session)) {
        return NextResponse.json(
          { error: { code: "FORBIDDEN" } },
          { status: 403 },
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
        .update(organizations)
        .set(parsed.data)
        .where(eq(organizations.id, ctx.session.orgId))
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
        action: "org.updated",
        resourceType: "organization",
        resourceId: ctx.session.orgId,
        payload: parsed.data,
      });

      return NextResponse.json({ data: updated });
    }),
  ),
);
