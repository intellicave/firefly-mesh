// POST /api/skill/{id}/dry-run — sandbox-execute the skill against
// sample input. MVP runs ONE generateText call with the manifest's
// description as system prompt and the sampleInput stringified as user
// message. No real-task side effects are touched.

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import { skills } from "@firefly-mesh/core/db/schema";
import { generateTextHelper } from "@firefly-mesh/core/llm/helper";
import { logAction } from "@firefly-mesh/core/audit/log";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { isUserSession } from "@/lib/middleware/types";

function parseId(req: NextRequest): string | null {
  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  // .../api/skill/{id}/dry-run
  const id = segs[segs.length - 2];
  if (!id || !z.string().uuid().safeParse(id).success) return null;
  return id;
}

const Body = z.object({
  sampleInput: z.record(z.string(), z.unknown()).default({}),
});

export const POST = withAuth(
  withOrgGuard(async (req: NextRequest, ctx) => {
    if (!isUserSession(ctx.session)) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN" } },
        { status: 403 },
      );
    }
    const id = parseId(req);
    if (!id) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR" } },
        { status: 400 },
      );
    }
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", details: parsed.error.issues } },
        { status: 400 },
      );
    }

    const [skill] = await db
      .select()
      .from(skills)
      .where(and(eq(skills.id, id), eq(skills.orgId, ctx.session.orgId)))
      .limit(1);
    if (!skill) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND" } },
        { status: 404 },
      );
    }

    const manifest = skill.manifest;
    const prompt = [
      `You are dry-running the skill "${manifest.name}".`,
      `Description: ${manifest.description}`,
      ``,
      `Sample input:`,
      "```json",
      JSON.stringify(parsed.data.sampleInput, null, 2),
      "```",
      ``,
      `Respond with what the skill's primary output would be for this input.`,
    ].join("\n");

    const startedAt = Date.now();
    const result = await generateTextHelper(prompt);
    const latencyMs = Date.now() - startedAt;

    await logAction({
      orgId: ctx.session.orgId,
      actorType: "human",
      actorId: ctx.session.userId,
      action: "skill.dry_run",
      resourceType: "skill",
      resourceId: id,
      payload: { latencyMs, totalTokens: result.usage?.totalTokens },
    });

    return NextResponse.json({
      data: {
        output: result.text,
        tokenUsage: result.usage,
        latencyMs,
      },
    });
  }),
);
