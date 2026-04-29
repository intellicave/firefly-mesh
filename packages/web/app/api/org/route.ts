// GET /api/org — current org info
// PUT /api/org — update org (admin only)
// POST /api/org — onboarding step 1: create org + owner-employee for the
//                 calling user. Does NOT use withOrgGuard (caller has no
//                 org yet by definition).

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import { employees, organizations } from "@firefly-mesh/core/db/schema";
import { auth } from "@firefly-mesh/core/auth/better-auth";
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

const PostBody = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters/digits/hyphens"),
  /** Owner profile name (defaults to user.name from session). */
  ownerName: z.string().min(1).max(100).optional(),
  ownerTitle: z.string().max(80).optional(),
});

export async function POST(req: NextRequest): Promise<Response> {
  const sess = await auth.api.getSession({ headers: req.headers });
  if (!sess?.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Login required" } },
      { status: 401 },
    );
  }

  // Already an employee anywhere? Block — onboarding is one-shot per user.
  const [existing] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.userId, sess.user.id))
    .limit(1);
  if (existing) {
    return NextResponse.json(
      {
        error: {
          code: "CONFLICT",
          message: "User already belongs to an organization",
        },
      },
      { status: 409 },
    );
  }

  const parsed = PostBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", details: parsed.error.issues } },
      { status: 400 },
    );
  }

  // Slug uniqueness pre-check (DB unique constraint will also enforce)
  const [slugTaken] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, parsed.data.slug))
    .limit(1);
  if (slugTaken) {
    return NextResponse.json(
      {
        error: {
          code: "CONFLICT",
          message: `slug '${parsed.data.slug}' is taken`,
        },
      },
      { status: 409 },
    );
  }

  const result = await db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({ name: parsed.data.name, slug: parsed.data.slug })
      .returning();
    if (!org) throw new Error("org insert returned nothing");

    const [emp] = await tx
      .insert(employees)
      .values({
        orgId: org.id,
        userId: sess.user.id,
        name: parsed.data.ownerName ?? sess.user.name ?? sess.user.email,
        email: sess.user.email,
        title: parsed.data.ownerTitle,
        role: "owner",
      })
      .returning();
    if (!emp) throw new Error("employee insert returned nothing");

    return { org, employee: emp };
  });

  await logAction({
    orgId: result.org.id,
    actorType: "human",
    actorId: sess.user.id,
    action: "org.created",
    resourceType: "organization",
    resourceId: result.org.id,
    payload: { slug: result.org.slug, name: result.org.name },
  });

  return NextResponse.json({
    data: {
      org: result.org,
      employee: result.employee,
    },
  });
}
