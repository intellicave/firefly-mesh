// POST /api/knowledge/search — RAG search across caller-visible scopes.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { searchKnowledge } from "@firefly-mesh/core/knowledge/search";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { isUserSession } from "@/lib/middleware/types";

const Body = z.object({
  query: z.string().min(1).max(2000),
  scope: z
    .enum(["company", "department", "personal", "all"])
    .default("all"),
  topK: z.number().int().min(1).max(20).default(5),
});

export const POST = withAuth(
  withOrgGuard(async (req: NextRequest, ctx) => {
    if (!isUserSession(ctx.session) && !("agentId" in ctx.session)) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN" } },
        { status: 403 },
      );
    }
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", details: parsed.error.issues } },
        { status: 400 },
      );
    }

    const auditorOverride =
      "role" in ctx.session && ctx.session.role === "auditor";

    const hits = await searchKnowledge({
      orgId: ctx.session.orgId,
      employeeId: ctx.session.employeeId,
      auditorOverride,
      query: parsed.data.query,
      topK: parsed.data.topK,
      scope: parsed.data.scope,
    });

    return NextResponse.json({ data: { chunks: hits } });
  }),
);
