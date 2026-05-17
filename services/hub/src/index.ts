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
import { organizationsRouter } from "./routes/organizations.ts"
import { employeesRouter } from "./routes/employees.ts"
import { departmentsRouter } from "./routes/departments.ts"
import { projectsRouter } from "./routes/projects.ts"
import { boundariesRouter } from "./routes/boundaries.ts"
import { agentTokensRouter } from "./routes/agent-tokens.ts"
import { a2aMessagesRouter } from "./routes/a2a-messages.ts"
import { tasksRouter } from "./routes/tasks.ts"
import { knowledgeRouter } from "./routes/knowledge.ts"
import { skillsRouter } from "./routes/skills.ts"
import { TenantHub } from "./durable-objects/TenantHub.ts"
import { runScheduled, pickTask } from "./cron/cleanup.ts"
import { rateLimitByIp } from "./middleware/rateLimit.ts"

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

// Better Auth — handles /api/auth/sign-up/email, /sign-in/email, /sign-out, /get-session, /callback/*, etc.
// Hono uses '*' as a splat that matches the remaining path (including slashes).
// Rate-limited by IP (RL_AUTH = 5 req / 10s) — credential-stuffing defence.
app.on(["GET", "POST"], "/api/auth/*", rateLimitByIp("RL_AUTH"), (c) => {
  const auth = createAuth(c.env, new URL(c.req.url).origin)
  return auth.handler(c.req.raw)
})

// WebSocket endpoint — Agent JWT (/ws?token=<jwt>) OR session cookie (/ws?tenantId=<id>)
app.get("/ws", async (c) => {
  if (c.req.header("Upgrade") !== "websocket") {
    return c.json({ error: { code: "UPGRADE_REQUIRED", message: "WebSocket upgrade required" } }, 426)
  }

  const token = c.req.query("token") ?? c.req.header("Authorization")?.slice(7)

  let kind: "agent" | "user"
  let tenantId: string
  let userId: string
  let agentId: string | null = null

  if (token) {
    const payload = await verifyAgentJwt(token, c.env.JWT_SECRET)
    if (!payload) {
      return c.json({ error: { code: "UNAUTHORIZED", message: "Invalid token" } }, 401)
    }
    kind = "agent"
    agentId = payload.sub
    tenantId = payload.tenantId
    userId = payload.userId
  } else {
    // PWA session-based connection
    const auth = createAuth(c.env, new URL(c.req.url).origin)
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    if (!session?.user?.id) {
      return c.json({ error: { code: "UNAUTHORIZED", message: "Session required" } }, 401)
    }
    const requestedTenant = c.req.query("tenantId")
    if (!requestedTenant) {
      return c.json({ error: { code: "BAD_REQUEST", message: "tenantId query required" } }, 400)
    }
    // Verify membership
    const { drizzle } = await import("drizzle-orm/d1")
    const { eq, and } = await import("drizzle-orm")
    const schema = await import("./db/schema.ts")
    const db = drizzle(c.env.DB, { schema })
    const member = await db
      .select({ role: schema.memberships.role })
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.tenantId, requestedTenant),
          eq(schema.memberships.userId, session.user.id),
        ),
      )
    if (member.length === 0) {
      return c.json({ error: { code: "NOT_FOUND", message: "Tenant not found" } }, 404)
    }
    kind = "user"
    tenantId = requestedTenant
    userId = session.user.id
  }

  const doId = c.env.TENANT_HUB.idFromName(tenantId)
  const tenantHub = c.env.TENANT_HUB.get(doId)

  const headers: Record<string, string> = {
    ...Object.fromEntries(c.req.raw.headers),
    "X-Verified-Kind": kind,
    "X-Verified-Tenant-Id": tenantId,
    "X-Verified-User-Id": userId,
  }
  if (agentId) headers["X-Verified-Agent-Id"] = agentId

  const modifiedRequest = new Request(c.req.url, { method: "GET", headers })
  return tenantHub.fetch(modifiedRequest)
})

// API routes
app.use("/api/*", sessionMiddleware)

app.route("/api/tenants", tenantsRouter)
app.route("/api/invite", invitationsRouter)
app.route("/api/agents", agentsRouter)
app.route("/api/messages", messagesRouter)
app.route("/api/a2a", a2aRouter)
app.route("/api/me", meRouter)
app.route("/api/organizations", organizationsRouter)
app.route("/api/employees", employeesRouter)
app.route("/api/departments", departmentsRouter)
app.route("/api/projects", projectsRouter)
app.route("/api/boundaries", boundariesRouter)
app.route("/api/agent-tokens", agentTokensRouter)
app.route("/api/a2a-messages", a2aMessagesRouter)
app.route("/api/tasks", tasksRouter)
app.route("/api/knowledge", knowledgeRouter)
app.route("/api/skills", skillsRouter)

export default {
  fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx)
  },
  async scheduled(controller, env, ctx) {
    const task = pickTask(controller.cron)
    ctx.waitUntil(
      runScheduled(task, env).then((r) => {
        console.log(`[cron ${controller.cron}] ${r.task}: ${r.outcome}`)
      }),
    )
  },
} satisfies ExportedHandler<Bindings>
