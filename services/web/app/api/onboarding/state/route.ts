// GET /api/onboarding/state — what step is the calling user on?
//   create-org   — user has no employee record (no org yet)
//   import       — org exists but only owner is in employees table
//   tokens       — employees imported but no agent_tokens issued yet
//   done         — at least one token has been generated
//
// Used by /onboarding wizard to redirect the user to the right step.

import { NextRequest, NextResponse } from "next/server";
import { count, eq } from "drizzle-orm";

import { db } from "@firefly-mesh/core/db";
import { agentTokens, employees } from "@firefly-mesh/core/db/schema";
import { auth } from "@firefly-mesh/core/auth/better-auth";

export async function GET(req: NextRequest): Promise<Response> {
  const sess = await auth.api.getSession({ headers: req.headers });
  if (!sess?.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED" } },
      { status: 401 },
    );
  }

  const [emp] = await db
    .select({
      id: employees.id,
      orgId: employees.orgId,
      role: employees.role,
    })
    .from(employees)
    .where(eq(employees.userId, sess.user.id))
    .limit(1);

  if (!emp) {
    return NextResponse.json({
      data: { step: "create-org", completed: false },
    });
  }

  const [{ count: empCount }] = await db
    .select({ count: count() })
    .from(employees)
    .where(eq(employees.orgId, emp.orgId));

  const isPrivileged = emp.role === "owner" || emp.role === "admin";

  if (empCount <= 1) {
    return NextResponse.json({
      data: {
        step: isPrivileged ? "import" : "done",
        completed: false,
        orgId: emp.orgId,
      },
    });
  }

  // Check tokens
  const [{ count: tokCount }] = await db
    .select({ count: count() })
    .from(agentTokens)
    .where(eq(agentTokens.orgId, emp.orgId));

  if (tokCount === 0) {
    return NextResponse.json({
      data: {
        step: isPrivileged ? "tokens" : "done",
        completed: false,
        orgId: emp.orgId,
      },
    });
  }

  return NextResponse.json({
    data: { step: "done", completed: true, orgId: emp.orgId },
  });
}
