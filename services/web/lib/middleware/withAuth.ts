// withAuth — cookie session (web UI) OR Bearer JWT (agent endpoints).
// Per api.md §2.1, auth method auto-detected from request.

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { auth } from "@firefly-mesh/core/auth/better-auth";
import { db } from "@firefly-mesh/core/db";
import { employees } from "@firefly-mesh/core/db/schema";
import { verifyAgentJWT } from "@firefly-mesh/core/auth/jwt";

import type { AgentSession, BaseContext, Handler, UserSession } from "./types.ts";

export function withAuth<C extends BaseContext = BaseContext>(
  handler: Handler<C>,
): (req: NextRequest) => Promise<Response> {
  return async (req) => {
    const authHeader = req.headers.get("authorization");

    // Bearer JWT path (agent endpoints)
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      const payload = verifyAgentJWT(token);
      if (!payload) {
        return NextResponse.json(
          {
            error: {
              code: "INVALID_TOKEN",
              message: "Bearer token invalid or revoked",
            },
          },
          { status: 401 },
        );
      }
      const session: AgentSession = {
        agentId: payload.sub,
        employeeId: payload.emp,
        orgId: payload.org,
        scopes: payload.scopes,
      };
      return handler(req, { session, authMode: "agent" } as C);
    }

    // Cookie session path (web UI)
    const sess = await auth.api.getSession({ headers: req.headers });
    if (!sess?.user) {
      return NextResponse.json(
        { error: { code: "UNAUTHENTICATED", message: "Login required" } },
        { status: 401 },
      );
    }

    // Resolve employee record
    const rows = await db
      .select({
        id: employees.id,
        orgId: employees.orgId,
        role: employees.role,
      })
      .from(employees)
      .where(eq(employees.userId, sess.user.id))
      .limit(1);

    const [emp] = rows;
    if (!emp) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "User has no employee record in any org",
          },
        },
        { status: 403 },
      );
    }

    const session: UserSession = {
      userId: sess.user.id,
      employeeId: emp.id,
      orgId: emp.orgId,
      role: emp.role,
    };
    return handler(req, { session, authMode: "user" } as C);
  };
}
