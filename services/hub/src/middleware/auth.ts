import { createMiddleware } from "hono/factory"
import { createAuth, type Bindings } from "../auth.ts"
import { verifyAgentJwt } from "../lib/jwt.ts"

export type AuthVariables = {
  userId: string | null
  userName: string | null
  userEmail: string | null
  agentId: string | null
  agentTenantId: string | null
}

export const sessionMiddleware = createMiddleware<{
  Bindings: Bindings
  Variables: AuthVariables
}>(async (c, next) => {
  c.set("agentId", null)
  c.set("agentTenantId", null)
  const auth = createAuth(c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  c.set("userId", session?.user?.id ?? null)
  c.set("userName", session?.user?.name ?? null)
  c.set("userEmail", session?.user?.email ?? null)
  await next()
})

export const requireSession = createMiddleware<{
  Bindings: Bindings
  Variables: AuthVariables
}>(async (c, next) => {
  if (!c.get("userId")) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401)
  }
  await next()
})

export const requireAgentJwt = createMiddleware<{
  Bindings: Bindings
  Variables: AuthVariables
}>(async (c, next) => {
  const authHeader = c.req.header("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Bearer token required" } }, 401)
  }
  const token = authHeader.slice(7)
  const payload = await verifyAgentJwt(token, c.env.JWT_SECRET)
  if (!payload) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Invalid token" } }, 401)
  }
  c.set("agentId", payload.sub)
  c.set("agentTenantId", payload.tenantId)
  c.set("userId", payload.userId)
  c.set("userName", null)
  c.set("userEmail", null)
  await next()
})
