// GET /api/skill/loaded — merged effective skill list for the calling
// employee (Personal > Department > Company precedence).
// Used by SDK + skill package on agent boot to know which org skills
// the runtime should expose.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { loadSkillsForEmployee } from "@firefly-mesh/core/skill/loader";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";

const Query = z.object({
  employeeId: z.string().uuid().optional(),
});

export const GET = withAuth(
  withOrgGuard(async (req: NextRequest, ctx) => {
    const parsed = Query.safeParse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", details: parsed.error.issues } },
        { status: 400 },
      );
    }

    // Default to caller's own employeeId. Cross-employee read requires
    // privileged role.
    let targetEmployeeId = ctx.session.employeeId;
    if (parsed.data.employeeId && parsed.data.employeeId !== targetEmployeeId) {
      if (
        !("role" in ctx.session) ||
        (ctx.session.role !== "owner" &&
          ctx.session.role !== "admin" &&
          ctx.session.role !== "auditor")
      ) {
        return NextResponse.json(
          {
            error: {
              code: "FORBIDDEN",
              message: "Cross-employee skill read requires admin/owner/auditor",
            },
          },
          { status: 403 },
        );
      }
      targetEmployeeId = parsed.data.employeeId;
    }

    const result = await loadSkillsForEmployee({
      orgId: ctx.session.orgId,
      employeeId: targetEmployeeId,
    });

    return NextResponse.json({ data: result });
  }),
);
