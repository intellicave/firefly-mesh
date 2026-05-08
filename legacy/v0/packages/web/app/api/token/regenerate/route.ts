// POST /api/token/regenerate?employeeId={id} — admin revokes any existing
// pending tokens for an employee + creates a new one in a transaction.
// Useful when employee loses their token before activating.

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
  expiresInDays: z.number().int().min(1).max(90).default(7),
});

export const POST = withAuth(
  withOrgGuard(
    withRBAC(["owner", "admin"])(async (req: NextRequest, ctx) => {
      if (!isUserSession(ctx.session)) {
        return NextResponse.json(
          { error: { code: "FORBIDDEN" } },
          { status: 403 },
        );
      }

      const employeeId = req.nextUrl.searchParams.get("employeeId");
      if (!employeeId || !z.string().uuid().safeParse(employeeId).success) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "?employeeId=<uuid> required",
            },
          },
          { status: 400 },
        );
      }

      // Optional body (default expiresInDays=7)
      let expiresInDays = 7;
      try {
        const body = await req.json();
        const parsed = Body.safeParse(body);
        if (parsed.success) expiresInDays = parsed.data.expiresInDays;
      } catch {
        // empty body OK, use default
      }

      // Verify employee in org
      const [emp] = await db
        .select({ id: employees.id })
        .from(employees)
        .where(
          and(
            eq(employees.id, employeeId),
            eq(employees.orgId, ctx.session.orgId),
          ),
        )
        .limit(1);
      if (!emp) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND" } },
          { status: 404 },
        );
      }

      const plain = randomBytes(32).toString("base64url");
      const hash = createHash("sha256").update(plain).digest("base64url");
      const expiresAt = new Date(
        Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
      );

      // Transaction: revoke all pending + insert new
      const result = await db.transaction(async (tx) => {
        const pending = await tx
          .select({ id: agentTokens.id })
          .from(agentTokens)
          .where(
            and(
              eq(agentTokens.employeeId, employeeId),
              eq(agentTokens.orgId, ctx.session.orgId),
              eq(agentTokens.status, "pending"),
            ),
          );

        if (pending.length > 0) {
          await tx
            .update(agentTokens)
            .set({ status: "revoked", revokedAt: new Date() })
            .where(
              inArray(
                agentTokens.id,
                pending.map((p) => p.id),
              ),
            );
        }

        const inserted = await tx
          .insert(agentTokens)
          .values({
            orgId: ctx.session.orgId,
            employeeId,
            tokenHash: hash,
            status: "pending",
            expiresAt,
            createdBy: ctx.session.employeeId,
          })
          .returning({ id: agentTokens.id });

        return { revokedCount: pending.length, newTokenId: inserted[0]!.id };
      });

      await logAction({
        orgId: ctx.session.orgId,
        actorType: "human",
        actorId: ctx.session.userId,
        action: "token.regenerated",
        resourceType: "agent_token",
        resourceId: result.newTokenId,
        payload: {
          employeeId,
          revokedCount: result.revokedCount,
        },
      });

      return NextResponse.json({
        data: {
          tokenId: result.newTokenId,
          plainToken: plain,
          expiresAt: expiresAt.toISOString(),
          revokedPrevious: result.revokedCount,
        },
      });
    }),
  ),
);
