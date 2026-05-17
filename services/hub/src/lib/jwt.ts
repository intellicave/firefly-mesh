import { SignJWT, jwtVerify } from "jose"
import { defaultScopes } from "./scopes.ts"

const AGENT_JWT_EXPIRY_SECONDS = 90 * 24 * 60 * 60

export type AgentJwtPayload = {
  sub: string
  tenantId: string
  userId: string
  /**
   * Scope claim added in M6 sprint 2026-05-17. Old JWTs (issued before that
   * sprint) do not contain this claim and fall back to defaultScopes() in
   * verifyAgentJwt — see rules.md §K1.
   */
  scope: string[]
}

/**
 * Sign an agent JWT.
 *
 * `scopes` is required. Callers should look up representation_boundaries
 * for the agent and pass the resulting array (or pass defaultScopes() if
 * they intentionally want the default set).
 */
export async function signAgentJwt(
  agentId: string,
  tenantId: string,
  userId: string,
  scopes: string[],
  secret: string,
): Promise<string> {
  const key = new TextEncoder().encode(secret)
  return new SignJWT({ tenantId, userId, scope: scopes, type: "agent" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(agentId)
    .setIssuedAt()
    .setExpirationTime(`${AGENT_JWT_EXPIRY_SECONDS}s`)
    .sign(key)
}

export async function verifyAgentJwt(
  token: string,
  secret: string,
): Promise<AgentJwtPayload | null> {
  try {
    const key = new TextEncoder().encode(secret)
    const { payload } = await jwtVerify(token, key)
    if (
      payload["type"] !== "agent" ||
      !payload.sub ||
      typeof payload["tenantId"] !== "string" ||
      typeof payload["userId"] !== "string"
    ) {
      return null
    }
    // Back-compat: JWTs issued before the M6 sprint don't carry the scope
    // claim. Treat them as having the default scope set so existing agents
    // keep working without re-pairing. New JWTs always include `scope`.
    const rawScope = payload["scope"]
    const scope = Array.isArray(rawScope)
      ? rawScope.filter((s): s is string => typeof s === "string")
      : defaultScopes()
    return {
      sub: payload.sub,
      tenantId: payload["tenantId"],
      userId: payload["userId"],
      scope,
    }
  } catch {
    return null
  }
}
