// POST /api/a2a/send — agent sends an A2A message.
//
// Auth: Bearer JWT (agent session) + X-Agent-Signature header verified
// against agents.publicKey.
//
// Per api.md §4.3 — HITL flags computed from message type:
//   inform/sync:           sender auto, receiver auto (delivered)
//   request/commit/handoff: sender pending, receiver pending
//   escalate/block:         sender auto, receiver pending

import { NextRequest, NextResponse } from "next/server";

import { sendMessage, brokerErrorToHttp } from "@firefly-mesh/core/a2a/broker";
import { A2ASendRequest } from "@firefly-mesh/core/a2a/protocol";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { withScope } from "@/lib/middleware/withScope";
import { withSenderSignature } from "@/lib/middleware/withSenderSignature";
import { isAgentSession } from "@/lib/middleware/types";
import type { Handler, BaseContext } from "@/lib/middleware/types";

// Type → required scope per api §2.4 + rules.md R10
function scopeForType(type: string): string {
  switch (type) {
    case "inform":
    case "sync":
      return "send_a2a_inform";
    case "request":
      return "send_a2a_request";
    case "commit":
      return "send_a2a_commit";
    case "handoff":
      return "send_a2a_handoff";
    case "escalate":
    case "block":
      return "send_a2a_inform"; // any inform-class scope is sufficient
    default:
      return "send_a2a_inform";
  }
}

const handler: Handler = async (req, ctx) => {
  if (!isAgentSession(ctx.session)) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "/api/a2a/send requires Bearer agent token",
        },
      },
      { status: 403 },
    );
  }

  const parsed = A2ASendRequest.safeParse(await req.json());
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

  // Capture the signature the middleware verified — it's still in headers
  const senderSignature = req.headers.get("x-agent-signature") ?? "";

  const result = await sendMessage({
    orgId: ctx.session.orgId,
    senderAgentId: ctx.session.agentId,
    senderEmployeeId: ctx.session.employeeId,
    senderSignature,
    receiverAgentId: parsed.data.receiverAgentId,
    receiverEmployeeId: parsed.data.receiverEmployeeId,
    threadId: parsed.data.threadId,
    replyToMessageId: parsed.data.replyToMessageId,
    type: parsed.data.type,
    content: parsed.data.content,
    relatedTaskId: parsed.data.relatedTaskId,
  });

  if (!result.ok) {
    const mapped = brokerErrorToHttp(result.error);
    return NextResponse.json(
      { error: { code: mapped.code, message: mapped.message } },
      { status: mapped.status },
    );
  }

  return NextResponse.json({ data: result.data });
};

// We need to compute the scope dynamically based on body.type, which we
// can only see after parsing. So withScope is applied INSIDE the handler
// (after a body peek) — that's the only way to satisfy R8 (per-type
// scope check) without parsing the body twice.
export const POST = withAuth(
  withOrgGuard(
    withSenderSignature(async (req, ctx: BaseContext) => {
      // Peek type from body to pick scope
      const cloned = req.clone();
      let bodyType: string | undefined;
      try {
        const body = (await cloned.json()) as { type?: string };
        bodyType = body.type;
      } catch {
        // Let zod handle it inside handler
      }
      const required = scopeForType(bodyType ?? "inform");
      return withScope(required)(handler)(req, ctx);
    }),
  ),
);
