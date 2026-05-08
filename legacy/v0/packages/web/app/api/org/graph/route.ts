// GET /api/org/graph — full org tree in one payload.
// Used by /organization page (small companies < 200 employees).

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@firefly-mesh/core/db";
import {
  agents,
  departmentMembers,
  departments,
  employees,
  projectMembers,
  projects,
} from "@firefly-mesh/core/db/schema";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { isUserSession } from "@/lib/middleware/types";

export const GET = withAuth(
  withOrgGuard(async (_req, ctx) => {
    if (!isUserSession(ctx.session)) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN" } },
        { status: 403 },
      );
    }

    const orgId = ctx.session.orgId;

    const [empRows, deptRows, deptMemberRows, projRows, projMemberRows, agentRows] =
      await Promise.all([
        db
          .select({
            id: employees.id,
            userId: employees.userId,
            name: employees.name,
            email: employees.email,
            title: employees.title,
            avatarUrl: employees.avatarUrl,
            role: employees.role,
            status: employees.status,
          })
          .from(employees)
          .where(
            and(eq(employees.orgId, orgId), eq(employees.status, "active")),
          ),
        db.select().from(departments).where(eq(departments.orgId, orgId)),
        db
          .select()
          .from(departmentMembers)
          .innerJoin(
            departments,
            eq(departments.id, departmentMembers.departmentId),
          )
          .where(eq(departments.orgId, orgId)),
        db.select().from(projects).where(eq(projects.orgId, orgId)),
        db
          .select()
          .from(projectMembers)
          .innerJoin(projects, eq(projects.id, projectMembers.projectId))
          .where(eq(projects.orgId, orgId)),
        db
          .select({
            id: agents.id,
            ownerEmployeeId: agents.ownerEmployeeId,
            runtimeKind: agents.runtimeKind,
            runtimeMeta: agents.runtimeMeta,
            status: agents.status,
            lastSeenAt: agents.lastSeenAt,
          })
          .from(agents)
          .where(eq(agents.orgId, orgId)),
      ]);

    return NextResponse.json({
      data: {
        employees: empRows,
        departments: deptRows,
        departmentMembers: deptMemberRows.map((row) => ({
          departmentId: row.department_members.departmentId,
          employeeId: row.department_members.employeeId,
          role: row.department_members.role,
        })),
        projects: projRows,
        projectMembers: projMemberRows.map((row) => ({
          projectId: row.project_members.projectId,
          employeeId: row.project_members.employeeId,
          role: row.project_members.role,
        })),
        agents: agentRows,
      },
    });
  }),
);
