// GET  /api/employee — list employees in org (RBAC-filtered)
// POST /api/employee — create employee (admin only)

import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import { employees } from "@firefly-mesh/core/db/schema";
import { logAction } from "@firefly-mesh/core/audit/log";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { withRBAC } from "@/lib/middleware/withRBAC";
import { isUserSession } from "@/lib/middleware/types";

export const GET = withAuth(
  withOrgGuard(async (_req: NextRequest, ctx) => {
    if (!isUserSession(ctx.session)) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "User session required" } },
        { status: 403 },
      );
    }

    const rows = await db
      .select({
        id: employees.id,
        userId: employees.userId,
        name: employees.name,
        email: employees.email,
        title: employees.title,
        avatarUrl: employees.avatarUrl,
        status: employees.status,
        role: employees.role,
        createdAt: employees.createdAt,
      })
      .from(employees)
      .where(
        and(
          eq(employees.orgId, ctx.session.orgId),
          eq(employees.status, "active"),
        ),
      )
      .orderBy(asc(employees.name));

    return NextResponse.json({ data: rows });
  }),
);

const CreateBody = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().toLowerCase(),
  title: z.string().max(80).optional(),
  role: z
    .enum(["owner", "admin", "manager", "employee", "auditor"])
    .default("employee"),
  avatarUrl: z.string().url().optional(),
});

export const POST = withAuth(
  withOrgGuard(
    withRBAC(["owner", "admin"])(async (req: NextRequest, ctx) => {
      if (!isUserSession(ctx.session)) {
        return NextResponse.json(
          { error: { code: "FORBIDDEN", message: "User session required" } },
          { status: 403 },
        );
      }

      const parsed = CreateBody.safeParse(await req.json());
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

      const [created] = await db
        .insert(employees)
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
        action: "employee.created",
        resourceType: "employee",
        resourceId: created.id,
        payload: { name: created.name, role: created.role },
      });

      return NextResponse.json({ data: created }, { status: 201 });
    }),
  ),
);
