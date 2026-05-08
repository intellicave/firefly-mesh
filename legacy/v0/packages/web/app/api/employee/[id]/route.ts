// GET    /api/employee/{id} — single employee
// PUT    /api/employee/{id} — update employee (admin only)
// DELETE /api/employee/{id} — archive employee (admin only)

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import { employees } from "@firefly-mesh/core/db/schema";
import { logAction } from "@firefly-mesh/core/audit/log";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { withRBAC } from "@/lib/middleware/withRBAC";
import { isUserSession } from "@/lib/middleware/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth(
  withOrgGuard(async (_req: NextRequest, ctx) => {
    if (!isUserSession(ctx.session)) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN" } },
        { status: 403 },
      );
    }

    // Path param is on the segment; Next 16 passes via the second arg
    // but our middleware swallowed it. Parse from URL instead.
    const segments = _req.nextUrl.pathname.split("/");
    const id = segments[segments.length - 1];
    if (!id || !z.string().uuid().safeParse(id).success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "id must be uuid" } },
        { status: 400 },
      );
    }

    const [emp] = await db
      .select()
      .from(employees)
      .where(
        and(
          eq(employees.id, id),
          eq(employees.orgId, ctx.session.orgId),
        ),
      )
      .limit(1);

    if (!emp) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND" } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: emp });
  }),
);

const PutBody = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().toLowerCase().optional(),
  title: z.string().max(80).optional(),
  role: z
    .enum(["owner", "admin", "manager", "employee", "auditor"])
    .optional(),
  avatarUrl: z.string().url().optional(),
  status: z.enum(["active", "archived"]).optional(),
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

      const segments = req.nextUrl.pathname.split("/");
      const id = segments[segments.length - 1];
      if (!id || !z.string().uuid().safeParse(id).success) {
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
        .update(employees)
        .set(parsed.data)
        .where(
          and(eq(employees.id, id), eq(employees.orgId, ctx.session.orgId)),
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
        action: "employee.updated",
        resourceType: "employee",
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

      const segments = req.nextUrl.pathname.split("/");
      const id = segments[segments.length - 1];
      if (!id || !z.string().uuid().safeParse(id).success) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "id must be uuid" } },
          { status: 400 },
        );
      }

      // Soft delete — archive
      const [archived] = await db
        .update(employees)
        .set({ status: "archived" })
        .where(
          and(eq(employees.id, id), eq(employees.orgId, ctx.session.orgId)),
        )
        .returning();

      if (!archived) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND" } },
          { status: 404 },
        );
      }

      await logAction({
        orgId: ctx.session.orgId,
        actorType: "human",
        actorId: ctx.session.userId,
        action: "employee.archived",
        resourceType: "employee",
        resourceId: id,
      });

      return NextResponse.json({ data: { id, status: "archived" } });
    }),
  ),
);
