// GET /.well-known/agent-card.json — Google A2A v1.2 agent card (api §4.10).
// Public, no auth.
//
// Note: route lives at /api/well-known/... in Next.js routing then a
// rewrite or a top-level alias maps /.well-known/* → /api/well-known/*
// (Next.js doesn't allow leading-dot folders). Configure via
// next.config.ts rewrites.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PROTOCOL_VERSION = "1.2";

export async function GET() {
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

  // Server signature pubkey will be populated when M4 ed25519 keypair
  // generation runs at first boot (next sub-task). For now declare the
  // field so the schema validates — value is empty until generated.
  const signaturePublicKey = process.env.FIREFLY_MESH_SERVER_PUBKEY ?? "";

  const card = {
    $schema: "https://a2a-protocol.org/schemas/v1.2/agent-card.json",
    version: PROTOCOL_VERSION,
    name: "firefly-mesh",
    displayName: "Firefly Mesh — Org Collaboration Hub",
    description: "Bring your own agent. We bring the org.",
    url: baseUrl,
    // Sprint B B.1: paths advertised here are the **external contract**
    // read by other agents performing A2A discovery. Updated to hub's
    // real V1 paths after the v0 FS routes were deleted in B.1:
    //   - a2a: hub partner-receive endpoint (POST /api/a2a/message)
    //   - auth: agent registration / pairing (POST /api/agents/register)
    //   - heartbeat removed — hub has no explicit heartbeat; lastSeenAt
    //     is updated server-side when an agent posts to /api/messages
    //   - tasks: hub task list (GET /api/tasks)
    //   - knowledge: hub search (GET /api/knowledge/search)
    endpoints: {
      a2a: "/api/a2a/message",
      auth: "/api/agents/register",
      tasks: "/api/tasks",
      knowledge: "/api/knowledge/search",
    },
    capabilities: ["a2a-v1.2", "agentskills-v1", "mcp-bridge"],
    messageTypes: [
      "inform",
      "sync",
      "request",
      "commit",
      "handoff",
      "escalate",
      "block",
    ],
    auth: {
      scheme: "Bearer",
      tokenEndpoint: "/api/agents/register",
    },
    signaturePublicKey,
  };

  return NextResponse.json(card, {
    headers: {
      "cache-control": "public, max-age=300",
    },
  });
}
