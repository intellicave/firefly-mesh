import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { drizzle } from "drizzle-orm/d1"
import { eq, and, desc, lt, inArray } from "drizzle-orm"
import { nanoid } from "nanoid"
import { z } from "zod"
import * as schema from "../db/schema.ts"
import type { Bindings } from "../auth.ts"
import type { AuthVariables } from "../middleware/auth.ts"
import { requireSession } from "../middleware/auth.ts"
import { sendInvitationEmail } from "../email/invitation.ts"

type Vars = AuthVariables & { userId: string }

const tenants = new Hono<{ Bindings: Bindings; Variables: Vars }>()

tenants.use("*", requireSession)

// GET /api/tenants — list tenants for current user
tenants.get("/", async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const userId = c.get("userId")

  const rows = await db
    .select({
      id: schema.tenants.id,
      slug: schema.tenants.slug,
      displayName: schema.tenants.displayName,
      plan: schema.tenants.plan,
      role: schema.memberships.role,
      createdAt: schema.tenants.createdAt,
    })
    .from(schema.memberships)
    .innerJoin(schema.tenants, eq(schema.memberships.tenantId, schema.tenants.id))
    .where(eq(schema.memberships.userId, userId))

  return c.json({ data: rows })
})

// POST /api/tenants — create tenant
tenants.post(
  "/",
  zValidator(
    "json",
    z.object({
      slug: z.string().min(3).max(32).regex(/^[a-z0-9-]+$/),
      displayName: z.string().min(1).max(50),
    }),
  ),
  async (c) => {
    const db = drizzle(c.env.DB, { schema })
    const userId = c.get("userId")
    const { slug, displayName } = c.req.valid("json")
    const now = new Date().toISOString()
    const tenantId = nanoid(21)

    const existing = await db
      .select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, slug))

    if (existing.length > 0) {
      return c.json({ error: { code: "SLUG_TAKEN", message: "Slug already taken" } }, 409)
    }

    await db.insert(schema.tenants).values({
      id: tenantId,
      slug,
      displayName,
      ownerId: userId,
      plan: "free",
      createdAt: now,
    })

    await db.insert(schema.memberships).values({
      tenantId,
      userId,
      role: "owner",
      joinedAt: now,
    })

    await db.insert(schema.auditLog).values({
      id: nanoid(21),
      tenantId,
      actorId: userId,
      action: "tenant.created",
      targetId: tenantId,
      createdAt: now,
    })

    const [tenant] = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))

    return c.json({ data: tenant }, 201)
  },
)

// GET /api/tenants/:id — tenant detail (must be member)
tenants.get("/:id", async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const userId = c.get("userId")
  const tenantId = c.req.param("id")

  const membership = await db
    .select()
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.tenantId, tenantId),
        eq(schema.memberships.userId, userId),
      ),
    )

  if (membership.length === 0) {
    return c.json({ error: { code: "NOT_FOUND", message: "Tenant not found" } }, 404)
  }

  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))

  return c.json({ data: tenant })
})

// GET /api/tenants/:id/members
tenants.get("/:id/members", async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const userId = c.get("userId")
  const tenantId = c.req.param("id")

  const isMember = await db
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.tenantId, tenantId),
        eq(schema.memberships.userId, userId),
      ),
    )

  if (isMember.length === 0) {
    return c.json({ error: { code: "NOT_FOUND", message: "Tenant not found" } }, 404)
  }

  const members = await db
    .select({
      userId: schema.memberships.userId,
      role: schema.memberships.role,
      joinedAt: schema.memberships.joinedAt,
      name: schema.user.name,
      email: schema.user.email,
      image: schema.user.image,
    })
    .from(schema.memberships)
    .innerJoin(schema.user, eq(schema.memberships.userId, schema.user.id))
    .where(eq(schema.memberships.tenantId, tenantId))

  return c.json({ data: members })
})

