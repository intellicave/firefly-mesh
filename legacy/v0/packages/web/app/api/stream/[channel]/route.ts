// SSE handler — path-based channel + authenticated subscriber.
// GET /api/stream/{channel} — subscribes the connection to one bus topic.
//
// Auth precedence:
//   1) ?token= (agent JWT) — EventSource cannot set headers, so the SDK
//      sends the JWT in the URL. Token is verified on connect only;
//      the connection is not re-authed mid-stream.
//   2) Better Auth session cookie (web UI default).
//
// Channel ACL (deny by default):
//   inbox.{empId}        — caller must be that employee
//   user.{uid}           — caller must be that user (cookie path only)
//   audit.org.{orgId}    — caller must be owner/admin/auditor of that org
//   org.graph.{orgId}    — caller must be a member of that org
//   skill.{empId}        — caller must be that employee
//   knowledge.indexing.* — any org member (MVP; V2 narrows to scope)

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { bus } from "@firefly-mesh/core/events/bus";
import { auth } from "@firefly-mesh/core/auth/better-auth";
import { db } from "@firefly-mesh/core/db";
import { employees } from "@firefly-mesh/core/db/schema";
import { verifyAgentJWT } from "@firefly-mesh/core/auth/jwt";

export const dynamic = "force-dynamic";

const KEEPALIVE_INTERVAL_MS = 30_000;

interface Subject {
  userId?: string;
  employeeId: string;
  orgId: string;
  role?: "owner" | "admin" | "manager" | "employee" | "auditor";
}

async function resolveSubject(req: NextRequest): Promise<Subject | null> {
  const tokenQ = req.nextUrl.searchParams.get("token");
  if (tokenQ) {
    const payload = verifyAgentJWT(tokenQ);
    if (!payload) return null;
    return {
      employeeId: payload.emp,
      orgId: payload.org,
    };
  }
  const sess = await auth.api.getSession({ headers: req.headers });
  if (!sess?.user) return null;
  const [emp] = await db
    .select({
      id: employees.id,
      orgId: employees.orgId,
      role: employees.role,
    })
    .from(employees)
    .where(eq(employees.userId, sess.user.id))
    .limit(1);
  if (!emp) return null;
  return {
    userId: sess.user.id,
    employeeId: emp.id,
    orgId: emp.orgId,
    role: emp.role,
  };
}

function authorize(subject: Subject, channel: string): boolean {
  if (channel.startsWith("inbox.")) {
    return subject.employeeId === channel.slice("inbox.".length);
  }
  if (channel.startsWith("user.")) {
    return (
      subject.userId !== undefined && subject.userId === channel.slice("user.".length)
    );
  }
  if (channel.startsWith("audit.org.")) {
    const oid = channel.slice("audit.org.".length);
    if (subject.orgId !== oid) return false;
    return (
      subject.role === "owner" ||
      subject.role === "admin" ||
      subject.role === "auditor"
    );
  }
  if (channel.startsWith("org.graph.")) {
    return subject.orgId === channel.slice("org.graph.".length);
  }
  if (channel.startsWith("skill.")) {
    return subject.employeeId === channel.slice("skill.".length);
  }
  if (channel.startsWith("knowledge.indexing.")) {
    // MVP: any authenticated org member. V2 narrows by document scope.
    return true;
  }
  return false;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ channel: string }> },
) {
  const { channel: channelEncoded } = await ctx.params;
  const channel = decodeURIComponent(channelEncoded);
  if (!channel || channel.length > 200) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "channel required" } },
      { status: 400 },
    );
  }

  const subject = await resolveSubject(req);
  if (!subject) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED" } },
      { status: 401 },
    );
  }

  if (!authorize(subject, channel)) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: `Subject not allowed on channel '${channel}'`,
        },
      },
      { status: 403 },
    );
  }

  const encoder = new TextEncoder();
  let keepalive: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(":connected\n\n"));

      unsubscribe = bus.subscribe(channel, (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // controller closed — ignore
        }
      });

      keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(":keepalive\n\n"));
        } catch {
          // ignore
        }
      }, KEEPALIVE_INTERVAL_MS);
    },
    cancel() {
      if (keepalive) clearInterval(keepalive);
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}
