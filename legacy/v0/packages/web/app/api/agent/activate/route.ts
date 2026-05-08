// POST /api/agent/activate — consume one-time token, register publicKey,
// return long-lived agent JWT.
// Per api.md §4.9.

import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import {
  agentTokens,
  agents,
  representationBoundaries,
} from "@firefly-mesh/core/db/schema";
import { signAgentJWT } from "@firefly-mesh/core/auth/jwt";
import { defaultScopes } from "@firefly-mesh/core/boundary/catalog";
import { audit } from "@firefly-mesh/core/audit/log";

const Body = z.object({
  oneTimeToken: z.string().min(10),
  runtimeKind: z.enum([
    "openclaw",
    "hermes",
    "claude-code",
    "cursor",
    "claude-desktop",
    "other-mcp",
    "unknown",
  ]),
  runtimeVersion: z.string().optional(),
  protocolVersion: z.string().optional(),
  publicKey: z.string().min(20), // base64-encoded ed25519 SPKI DER
});

function hashToken(plain: string): string {
  return createHash("sha256").update(plain).digest("base64url");
}

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json());
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

  const { oneTimeToken, runtimeKind, runtimeVersion, protocolVersion, publicKey } =
    parsed.data;

  const tokenHash = hashToken(oneTimeToken);
  const [tokenRow] = await db
    .select()
    .from(agentTokens)
    .where(eq(agentTokens.tokenHash, tokenHash))
    .limit(1);

  if (!tokenRow) {
    return NextResponse.json(
      { error: { code: "INVALID_TOKEN", message: "Token not found" } },
      { status: 401 },
    );
  }

  if (tokenRow.status !== "pending") {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_TOKEN",
          message: `Token already ${tokenRow.status}`,
        },
      },
      { status: 401 },
    );
  }

  if (new Date(tokenRow.expiresAt).getTime() < Date.now()) {
    await db
      .update(agentTokens)
      .set({ status: "expired" })
      .where(eq(agentTokens.id, tokenRow.id));
    return NextResponse.json(
      { error: { code: "INVALID_TOKEN", message: "Token expired" } },
      { status: 401 },
    );
  }

  // Existing agent for this employee? Reactivate. Else create.
  const [existing] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(
      and(
        eq(agents.orgId, tokenRow.orgId),
        eq(agents.ownerEmployeeId, tokenRow.employeeId),
      ),
    )
    .limit(1);

  let agentId: string;
  if (existing) {
    await db
      .update(agents)
      .set({
        runtimeKind,
        runtimeMeta: { version: runtimeVersion, protocolVersion },
        publicKey,
        status: "active",
        activatedAt: new Date(),
        lastSeenAt: new Date(),
      })
      .where(eq(agents.id, existing.id));
    agentId = existing.id;
  } else {
    const inserted = await db
      .insert(agents)
      .values({
        orgId: tokenRow.orgId,
        ownerEmployeeId: tokenRow.employeeId,
        runtimeKind,
        runtimeMeta: { version: runtimeVersion, protocolVersion },
        publicKey,
        status: "active",
        activatedAt: new Date(),
        lastSeenAt: new Date(),
      })
      .returning({ id: agents.id });
    const created = inserted[0];
    if (!created) {
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Insert returned nothing" } },
        { status: 500 },
      );
    }
    agentId = created.id;
  }

  // Initialize default scopes if no boundary row yet
  const [boundary] = await db
    .select({ id: representationBoundaries.id })
    .from(representationBoundaries)
    .where(eq(representationBoundaries.agentId, agentId))
    .limit(1);

  const scopes = defaultScopes();
  if (!boundary) {
    await db.insert(representationBoundaries).values({ agentId, scopes });
  }

  // Mark token consumed
  await db
    .update(agentTokens)
    .set({
      status: "consumed",
      consumedAt: new Date(),
      agentId,
    })
    .where(eq(agentTokens.id, tokenRow.id));

  // Sign agent JWT
  const jwt = signAgentJWT({
    sub: agentId,
    emp: tokenRow.employeeId,
    org: tokenRow.orgId,
    scopes,
    iat: Math.floor(Date.now() / 1000),
  });

  await audit.agent.activated(tokenRow.orgId, agentId, runtimeKind);

  return NextResponse.json({
    data: {
      agentId,
      jwt,
      scopes,
    },
  });
}
