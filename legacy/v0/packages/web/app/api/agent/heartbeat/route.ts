// POST /api/agent/heartbeat — agent reports liveness; updates lastSeenAt.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@firefly-mesh/core/db";
import { agents } from "@firefly-mesh/core/db/schema";
import { bus } from "@firefly-mesh/core/events/bus";

import { withAuth } from "@/lib/middleware/withAuth";
import { isAgentSession } from "@/lib/middleware/types";

export const POST = withAuth(async (_req, ctx) => {
  if (!isAgentSession(ctx.session)) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "Heartbeat requires agent token, not user session",
        },
      },
      { status: 403 },
    );
  }

  await db
    .update(agents)
    .set({ lastSeenAt: new Date() })
    .where(eq(agents.id, ctx.session.agentId));

  bus.publish(`org.graph.${ctx.session.orgId}`, "agent.heartbeat", {
    agentId: ctx.session.agentId,
    ts: new Date().toISOString(),
  });

  return NextResponse.json({ data: { ok: true } });
});