// POST /api/tenants/:id/invite
tenants.post(
  "/:id/invite",
  zValidator(
    "json",
    z.object({
      email: z.string().email(),
      role: z.enum(["admin", "member"]).default("member"),
    }),
  ),
  async (c) => {
    const db = drizzle(c.env.DB, { schema })
    const userId = c.get("userId")
    const tenantId = c.req.param("id")
    const { email, role } = c.req.valid("json")

    const membership = await db
      .select({ role: schema.memberships.role })
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.tenantId, tenantId),
          eq(schema.memberships.userId, userId),
        ),
      )

    if (membership.length === 0) {
      return c.json({ error: { code: "NOT_FOUND", message: "Tenant not found" } }, 404)
    }

    const callerRole = membership[0]?.role
    if (callerRole !== "owner" && callerRole !== "admin") {
      return c.json({ error: { code: "FORBIDDEN", message: "Insufficient permissions" } }, 403)
    }

    const [tenant] = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))

    const tokenBytes = crypto.getRandomValues(new Uint8Array(32))
    const token = Array.from(tokenBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")

    const now = new Date()
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const invId = nanoid(21)

    await db.insert(schema.invitations).values({
      id: invId,
      tenantId,
      email,
      token,
      role,
      expiresAt,
      invitedBy: userId,
      createdAt: now.toISOString(),
    })

    await sendInvitationEmail({
      apiKey: c.env.RESEND_API_KEY,
      fromEmail: c.env.RESEND_FROM_EMAIL,
      to: email,
      inviterName: c.get("userName") ?? "A team member",
      tenantName: tenant!.displayName,
      tenantSlug: tenant!.slug,
      token,
      appUrl: c.env.PWA_URL,
    })

    await db.insert(schema.auditLog).values({
      id: nanoid(21),
      tenantId,
      actorId: userId,
      action: "invitation.sent",
      targetId: invId,
      createdAt: now.toISOString(),
    })

    return c.json({ data: { id: invId, email, role, expiresAt } }, 201)
  },
)

// GET /api/tenants/:id/messages — session view of tenant messages
// Returns messages sent to or from any agent owned by the current user in this tenant.
// Cursor-based pagination: ?cursor=<createdAt>&limit=N (default 50, max 100).
tenants.get("/:id/messages", async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const userId = c.get("userId")
  const tenantId = c.req.param("id")

  const membership = await db
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.tenantId, tenantId),
        eq(schema.memberships.userId, userId),
      ),
    )

  if (membership.length === 0) {
    return c.json({ error: { code: "NOT_FOUND", message: "Tenant not found" } }, 404)
  }

  const cursor = c.req.query("cursor")
  const limitRaw = Number(c.req.query("limit") ?? "50")
  const limit = Math.min(Math.max(limitRaw, 1), 100)

  const myAgents = await db
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(
      and(
        eq(schema.agents.tenantId, tenantId),
        eq(schema.agents.ownerUserId, userId),
      ),
    )
  const myAgentIds = myAgents.map((a) => a.id)

  if (myAgentIds.length === 0) {
    return c.json({ data: [], meta: { nextCursor: null } })
  }

  const conditions = [
    eq(schema.messagesMeta.tenantId, tenantId),
    inArray(schema.messagesMeta.recipientAgentId, myAgentIds),
  ]
  if (cursor) {
    conditions.push(lt(schema.messagesMeta.createdAt, cursor))
  }

  const rows = await db
    .select({
      id: schema.messagesMeta.id,
      threadId: schema.messagesMeta.threadId,
      senderAgentId: schema.messagesMeta.senderAgentId,
      recipientAgentId: schema.messagesMeta.recipientAgentId,
      type: schema.messagesMeta.type,
      summary: schema.messagesMeta.summary,
      createdAt: schema.messagesMeta.createdAt,
    })
    .from(schema.messagesMeta)
    .where(and(...conditions))
    .orderBy(desc(schema.messagesMeta.createdAt))
    .limit(limit + 1)

  const hasMore = rows.length > limit
  const data = hasMore ? rows.slice(0, limit) : rows
  const nextCursor = hasMore ? data[data.length - 1]!.createdAt : null

  return c.json({ data, meta: { nextCursor } })
})

// GET /api/tenants/:id/invitations
tenants.get("/:id/invitations", async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const userId = c.get("userId")
  const tenantId = c.req.param("id")

  const membership = await db
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.tenantId, tenantId),
        eq(schema.memberships.userId, userId),
      ),
    )

  if (membership.length === 0) {
    return c.json({ error: { code: "NOT_FOUND", message: "Tenant not found" } }, 404)
  }

  const callerRole = membership[0]?.role
  if (callerRole !== "owner" && callerRole !== "admin") {
    return c.json({ error: { code: "FORBIDDEN", message: "Insufficient permissions" } }, 403)
  }

  const invs = await db
    .select()
    .from(schema.invitations)
    .where(eq(schema.invitations.tenantId, tenantId))

  return c.json({ data: invs })
})

export { tenants as tenantsRouter }
