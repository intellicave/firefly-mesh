// GET  /api/skill — list skills (filter by scope)
// POST /api/skill — create new skill (scope-specific RBAC)

import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import {
  departmentMembers,
  skills,
} from "@firefly-mesh/core/db/schema";
import type { SkillManifest } from "@firefly-mesh/core/db/schema";
import { logAction } from "@firefly-mesh/core/audit/log";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { isUserSession } from "@/lib/middleware/types";

const ManifestSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000),
  version: z.string().regex(/^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$/),
  tools: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        description: z.string().max(500),
        inputSchema: z.unknown(),
      }),
    )
    .optional(),
  files: z.array(z.string().max(200)).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
});

const ListQuery = z.object({
  scope: z.enum(["company", "department", "personal", "all"]).default("all"),
  deptId: z.string().uuid().optional(),
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const GET = withAuth(
  withOrgGuard(async (req: NextRequest, ctx) => {
    if (!isUserSession(ctx.session)) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN" } },
        { status: 403 },
      );
    }
    const parsed = ListQuery.safeParse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", details: parsed.error.issues } },
        { status: 400 },
      );
    }
    const q = parsed.data;

    const empDepts = await db
      .select({ departmentId: departmentMembers.departmentId })
      .from(departmentMembers)
      .where(eq(departmentMembers.employeeId, ctx.session.employeeId));
    const myDepts = empDepts.map((r) => r.departmentId);
    const isPrivileged =
      ctx.session.role === "owner" || ctx.session.role === "admin";

    const conditions = [eq(skills.orgId, ctx.session.orgId)];
    if (q.cursor) conditions.push(lt(skills.createdAt, new Date(q.cursor)));

    if (q.scope === "company") {
      conditions.push(eq(skills.scope, "company"));
    } else if (q.scope === "department") {
      if (q.deptId) {
        conditions.push(
          and(
            eq(skills.scope, "department"),
            eq(skills.departmentId, q.deptId),
          )!,
        );
      } else if (isPrivileged) {
        conditions.push(eq(skills.scope, "department"));
      } else if (myDepts.length > 0) {
        conditions.push(
          and(
            eq(skills.scope, "department"),
            inArray(skills.departmentId, myDepts),
          )!,
        );
      } else {
        return NextResponse.json({ data: { skills: [], nextCursor: null } });
      }
    } else if (q.scope === "personal") {
      conditions.push(
        and(
          eq(skills.scope, "personal"),
          eq(skills.ownerEmployeeId, ctx.session.employeeId),
        )!,
      );
    } else {
      // 'all' three-tier OR
      const personalFilter = and(
        eq(skills.scope, "personal"),
        eq(skills.ownerEmployeeId, ctx.session.employeeId),
      )!;
      const deptFilter = isPrivileged
        ? eq(skills.scope, "department")
        : myDepts.length > 0
          ? and(
              eq(skills.scope, "department"),
              inArray(skills.departmentId, myDepts),
            )!
          : sql`1=0`;
      const companyFilter = eq(skills.scope, "company");
      conditions.push(or(companyFilter, deptFilter, personalFilter)!);
    }

    const rows = await db
      .select()
      .from(skills)
      .where(and(...conditions))
      .orderBy(asc(skills.manifestId))
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = rows.slice(0, q.limit);
    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1]!.createdAt.toISOString()
        : null;

    return NextResponse.json({
      data: { skills: items, nextCursor },
    });
  }),
);

const PostBody = z.object({
  manifestId: z.string().min(1).max(120),
  version: z.string().regex(/^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$/),
  scope: z.enum(["company", "department", "personal"]),
  departmentId: z.string().uuid().optional(),
  manifest: ManifestSchema,
});

export const POST = withAuth(
  withOrgGuard(async (req: NextRequest, ctx) => {
    if (!isUserSession(ctx.session)) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN" } },
        { status: 403 },
      );
    }
    const parsed = PostBody.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", details: parsed.error.issues } },
        { status: 400 },
      );
    }

    const isPrivileged =
      ctx.session.role === "owner" || ctx.session.role === "admin";

    if (parsed.data.scope === "company") {
      if (!isPrivileged) {
        return NextResponse.json(
          {
            error: {
              code: "FORBIDDEN",
              message: "Only owner/admin may publish company skills",
            },
          },
          { status: 403 },
        );
      }
    } else if (parsed.data.scope === "department") {
      if (!parsed.data.departmentId) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "departmentId required for department scope",
            },
          },
          { status: 400 },
        );
      }
      if (!isPrivileged) {
        const [member] = await db
          .select({ role: departmentMembers.role })
          .from(departmentMembers)
          .where(
            and(
              eq(departmentMembers.employeeId, ctx.session.employeeId),
              eq(departmentMembers.departmentId, parsed.data.departmentId),
            ),
          )
          .limit(1);
        if (!member || member.role !== "head") {
          return NextResponse.json(
            {
              error: {
                code: "FORBIDDEN",
                message: "Only department head / admin may publish department skills",
              },
            },
            { status: 403 },
          );
        }
      }
    }

    // Reject duplicate manifestId@version in same scope
    const dupConditions = [
      eq(skills.orgId, ctx.session.orgId),
      eq(skills.manifestId, parsed.data.manifestId),
      eq(skills.version, parsed.data.version),
      eq(skills.scope, parsed.data.scope),
    ];
    if (parsed.data.scope === "department" && parsed.data.departmentId) {
      dupConditions.push(eq(skills.departmentId, parsed.data.departmentId));
    } else if (parsed.data.scope === "personal") {
      dupConditions.push(
        eq(skills.ownerEmployeeId, ctx.session.employeeId),
      );
    }
    const [dup] = await db
      .select({ id: skills.id })
      .from(skills)
      .where(and(...dupConditions))
      .limit(1);
    if (dup) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: `Skill ${parsed.data.manifestId}@${parsed.data.version} already exists in ${parsed.data.scope} scope`,
          },
        },
        { status: 409 },
      );
    }

    const [created] = await db
      .insert(skills)
      .values({
        orgId: ctx.session.orgId,
        manifestId: parsed.data.manifestId,
        version: parsed.data.version,
        manifest: parsed.data.manifest as unknown as SkillManifest,
        scope: parsed.data.scope,
        departmentId:
          parsed.data.scope === "department" ? parsed.data.departmentId : null,
        ownerEmployeeId:
          parsed.data.scope === "personal" ? ctx.session.employeeId : null,
        status: "active",
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
      action: "skill.created",
      resourceType: "skill",
      resourceId: created.id,
      payload: {
        manifestId: created.manifestId,
        version: created.version,
        scope: created.scope,
      },
    });

    return NextResponse.json({ data: created }, { status: 201 });
  }),
);
