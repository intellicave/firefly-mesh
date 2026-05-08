import { SignJWT, jwtVerify } from "jose"

const AGENT_JWT_EXPIRY_SECONDS = 90 * 24 * 60 * 60

export type AgentJwtPayload = {
  sub: string
  tenantId: string
  userId: string
}

export async function signAgentJwt(
  agentId: string,
  tenantId: string,
  userId: string,
  secret: string,
): Promise<string> {
  const key = new TextEncoder().encode(secret)
  return new SignJWT({ tenantId, userId, type: "agent" })
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
    return {
      sub: payload.sub,
      tenantId: payload["tenantId"],
      userId: payload["userId"],
    }
  } catch {
    return null
  }
}
