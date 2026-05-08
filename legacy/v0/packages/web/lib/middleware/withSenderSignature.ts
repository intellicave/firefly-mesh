// withSenderSignature — ed25519 verify for A2A endpoints.
// Per api.md §5.2 + rules.md R10: A2A messages must carry sender ed25519
// signature; server verifies using the agent's publicKey registered at
// /api/agent/activate. Verify fails → 401 SIGNATURE_FAILED + audit.

import { verify as edVerify } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@firefly-mesh/core/db";
import { agents } from "@firefly-mesh/core/db/schema";
import { audit } from "@firefly-mesh/core/audit/log";

import type { BaseContext, Handler } from "./types.ts";
import { isAgentSession } from "./types.ts";

/**
 * Wrap a handler that consumes an A2A message body. Reads X-Agent-Signature
 * header, verifies it against the agent's publicKey + canonical-JSON body.
 */
export function withSenderSignature<C extends BaseContext = BaseContext>(
  handler: Handler<C>,
): Handler<C> {
  return async (req, ctx) => {
    if (!isAgentSession(ctx.session)) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Signature route requires agent token",
          },
        },
        { status: 403 },
      );
    }

    const sigB64 = req.headers.get("x-agent-signature");
    if (!sigB64) {
      return NextResponse.json(
        {
          error: {
            code: "SIGNATURE_FAILED",
            message: "X-Agent-Signature header required",
          },
        },
        { status: 401 },
      );
    }

    // Snapshot body for verify, then re-attach for handler
    const bodyText = await req.text();

    // Lookup agent's registered publicKey
    const [agent] = await db
      .select({ publicKey: agents.publicKey })
      .from(agents)
      .where(eq(agents.id, ctx.session.agentId))
      .limit(1);

    if (!agent?.publicKey) {
      await audit.agent.activated(ctx.session.orgId, ctx.session.agentId, "verify_failed_no_pubkey");
      return NextResponse.json(
        {
          error: {
            code: "SIGNATURE_FAILED",
            message: "Agent has no registered public key",
          },
        },
        { status: 401 },
      );
    }

    // ed25519 verify
    const publicKey = Buffer.from(agent.publicKey, "base64");
    const signature = Buffer.from(sigB64, "base64");
    const message = Buffer.from(bodyText, "utf-8");

    const ok = edVerify(null, message, {
      key: publicKey,
      format: "der",
      type: "spki",
    }, signature);

    if (!ok) {
      return NextResponse.json(
        {
          error: {
            code: "SIGNATURE_FAILED",
            message: "ed25519 signature verification failed",
          },
        },
        { status: 401 },
      );
    }

    // Re-attach body to a fresh Request so handler can re-read JSON
    const reAttached = new NextRequest(req.url, {
      method: req.method,
      headers: req.headers,
      body: bodyText,
    });

    return handler(reAttached, ctx);
  };
}
