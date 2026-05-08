// POST /api/token/batch — generate one-time tokens for multiple employees.
// Used by /onboarding/generate-tokens wizard step 3.
// Plain tokens returned ONLY in this response (never re-fetchable).

import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import { agentTokens, employees } from "@firefly-mesh/core/db/schema";
import { logAction } from "@firefly-mesh/core/audit/log";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { withRBAC } from "@/lib/middleware/withRBAC";
import { isUserSession } from "@/lib/middleware/types";

const Body = z.object({
  employeeIds: z.array(z.string().uuid()).min(1).max(500),
  expiresInDays: z.number().int().min(1).max(90).default(7),
});

function genToken(): { plain: string; hash: string } {
  const plain = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(plain).digest("base64url");
  return { plain, hash };
}

export const POST = withAuth(
  withOrgGuard(
    withRBAC(["owner", "admin"])(async (req: NextRequest, ctx) => {
      if (!isUserSession(ctx.session)) {
        return NextResponse.json(
          { error: { code: "FORBIDDEN" } },
          { status: 403 },
        );
      }

      const parsed = Body.safeParse(await req.json());
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

      // Verify all employees in same org
      const empRows = await db
        .select({ id: employees.id, name: employees.name })
        .from(employees)
        .where(
          and(
            inArray(employees.id, parsed.data.employeeIds),
            eq(employees.orgId, ctx.session.orgId),
          ),
        );

      if (empRows.length !== parsed.data.employeeIds.length) {
        const found = new Set(empRows.map((r) => r.id));
        const missing = parsed.data.employeeIds.filter((id) => !found.has(id));
        return NextResponse.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Some employees not in org",
              details: { missing },
            },
          },
          { status: 404 },
        );
      }

      const expiresAt = new Date(
        Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000,
      );

      // Create all tokens in a single transaction
      const result = await db.transaction(async (tx) => {
        const out: Array<{
          employeeId: string;
          employeeName: string;
          tokenId: string;
          plainToken: string;
          expiresAt: string;
        }> = [];

        for (const emp of empRows) {
          const { plain, hash } = genToken();
          const inserted = await tx
            .insert(agentTokens)
            .values({
              orgId: ctx.session.orgId,
              employeeId: emp.id,
              tokenHash: hash,
              status: "pending",
              expiresAt,
              createdBy: ctx.session.employeeId,
            })
            .returning({ id: agentTokens.id });

          const created = inserted[0];
          if (!created) throw new Error("Insert returned nothing");

          out.push({
            employeeId: emp.id,
            employeeName: emp.name,
            tokenId: created.id,
            plainToken: plain,
            expiresAt: expiresAt.toISOString(),
          });
        }
        return out;
      });

      await logAction({
        orgId: ctx.session.orgId,
        actorType: "human",
        actorId: ctx.session.userId,
        action: "token.batch_generated",
        resourceType: "agent_token",
        payload: { count: result.length },
      });

      return NextResponse.json({ data: result });
    }),
  ),
);
