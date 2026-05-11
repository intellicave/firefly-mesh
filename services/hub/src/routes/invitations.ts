import { Hono } from "hono"
import { drizzle } from "drizzle-orm/d1"
import { eq, and, isNull, gt } from "drizzle-orm"
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
//
// Concurrency note (P0 fix): D1 has no SELECT ... FOR UPDATE, so the previous
// read-then-update flow had a TOCTOU window where two concurrent accepts of
// the same token both passed the usedAt check, both wrote membership rows
// (one swallowed by onConflictDoNothing) and both inserted audit_log entries.
// We now consume the invitation via a single compare-and-swap UPDATE guarded
// by `used_at IS NULL`. Only the winning request sees `changes === 1` and
// proceeds to membership + audit; the loser returns the precise failure reason
// (USED vs EXPIRED vs CONFLICT-retry).
//
// Email-ownership note: we require the session user's email to match inv.email
// — otherwise any authenticated user who obtains the token could accept an
// invite meant for someone else and inherit the invited role in that tenant.
invitations.post("/:token/accept", requireSession, async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const userId = c.get("userId")
  const userEmail = c.get("userEmail")
  const token = c.req.param("token")
  const now = new Date()

  const [inv] = await db
    .select()
    .from(schema.invitations)
    .where(eq(schema.invitations.token, token))

  if (!inv) {
    return c.json({ error: { code: "INVITATION_NOT_FOUND", message: "Invalid invitation" } }, 404)
  }

  if (new Date(inv.expiresAt) < now) {
    return c.json({ error: { code: "INVITATION_EXPIRED", message: "Invitation expired" } }, 422)
  }

  // Email-ownership: only the addressee may consume their invite. Compare
  // case-insensitively because Better Auth lowercases on storage but client
  // input may have varied case.
  if (
    !userEmail ||
    userEmail.toLowerCase() !== inv.email.toLowerCase()
  ) {
    return c.json(
      {
        error: {
          code: "INVITATION_EMAIL_MISMATCH",
          message: "This invitation was sent to a different email address",
        },
      },
      403,
    )
  }

  // Atomic claim — the WHERE clause is the lock. We additionally re-assert
  // expiresAt > now inside the SQL to defend against a sleep-on-the-wire race
  // where the row expired between SELECT and UPDATE.
  const claim = await db
    .update(schema.invitations)
    .set({ usedAt: now.toISOString() })
    .where(
      and(
        eq(schema.invitations.id, inv.id),
        isNull(schema.invitations.usedAt),
        gt(schema.invitations.expiresAt, now.toISOString()),
      ),
    )

  const changes = (claim.meta as { changes?: number } | undefined)?.changes ?? 0
  if (changes === 0) {
    // Either someone else won the race, the row expired in the window, or some
    // transient inconsistency. Re-read to give the caller the precise reason.
    const [fresh] = await db
      .select({ usedAt: schema.invitations.usedAt, expiresAt: schema.invitations.expiresAt })
      .from(schema.invitations)
      .where(eq(schema.invitations.id, inv.id))
    if (fresh?.usedAt) {
      return c.json({ error: { code: "INVITATION_USED", message: "Invitation already used" } }, 422)
    }
    if (fresh && new Date(fresh.expiresAt) < now) {
      return c.json({ error: { code: "INVITATION_EXPIRED", message: "Invitation expired" } }, 422)
    }
    // Row is unused and unexpired but CAS didn't take — caller should retry.
    return c.json(
      { error: { code: "CONFLICT", message: "Concurrent acceptance, please retry" } },
      409,
    )
  }

  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, inv.tenantId))

  // Tenant deleted between CAS win and this read (rare but possible). The CAS
  // already burned the invitation, so we must release it before erroring —
  // otherwise the user holds a dead token they can never use again.
  if (!tenant) {
    await db
      .update(schema.invitations)
      .set({ usedAt: null })
      .where(
        and(
          eq(schema.invitations.id, inv.id),
          eq(schema.invitations.usedAt, now.toISOString()),
        ),
      )
    return c.json(
      { error: { code: "TENANT_NOT_FOUND", message: "The inviting team no longer exists" } },
      404,
    )
  }

  // From here on we are the sole winner of the CAS. Group the membership +
  // audit writes into one D1 batch so they are atomically all-or-nothing —
  // otherwise a partial failure (membership written but audit missing, or
  // vice versa) would leave the system in an inconsistent state that we
  // couldn't fully roll back without risking double-grant on retry.
  try {
    await db.batch([
      db
        .insert(schema.memberships)
        .values({
          tenantId: inv.tenantId,
          userId,
          role: inv.role,
          joinedAt: now.toISOString(),
        })
        .onConflictDoNothing(),
      db.insert(schema.auditLog).values({
        id: nanoid(21),
        tenantId: inv.tenantId,
        actorId: userId,
        action: "invitation.accepted",
        targetId: inv.id,
        createdAt: now.toISOString(),
      }),
    ])
  } catch (err) {
    // Batch failed atomically — no membership row, no audit row. Release the
    // CAS so the user can retry. Guard with `usedAt = now` so we only undo
    // OUR claim (otherwise a concurrent winner that already cleaned up could
    // be un-used by accident).
    const release = await db
      .update(schema.invitations)
      .set({ usedAt: null })
      .where(
        and(
          eq(schema.invitations.id, inv.id),
          eq(schema.invitations.usedAt, now.toISOString()),
        ),
      )
    const released = (release.meta as { changes?: number } | undefined)?.changes ?? 0
    if (released === 0) {
      // Rollback couldn't release the CAS (D1 instance flaky, or another
      // request already cleared it). Invitation is now permanently burned
      // with no membership + no audit. Surface this loudly for ops.
      console.error(
        `[invite-accept] CAS rollback failed for invitation ${inv.id} after batch error — ` +
          `invitation is burned without membership/audit. Manual recovery may be needed.`,
      )
    }
    throw err
  }

  return c.json({ data: { tenantId: inv.tenantId, tenantSlug: tenant.slug } })
})

export { invitations as invitationsRouter }
