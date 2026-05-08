import { createMiddleware } from "hono/factory"
import { createAuth, type Bindings } from "../auth.ts"

export type AuthVariables = {
  userId: string | null
  userName: string | null
  userEmail: string | null
}

export const sessionMiddleware = createMiddleware<{
  Bindings: Bindings
  Variables: AuthVariables
}>(async (c, next) => {
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
