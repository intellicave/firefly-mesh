import { Hono } from "hono"
import { createAuth, type Bindings } from "./auth.ts"
import { sessionMiddleware } from "./middleware/auth.ts"
import { tenantsRouter } from "./routes/tenants.ts"
import { invitationsRouter } from "./routes/invitations.ts"
import { TenantHub } from "./tenant-hub.ts"

const app = new Hono<{ Bindings: Bindings }>()

app.get("/", (c) => c.json({ status: "ok", version: "0.1.0" }))

// Better Auth — handles /api/auth/*
app.on(["GET", "POST"], "/api/auth/**", (c) => {
  const auth = createAuth(c.env)
  return auth.handler(c.req.raw)
})

// API routes — session context available on all
app.use("/api/*", sessionMiddleware)

app.route("/api/tenants", tenantsRouter)
app.route("/api/invite", invitationsRouter)

export default {
  fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx)
  },
} satisfies ExportedHandler<Bindings>

export { TenantHub }
