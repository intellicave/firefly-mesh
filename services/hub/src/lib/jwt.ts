import { SignJWT, jwtVerify } from "jose"

const AGENT_JWT_EXPIRY_SECONDS = 90 * 24 * 60 * 60

// Round-3 security M5 fix: explicit issuer + audience so a JWT signed in one
// environment (staging) can't accidentally validate in another (prod) if the
// signing secret is ever copied or reused. The values are stable strings
// because the system has exactly one issuer (hub) and one audience (also
// hub) for now; if we ever split, change here + caller.
const JWT_ISSUER = "firefly-mesh"
const JWT_AUDIENCE = "firefly-mesh-hub"

export type AgentJwtPayload = {
  sub: string
  tenantId: string
  userId: string
  /**
   * Scope claim required for any product-tier mutation (write_kb_*,
   * submit_task, send_a2a_*, etc.). JWTs issued before the M6 sprint
   * (2026-05-17) do not contain this claim. Round-3 security C1 fix:
   * such JWTs now resolve to an EMPTY scope array — they can still
   * authenticate as the agent identity (passive operations: prekey
   * bundle fetch, heartbeat), but every product mutation is rejected
   * by enforceScope() until the agent re-pairs and receives a new JWT
   * with the current admin-configured scope set. Prior behaviour
   * (defaultScopes() fallback) silently bypassed any admin scope
   * revocation that happened between pairing and the upgrade.
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
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
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
    // Library enforces alg (HS256 pinned via signing path), exp, nbf, plus
    // our explicit issuer + audience match (security M5). algorithm
    // confusion / cross-environment replay both covered.
    const { payload } = await jwtVerify(token, key, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: ["HS256"],
    })
    if (
      payload["type"] !== "agent" ||
      !payload.sub ||
      typeof payload["tenantId"] !== "string" ||
      typeof payload["userId"] !== "string"
    ) {
      return null
    }
    // Round-3 security C1 fix: pre-M6 JWTs without `scope` claim resolve
    // to empty scope — they retain identity but lose all product-tier
    // privileges until the agent re-pairs. See AgentJwtPayload jsdoc.
    const rawScope = payload["scope"]
    const scope = Array.isArray(rawScope)
      ? rawScope.filter((s): s is string => typeof s === "string")
      : []
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
