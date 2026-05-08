import { Hono } from "hono"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import { nanoid } from "nanoid"
import * as schema from "../db/schema.ts"
import type { Bindings } from "../auth.ts"
import type { AuthVariables } from "../middleware/auth.ts"
import { requireSession } from "../middleware/auth.ts"

const invitations = new Hono<{ Bindings: Bindings; Variables: AuthVariables & { userId: string } }>()

// GET /api/invite/:token — validate invitation (public, pre-auth)
invitations.get("/:token", async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const token = c.req.param("token")

  const [inv] = await db
    .select({
      id: schema.invitations.id,
      email: schema.invitations.email,
      role: schema.invitations.role,
      expiresAt: schema.invitations.expiresAt,
      usedAt: schema.invitations.usedAt,
      tenantId: schema.invitations.tenantId,
      tenantName: schema.tenants.displayName,
      tenantSlug: schema.tenants.slug,
    })
    .from(schema.invitations)
    .innerJoin(schema.tenants, eq(schema.invitations.tenantId, schema.tenants.id))
    .where(eq(schema.invitations.token, token))

  if (!inv) {
    return c.json({ error: { code: "INVITATION_NOT_FOUND", message: "Invalid invitation" } }, 404)
  }

  if (inv.usedAt) {
    return c.json({ error: { code: "INVITATION_USED", message: "Invitation already used" } }, 422)
  }

  if (new Date(inv.expiresAt) < new Date()) {
    return c.json({ error: { code: "INVITATION_EXPIRED", message: "Invitation expired" } }, 422)
  }

  return c.json({
    data: {
      id: inv.id,
      email: inv.email,
      role: inv.role,
      expiresAt: inv.expiresAt,
      tenant: { id: inv.tenantId, name: inv.tenantName, slug: inv.tenantSlug },
    },
  })
})

// POST /api/invite/:token/accept — accept invitation (requires session)
invitations.post("/:token/accept", requireSession, async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const userId = c.get("userId")
  const token = c.req.param("token")
  const now = new Date()

  const [inv] = await db
    .select()
    .from(schema.invitations)
    .where(eq(schema.invitations.token, token))

  if (!inv) {
    return c.json({ error: { code: "INVITATION_NOT_FOUND", message: "Invalid invitation" } }, 404)
  }

  if (inv.usedAt) {
    return c.json({ error: { code: "INVITATION_USED", message: "Invitation already used" } }, 422)
  }

  if (new Date(inv.expiresAt) < now) {
    return c.json({ error: { code: "INVITATION_EXPIRED", message: "Invitation expired" } }, 422)
  }

  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, inv.tenantId))

  await db
    .update(schema.invitations)
    .set({ usedAt: now.toISOString() })
    .where(eq(schema.invitations.id, inv.id))

  await db
    .insert(schema.memberships)
    .values({
      tenantId: inv.tenantId,
      userId,
      role: inv.role,
      joinedAt: now.toISOString(),
    })
    .onConflictDoNothing()

  await db.insert(schema.auditLog).values({
    id: nanoid(21),
    tenantId: inv.tenantId,
    actorId: userId,
    action: "invitation.accepted",
    targetId: inv.id,
    createdAt: now.toISOString(),
  })

  return c.json({ data: { tenantId: inv.tenantId, tenantSlug: tenant!.slug } })
})

export { invitations as invitationsRouter }
