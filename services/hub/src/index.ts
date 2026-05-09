import { Hono } from "hono"
import { cors } from "hono/cors"
import { createAuth, type Bindings } from "./auth.ts"
import { sessionMiddleware } from "./middleware/auth.ts"
import { verifyAgentJwt } from "./lib/jwt.ts"
import { tenantsRouter } from "./routes/tenants.ts"
import { invitationsRouter } from "./routes/invitations.ts"
import { agentsRouter } from "./routes/agents.ts"
import { messagesRouter } from "./routes/messages.ts"
import { a2aRouter } from "./routes/a2a.ts"
import { meRouter } from "./routes/me.ts"
import { TenantHub } from "./durable-objects/TenantHub.ts"

export { TenantHub }

const app = new Hono<{ Bindings: Bindings }>()

app.use("*", (c, next) =>
  cors({
    origin: c.env.PWA_URL,
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })(c, next),
)

app.get("/", (c) => c.json({ status: "ok", version: "0.1.0" }))

// Better Auth — /api/auth/*
app.on(["GET", "POST"], "/api/auth/**", (c) => {
  const auth = createAuth(c.env)
  return auth.handler(c.req.raw)
})

// WebSocket endpoint — /ws?token=<agentJwt>
app.get("/ws", async (c) => {
  if (c.req.header("Upgrade") !== "websocket") {
    return c.json({ error: { code: "UPGRADE_REQUIRED", message: "WebSocket upgrade required" } }, 426)
  }

  const token =
    c.req.query("token") ?? c.req.header("Authorization")?.slice(7)

  if (!token) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "token required" } }, 401)
  }

  const payload = await verifyAgentJwt(token, c.env.JWT_SECRET)
  if (!payload) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Invalid token" } }, 401)
  }

  const doId = c.env.TENANT_HUB.idFromName(payload.tenantId)
  const stub = c.env.TENANT_HUB.get(doId)

  const modifiedRequest = new Request(c.req.url, {
    method: "GET",
    headers: {
      ...Object.fromEntries(c.req.raw.headers),
      "X-Verified-Agent-Id": payload.sub,
      "X-Verified-Tenant-Id": payload.tenantId,
      "X-Verified-User-Id": payload.userId,
    },
  })

  return stub.fetch(modifiedRequest)
})

// API routes
app.use("/api/*", sessionMiddleware)

app.route("/api/tenants", tenantsRouter)
app.route("/api/invite", invitationsRouter)
app.route("/api/agents", agentsRouter)
app.route("/api/messages", messagesRouter)
app.route("/api/a2a", a2aRouter)
app.route("/api/me", meRouter)

export default {
  fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx)
  },
} satisfies ExportedHandler<Bindings>
