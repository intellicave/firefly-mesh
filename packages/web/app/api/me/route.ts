// GET /api/me — current user + employee + org + pending inbox counts.
// PUT /api/me — update self profile.

import { NextRequest, NextResponse } from "next/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import {
  a2aMessages,
  employees,
  organizations,
  tasks,
} from "@firefly-mesh/core/db/schema";

import { withAuth } from "@/lib/middleware/withAuth";
import { isUserSession } from "@/lib/middleware/types";

export const GET = withAuth(async (_req: NextRequest, ctx) => {
  if (!isUserSession(ctx.session)) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "/api/me is for user sessions only",
        },
      },
      { status: 403 },
    );
  }

  const [emp] = await db
    .select({
      id: employees.id,
      name: employees.name,
      title: employees.title,
      email: employees.email,
      role: employees.role,
      avatarUrl: employees.avatarUrl,
    })
    .from(employees)
    .where(eq(employees.id, ctx.session.employeeId))
    .limit(1);

  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
    })
    .from(organizations)
    .where(eq(organizations.id, ctx.session.orgId))
    .limit(1);

  // Pending inbox counts (real queries, no placeholder)
  const [{ c: approveCount }] = await db
    .select({ c: count() })
    .from(a2aMessages)
    .where(
      and(
        eq(a2aMessages.orgId, ctx.session.orgId),
        eq(a2aMessages.senderEmployeeId, ctx.session.employeeId),
        eq(a2aMessages.senderApprovalStatus, "pending"),
      ),
    );

  const [{ c: actionCount }] = await db
    .select({ c: count() })
    .from(a2aMessages)
    .where(
      and(
        eq(a2aMessages.orgId, ctx.session.orgId),
        eq(a2aMessages.receiverEmployeeId, ctx.session.employeeId),
        eq(a2aMessages.receiverActionStatus, "pending"),
      ),
    );

  const [{ c: reviewCount }] = await db
    .select({ c: count() })
    .from(tasks)
    .where(
      and(
        eq(tasks.orgId, ctx.session.orgId),
        eq(tasks.reviewerEmployeeId, ctx.session.employeeId),
        eq(tasks.status, "pending_review"),
      ),
    );

  return NextResponse.json({
    data: {
      user: { id: ctx.session.userId },
      employee: emp,
      org,
      pendingCounts: {
        inboxApprove: Number(approveCount),
        inboxAction: Number(actionCount) + Number(reviewCount),
      },
    },
  });
});

const PutBody = z.object({
  name: z.string().min(1).max(100).optional(),
  title: z.string().max(80).optional(),
  avatarUrl: z.string().url().optional(),
});

export const PUT = withAuth(async (req: NextRequest, ctx) => {
  if (!isUserSession(ctx.session)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "User session required" } },
      { status: 403 },
    );
  }

  const parsed = PutBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          details: parsed.error.issues,
        },
      },
      { status: 400 },
    );
  }

  const updates = parsed.data;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "No fields to update" } },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(employees)
    .set(updates)
    .where(eq(employees.id, ctx.session.employeeId))
    .returning({
      id: employees.id,
      name: employees.name,
      title: employees.title,
      avatarUrl: employees.avatarUrl,
    });

  return NextResponse.json({ data: updated });
});
