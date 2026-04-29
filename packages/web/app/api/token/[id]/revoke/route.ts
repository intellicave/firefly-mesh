// POST /api/token/{id}/revoke — admin revokes pending or consumed token.
// If token already consumed by an agent, also flips agent to inactive.

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import { agentTokens, agents } from "@firefly-mesh/core/db/schema";
import { logAction } from "@firefly-mesh/core/audit/log";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { withRBAC } from "@/lib/middleware/withRBAC";
import { isUserSession } from "@/lib/middleware/types";

export const POST = withAuth(
  withOrgGuard(
    withRBAC(["owner", "admin"])(async (req: NextRequest, ctx) => {
      if (!isUserSession(ctx.session)) {
        return NextResponse.json(
          { error: { code: "FORBIDDEN" } },
          { status: 403 },
        );
      }

      // /api/token/{id}/revoke → id is second-to-last segment
      const segments = req.nextUrl.pathname.split("/");
      const id = segments[segments.length - 2];
      if (!id || !z.string().uuid().safeParse(id).success) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "id must be uuid" } },
          { status: 400 },
        );
      }

      const [tokenRow] = await db
        .select({
          id: agentTokens.id,
          status: agentTokens.status,
          agentId: agentTokens.agentId,
        })
        .from(agentTokens)
        .where(
          and(
            eq(agentTokens.id, id),
            eq(agentTokens.orgId, ctx.session.orgId),
          ),
        )
        .limit(1);

      if (!tokenRow) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND" } },
          { status: 404 },
        );
      }
      if (tokenRow.status === "revoked") {
        return NextResponse.json(
          { error: { code: "CONFLICT", message: "Already revoked" } },
          { status: 409 },
        );
      }

      await db
        .update(agentTokens)
        .set({ status: "revoked", revokedAt: new Date() })
        .where(eq(agentTokens.id, id));

      // If token was consumed by an agent, flip agent inactive
      if (tokenRow.agentId) {
        await db
          .update(agents)
          .set({ status: "inactive" })
          .where(eq(agents.id, tokenRow.agentId));
      }

      await logAction({
        orgId: ctx.session.orgId,
        actorType: "human",
        actorId: ctx.session.userId,
        action: "token.revoked",
        resourceType: "agent_token",
        resourceId: id,
      });

      return NextResponse.json({ data: { id, status: "revoked" } });
    }),
  ),
);
