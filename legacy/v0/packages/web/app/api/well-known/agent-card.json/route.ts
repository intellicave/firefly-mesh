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
    endpoints: {
      a2a: "/api/a2a/send",
      auth: "/api/agent/activate",
      heartbeat: "/api/agent/heartbeat",
      tasks: "/api/task/list",
      knowledge: "/api/knowledge/search",
      skills: "/api/skill/loaded",
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
      tokenEndpoint: "/api/agent/activate",
    },
    signaturePublicKey,
  };

  return NextResponse.json(card, {
    headers: {
      "cache-control": "public, max-age=300",
    },
  });
}
