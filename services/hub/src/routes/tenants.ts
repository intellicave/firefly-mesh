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
import { writeAudit, auditValues } from "../lib/audit.ts"

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

    // Round-32 H1 fix: tenant + owner-membership + owner-employee + audit
    // must land together. Previously these were 4 sequential awaits — if
    // the memberships insert succeeded but employees failed (D1 transient,
    // schema constraint, etc.), the tenant owner would have a membership
    // row but no employee profile, and every product-layer mutation would
    // permanently 403 NO_EMPLOYEE_PROFILE — unrecoverable without manual
    // DB repair. Now wrapped in db.batch (§Q4 sanctioned third site,
    // alongside invitations.ts + a2a-messages.ts) so partial failures
    // roll back to a fully-empty state and the caller can retry the slug
    // cleanly without orphan rows.
    //
    // NOTE: D1 batch is serialized-not-transactional. If the batch fails
    // mid-way, statements already committed remain — the failure surfaces
    // as a 500 to the caller. Per §Q4 the audit-only path can't catch
    // that, but the failure is loud (5xx, not silent corruption). True
    // tx-atomicity would need wrapping in a Worker-level retry+cleanup
    // (out of scope; documented as known limitation).
    const ownerName = c.get("userName") ?? c.get("userEmail") ?? "Owner"
    const ownerEmail = c.get("userEmail") ?? `owner+${userId}@local`
    const ownerEmployeeId = `emp_${nanoid(16)}`
    await db.batch([
      db.insert(schema.tenants).values({
        id: tenantId,
        slug,
        displayName,
        ownerId: userId,
        plan: "free",
        createdAt: now,
      }),
      db.insert(schema.memberships).values({
        tenantId,
        userId,
        role: "owner",
        joinedAt: now,
      }),
      // Product-layer bootstrap (sprint 2026-05-16): every tenant has at
      // least one owner employee — the creator. Without this, the
      // product-layer routes (employees / departments / projects) reject
      // every mutation because requireRole fails on missing profile.
      db.insert(schema.employees).values({
        id: ownerEmployeeId,
        orgId: tenantId,
        userId,
        name: ownerName,
        email: ownerEmail,
        role: "owner",
        status: "active",
        createdAt: now,
      }),
      // §Q4 sanctioned exception (third site): writeAudit is async-only
      // and can't be embedded in db.batch — use auditValues to build the
      // row directly. Co-commits with the three table inserts so a partial
      // failure rolls back to nothing-happened, matching the caller's
      // SLUG_TAKEN retry expectation.
      db.insert(schema.auditLog).values(
        auditValues({
          tenantId,
          actor: { type: "human", id: userId },
          action: "tenant.created",
          resource: { type: "tenant", id: tenantId },
          payload: { slug, displayName },
        }),
      ),
    ])

    // Round-42 H2 fix: project away `ownerId` (Better Auth user.id).
    // Returning it on the tenant response leaks the owner's cross-tenant
    // identity to every member who calls GET /api/tenants/:id — same
    // class of leak as the employees.userId case. organizations.ts
    // already follows this convention; aligning here.
    const [tenant] = await db
      .select({
        id: schema.tenants.id,
        slug: schema.tenants.slug,
        displayName: schema.tenants.displayName,
        plan: schema.tenants.plan,
        createdAt: schema.tenants.createdAt,
      })
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

  // Round-42 H2 fix: same projection — no ownerId.
  const [tenant] = await db
    .select({
      id: schema.tenants.id,
      slug: schema.tenants.slug,
      displayName: schema.tenants.displayName,
      plan: schema.tenants.plan,
      createdAt: schema.tenants.createdAt,
    })
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

  // Round-43 H fix (R42 sister miss): never emit raw Better Auth
  // `userId` on a tenant member list. Same cross-tenant identity
  // correlation vector as the employees H1 / tenants H2 / invitations
  // H3 fixes — user.id is stable across every tenant a user belongs
  // to, so listing it lets any tenant member match it against
  // another tenant's list. Name/email/image are still surfaced
  // because a member directory is a normal product expectation;
  // userId has zero legit frontend use case (the caller knows their
  // own userId from /api/auth/get-session and doesn't need others').
  const members = await db
    .select({
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

    // Email send is best-effort: the invitation row + token are already
    // persisted, so the inviter can copy the link manually if delivery fails
    // (e.g. Resend domain not yet verified, or running with a dummy key in dev).
    let emailDeliveredAt: string | null = null
    let emailError: string | null = null
    try {
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
      emailDeliveredAt = new Date().toISOString()
    } catch (err) {
      emailError = err instanceof Error ? err.message : "unknown send failure"
      // Round-3 security M2: don't log PII (invitee email) to the Workers
      // log stream — it'd be visible to anyone with account-level log
      // access. The invitation id + tenantId narrow it enough for ops.
      console.warn(
        `[invite] email send failed (invitation=${invId} tenant=${tenantId}): ${emailError}`,
      )
    }

    await writeAudit(db, {
      tenantId,
      actor: { type: "human", id: userId },
      action: "invitation.sent",
      resource: { type: "invitation", id: invId },
      payload: { email, role, emailDelivered: !!emailDeliveredAt },
    })

    const inviteLink = `${c.env.PWA_URL}/invite?token=${token}`
    return c.json(
      {
        data: {
          id: invId,
          email,
          role,
          expiresAt,
          inviteLink,
          emailDeliveredAt,
          emailError,
        },
      },
      201,
    )
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

  // Round-42 H3 fix: NEVER re-emit the invitation `token` after it was
  // returned once at POST /invite. The token is a bearer credential —
  // any admin (legit or compromised) listing pending invitations could
  // otherwise extract and exfiltrate tokens to bypass the invite flow.
  // Also project away `invitedBy` (Better Auth user.id) for the same
  // cross-tenant identity-leak reason as the employees and tenants
  // routes (H1 + H2 sister).
  const invs = await db
    .select({
      id: schema.invitations.id,
      email: schema.invitations.email,
      role: schema.invitations.role,
      expiresAt: schema.invitations.expiresAt,
      usedAt: schema.invitations.usedAt,
      createdAt: schema.invitations.createdAt,
    })
    .from(schema.invitations)
    .where(eq(schema.invitations.tenantId, tenantId))

  return c.json({ data: invs })
})

export { tenants as tenantsRouter }
