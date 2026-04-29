// GET /api/token — list tokens (admin only).
// POST /api/token — create one-time token for an employee (admin only).

import { randomBytes, createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import { agentTokens, employees } from "@firefly-mesh/core/db/schema";
import { audit } from "@firefly-mesh/core/audit/log";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { withRBAC } from "@/lib/middleware/withRBAC";
import { isUserSession } from "@/lib/middleware/types";

function generateToken(): { plain: string; hash: string } {
  // 32 random bytes → 43-char base64url string. Hash with SHA-256.
  const plain = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(plain).digest("base64url");
  return { plain, hash };
}

const ListQuery = z.object({
  status: z.enum(["pending", "consumed", "revoked", "expired"]).optional(),
  employeeId: z.string().uuid().optional(),
});

export const GET = withAuth(
  withOrgGuard(
    withRBAC(["owner", "admin"])(async (req: NextRequest, ctx) => {
      if (!isUserSession(ctx.session)) {
        return NextResponse.json(
          { error: { code: "FORBIDDEN", message: "User session required" } },
          { status: 403 },
        );
      }

      const url = req.nextUrl;
      const parsed = ListQuery.safeParse({
        status: url.searchParams.get("status") ?? undefined,
        employeeId: url.searchParams.get("employeeId") ?? undefined,
      });
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid query",
              details: parsed.error.issues,
            },
          },
          { status: 400 },
        );
      }

      const filters = [eq(agentTokens.orgId, ctx.session.orgId)];
      if (parsed.data.status) {
        filters.push(eq(agentTokens.status, parsed.data.status));
      }
      if (parsed.data.employeeId) {
        filters.push(eq(agentTokens.employeeId, parsed.data.employeeId));
      }

      const rows = await db
        .select({
          id: agentTokens.id,
          employeeId: agentTokens.employeeId,
          tokenHashSuffix: agentTokens.tokenHash, // truncated client-side
          status: agentTokens.status,
          expiresAt: agentTokens.expiresAt,
          consumedAt: agentTokens.consumedAt,
          revokedAt: agentTokens.revokedAt,
          createdAt: agentTokens.createdAt,
          createdBy: agentTokens.createdBy,
        })
        .from(agentTokens)
        .where(and(...filters))
        .orderBy(desc(agentTokens.createdAt))
        .limit(100);

      // Show only last 8 chars of hash so admin can identify rows
      const tokens = rows.map((r) => ({
        ...r,
        tokenHashSuffix: r.tokenHashSuffix.slice(-8),
      }));

      return NextResponse.json({ data: tokens });
    }),
  ),
);

const CreateBody = z.object({
  employeeId: z.string().uuid(),
  expiresInDays: z.number().int().min(1).max(90).default(7),
});

export const POST = withAuth(
  withOrgGuard(
    withRBAC(["owner", "admin"])(async (req: NextRequest, ctx) => {
      if (!isUserSession(ctx.session)) {
        return NextResponse.json(
          { error: { code: "FORBIDDEN", message: "User session required" } },
          { status: 403 },
        );
      }

      const parsed = CreateBody.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid input",
              details: parsed.error.issues,
            },
          },
          { status: 400 },
        );
      }

      // Verify employee exists in same org
      const [emp] = await db
        .select({ id: employees.id })
        .from(employees)
        .where(
          and(
            eq(employees.id, parsed.data.employeeId),
            eq(employees.orgId, ctx.session.orgId),
          ),
        )
        .limit(1);
      if (!emp) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Employee not found" } },
          { status: 404 },
        );
      }

      const { plain, hash } = generateToken();
      const expiresAt = new Date(
        Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000,
      );

      const [created] = await db
        .insert(agentTokens)
        .values({
          orgId: ctx.session.orgId,
          employeeId: parsed.data.employeeId,
          tokenHash: hash,
          status: "pending",
          expiresAt,
          createdBy: ctx.session.employeeId,
        })
        .returning({ id: agentTokens.id });

      if (!created) {
        return NextResponse.json(
          { error: { code: "INTERNAL_ERROR" } },
          { status: 500 },
        );
      }

      await audit.agent.activated(ctx.session.orgId, created.id, "token.issued");

      // Plain token returned ONCE — caller must save it.
      return NextResponse.json({
        data: {
          tokenId: created.id,
          plainToken: plain,
          expiresAt: expiresAt.toISOString(),
        },
      });
    }),
  ),
);
