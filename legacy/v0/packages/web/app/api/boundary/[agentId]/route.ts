// GET /api/boundary/{agentId} — read agent's scopes
// PUT /api/boundary/{agentId} — update scopes (admin only)
// Per api.md §4.3 + rules.md R8 (3-tier scope not bypassable).
// On scope change: invalidates the agent's existing JWTs by rotating
// the agent's status to inactive — agent must reactivate via M2-3.

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import {
  agents,
  representationBoundaries,
} from "@firefly-mesh/core/db/schema";
import { isValidScope } from "@firefly-mesh/core/boundary/catalog";
import { logAction } from "@firefly-mesh/core/audit/log";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { withRBAC } from "@/lib/middleware/withRBAC";
import { isUserSession } from "@/lib/middleware/types";

function parseAgentId(req: NextRequest): string | null {
  const segments = req.nextUrl.pathname.split("/");
  const agentId = segments[segments.length - 1];
  if (!agentId || !z.string().uuid().safeParse(agentId).success) return null;
  return agentId;
}

export const GET = withAuth(
  withOrgGuard(async (req, ctx) => {
    if (!isUserSession(ctx.session)) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN" } },
        { status: 403 },
      );
    }
    const agentId = parseAgentId(req);
    if (!agentId) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR" } },
        { status: 400 },
      );
    }

    // Verify agent belongs to caller's org
    const [agent] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(
        and(eq(agents.id, agentId), eq(agents.orgId, ctx.session.orgId)),
      )
      .limit(1);
    if (!agent) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND" } },
        { status: 404 },
      );
    }

    const [boundary] = await db
      .select({
        agentId: representationBoundaries.agentId,
        scopes: representationBoundaries.scopes,
        updatedAt: representationBoundaries.updatedAt,
      })
      .from(representationBoundaries)
      .where(eq(representationBoundaries.agentId, agentId))
      .limit(1);

    return NextResponse.json({
      data: boundary ?? { agentId, scopes: [], updatedAt: null },
    });
  }),
);

const PutBody = z.object({
  scopes: z.array(z.string()).max(50),
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
      const agentId = parseAgentId(req);
      if (!agentId) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR" } },
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

      // All requested scopes must be in catalog
      for (const s of parsed.data.scopes) {
        if (!isValidScope(s)) {
          return NextResponse.json(
            {
              error: {
                code: "VALIDATION_ERROR",
                message: `Unknown scope: ${s}`,
              },
            },
            { status: 400 },
          );
        }
      }

      // Verify agent in org
      const [agent] = await db
        .select({ id: agents.id })
        .from(agents)
        .where(
          and(eq(agents.id, agentId), eq(agents.orgId, ctx.session.orgId)),
        )
        .limit(1);
      if (!agent) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND" } },
          { status: 404 },
        );
      }

      // Upsert boundary row
      const [existing] = await db
        .select({ id: representationBoundaries.id })
        .from(representationBoundaries)
        .where(eq(representationBoundaries.agentId, agentId))
        .limit(1);

      if (existing) {
        await db
          .update(representationBoundaries)
          .set({ scopes: parsed.data.scopes, updatedAt: new Date() })
          .where(eq(representationBoundaries.agentId, agentId));
      } else {
        await db.insert(representationBoundaries).values({
          agentId,
          scopes: parsed.data.scopes,
        });
      }

      // Force agent to reactivate so new JWT carries new scopes
      await db
        .update(agents)
        .set({ status: "inactive" })
        .where(eq(agents.id, agentId));

      await logAction({
        orgId: ctx.session.orgId,
        actorType: "human",
        actorId: ctx.session.userId,
        action: "boundary.changed",
        resourceType: "agent",
        resourceId: agentId,
        payload: { scopes: parsed.data.scopes },
      });

      return NextResponse.json({
        data: { agentId, scopes: parsed.data.scopes },
      });
    }),
  ),
);
