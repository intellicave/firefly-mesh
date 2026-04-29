// Agent JWT (HS256) — separate from better-auth cookie sessions.
// Used by M1-3 withAuth for Bearer token routes (agent skill / MCP).

import { createHmac, timingSafeEqual } from "node:crypto";

export interface AgentJWTPayload {
  sub: string; // agent UUID
  emp: string; // owner employee UUID
  org: string; // org UUID
  scopes: string[];
  iat: number; // unix seconds
}

const HEADER_B64URL = Buffer.from(
  JSON.stringify({ alg: "HS256", typ: "JWT" }),
).toString("base64url");

function getSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET required for agent JWT");
  }
  return secret;
}

export function signAgentJWT(payload: AgentJWTPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const data = `${HEADER_B64URL}.${body}`;
  const sig = createHmac("sha256", getSecret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyAgentJWT(token: string): AgentJWTPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [, bodyB, sigB] = parts;
  if (!bodyB || !sigB) return null;

  const data = `${parts[0]}.${parts[1]}`;
  const expected = createHmac("sha256", getSecret())
    .update(data)
    .digest("base64url");

  // constant-time compare
  if (sigB.length !== expected.length) return null;
  const a = Buffer.from(sigB);
  const b = Buffer.from(expected);
  if (!timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(Buffer.from(bodyB, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
}
