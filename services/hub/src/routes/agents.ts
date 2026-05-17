import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { drizzle } from "drizzle-orm/d1"
import { eq, and, gt, isNull, count, asc } from "drizzle-orm"
import { nanoid } from "nanoid"
import { z } from "zod"
import * as schema from "../db/schema.ts"
import type { Bindings } from "../auth.ts"
import type { AuthVariables } from "../middleware/auth.ts"
import { requireSession, requireAgentJwt, sessionMiddleware } from "../middleware/auth.ts"
import { rateLimitByIp } from "../middleware/rateLimit.ts"
import { signAgentJwt } from "../lib/jwt.ts"
import { defaultScopes } from "../lib/scopes.ts"
import { writeAudit } from "../lib/audit.ts"

const agents = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()

// POST /api/agents/pair-init — skill creates a pairing code (public).
// Rate-limited by IP (RL_PAIR = 10 req / 60s) to defeat pairing-code
// enumeration probes.
agents.post(
  "/pair-init",
  rateLimitByIp("RL_PAIR"),
  zValidator("json", z.object({ deviceName: z.string().min(1).max(100) })),
  async (c) => {
    const { deviceName } = c.req.valid("json")
    const db = drizzle(c.env.DB, { schema })

    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    const bytes = crypto.getRandomValues(new Uint8Array(6))
    const code = Array.from(bytes, (b) => chars[b % chars.length]).join("")

    const now = new Date()
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString()

    await db.insert(schema.devicePairingCodes).values({
      code,
      deviceName,
      expiresAt,
    })

    return c.json({
      data: {
        code,
        expiresAt,
        confirmUrl: `${c.env.PWA_URL}/connect?code=${code}`,
      },
    })
  },
)

// GET /api/agents/pair-status?code=X — skill polls pairing status.
// Same rate-limit bucket as pair-init: an attacker who can't burn the
// init quota also can't burn poll-status to enumerate active codes.
agents.get("/pair-status", rateLimitByIp("RL_PAIR"), sessionMiddleware, async (c) => {
  const code = c.req.query("code")
  if (!code) {
    return c.json({ error: { code: "MISSING_CODE", message: "code query param required" } }, 400)
  }

  const db = drizzle(c.env.DB, { schema })
  const now = new Date().toISOString()

  const [row] = await db
    .select()
    .from(schema.devicePairingCodes)
    .where(
      and(
        eq(schema.devicePairingCodes.code, code),
        gt(schema.devicePairingCodes.expiresAt, now),
      ),
    )

  if (!row) {
    return c.json({ error: { code: "CODE_NOT_FOUND", message: "Invalid or expired code" } }, 404)
  }

  return c.json({
    data: {
      code: row.code,
      deviceName: row.deviceName,
      claimed: !!row.claimedAt,
      tenantId: row.tenantId,
      expiresAt: row.expiresAt,
    },
  })
})

// POST /api/agents/pair-confirm — PWA browser confirms pairing
agents.post(
  "/pair-confirm",
  sessionMiddleware,
  requireSession,
  zValidator(
    "json",
    z.object({
      code: z.string().length(6),
      tenantId: z.string(),
    }),
  ),
  async (c) => {
    const { code, tenantId } = c.req.valid("json")
    const userId = c.get("userId") as string
    const db = drizzle(c.env.DB, { schema })
    const now = new Date()

    const [pairing] = await db
      .select()
      .from(schema.devicePairingCodes)
      .where(
        and(
          eq(schema.devicePairingCodes.code, code),
          gt(schema.devicePairingCodes.expiresAt, now.toISOString()),
        ),
      )

    if (!pairing) {
      return c.json({ error: { code: "CODE_NOT_FOUND", message: "Invalid or expired code" } }, 404)
    }

    if (pairing.claimedAt) {
      return c.json({ error: { code: "CODE_ALREADY_CLAIMED", message: "Code already claimed" } }, 409)
    }

    // Verify user is member of the tenant
    const [membership] = await db
      .select()
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.tenantId, tenantId),
          eq(schema.memberships.userId, userId),
        ),
      )

    if (!membership) {
      return c.json({ error: { code: "NOT_MEMBER", message: "Not a member of this tenant" } }, 403)
    }

    await db
      .update(schema.devicePairingCodes)
      .set({ claimedAt: now.toISOString(), userId, tenantId })
      .where(eq(schema.devicePairingCodes.code, code))

    return c.json({ data: { code, confirmed: true } })
  },
)

// POST /api/agents/register — skill registers agent + uploads X3DH bundle + gets JWT
//
// M5 sprint 2026-05-17 added optional runtimeKind / runtimeMeta input fields
// and internal wiring to populate agents.owner_employee_id from the current
// user's employee record. Also creates a representation_boundaries row with
// default scopes and includes those scopes in the issued JWT (M6). The
// response shape ({ agentId, token, tenantId }) is unchanged.
agents.post(
  "/register",
  zValidator(
    "json",
    z.object({
      code: z.string().length(6),
      displayName: z.string().min(1).max(50),
      type: z.enum(["skill", "bot"]).default("skill"),
      identityKey: z.string(),
      identityKeyX: z.string(),
      signedPrekey: z.string(),
      signedPrekeySignature: z.string(),
      oneTimePrekeys: z
        .array(z.object({ keyId: z.number().int(), publicKey: z.string() }))
        .min(1)
        .max(100),
      // M5: optional runtime metadata
      runtimeKind: z
        .enum([
          "openclaw",
          "hermes",
          "claude-code",
          "cursor",
          "claude-desktop",
          "other-mcp",
          "unknown",
        ])
        .optional(),
      runtimeMeta: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
  async (c) => {
    const {
      code,
      displayName,
      type,
      identityKey,
      identityKeyX,
      signedPrekey,
      signedPrekeySignature,
      oneTimePrekeys,
      runtimeKind,
      runtimeMeta,
    } = c.req.valid("json")
    const db = drizzle(c.env.DB, { schema })
    const now = new Date()

    const [pairing] = await db
      .select()
      .from(schema.devicePairingCodes)
      .where(
        and(
          eq(schema.devicePairingCodes.code, code),
          gt(schema.devicePairingCodes.expiresAt, now.toISOString()),
        ),
      )

    if (!pairing || !pairing.claimedAt || !pairing.tenantId || !pairing.userId) {
      return c.json(
        { error: { code: "CODE_NOT_CONFIRMED", message: "Code not yet confirmed by browser" } },
        422,
      )
    }

    // M5: resolve the employee profile for this user in this tenant. May be
    // null if the user has a membership but no employee record yet (only
    // possible for legacy tenants that pre-date the tenants-bootstrap commit
    // from sprint 2026-05-16). Modern flow always has an employee record.
    const [emp] = await db
      .select({ id: schema.employees.id })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.orgId, pairing.tenantId),
          eq(schema.employees.userId, pairing.userId),
        ),
      )
    const ownerEmployeeId = emp?.id ?? null

    const agentId = nanoid(21)

    await db.insert(schema.agents).values({
      id: agentId,
      tenantId: pairing.tenantId,
      ownerUserId: pairing.userId,
      ownerEmployeeId,
      displayName,
      type,
      identityKey,
      identityKeyX,
      signedPrekey,
      signedPrekeySig: signedPrekeySignature,
      runtimeKind: runtimeKind ?? "unknown",
      runtimeMeta: runtimeMeta ? JSON.stringify(runtimeMeta) : null,
      activatedAt: now.toISOString(),
      createdAt: now.toISOString(),
    })

    await db.insert(schema.oneTimePrekeys).values(
      oneTimePrekeys.map((opk) => ({
        id: nanoid(21),
        agentId,
        keyId: opk.keyId,
        publicKey: opk.publicKey,
        createdAt: now.toISOString(),
      })),
    )

    // M6: create the representation_boundaries row with default scopes.
    // The JWT below carries the same scopes as a `scope` claim.
    const scopes = defaultScopes()
    await db.insert(schema.representationBoundaries).values({
      id: nanoid(21),
      agentId,
      scopes: JSON.stringify(scopes),
      updatedAt: now.toISOString(),
    })

    // Invalidate the pairing code by expiring it
    await db
      .update(schema.devicePairingCodes)
      .set({ agentId, expiresAt: now.toISOString() })
      .where(eq(schema.devicePairingCodes.code, code))

    await writeAudit(db, {
      tenantId: pairing.tenantId,
      actor: { type: "human", id: pairing.userId },
      action: "agent.registered",
      resource: { type: "agent", id: agentId },
      payload: {
        deviceName: pairing.deviceName,
        runtimeKind: runtimeKind ?? "unknown",
        ownerEmployeeId,
      },
    })

    const token = await signAgentJwt(
      agentId,
      pairing.tenantId,
      pairing.userId,
      scopes,
      c.env.JWT_SECRET,
    )

    return c.json({ data: { agentId, token, tenantId: pairing.tenantId } }, 201)
  },
)

const LOW_PREKEY_THRESHOLD = 10

// GET /api/agents/:agentId/prekey-bundle — fetch X3DH bundle + consume one OPK
agents.get("/:agentId/prekey-bundle", requireAgentJwt, async (c) => {
  const agentId = c.req.param("agentId")
  const callerTenantId = c.get("agentTenantId") as string
  const db = drizzle(c.env.DB, { schema })

  const [agent] = await db
    .select()
    .from(schema.agents)
    .where(
      and(
        eq(schema.agents.id, agentId),
        eq(schema.agents.tenantId, callerTenantId),
      ),
    )

  if (!agent) {
    return c.json({ error: { code: "AGENT_NOT_FOUND", message: "Agent not found" } }, 404)
  }

  if (!agent.identityKey || !agent.identityKeyX || !agent.signedPrekey || !agent.signedPrekeySig) {
    return c.json(
      { error: { code: "AGENT_NOT_PROVISIONED", message: "Agent has no X3DH bundle" } },
      422,
    )
  }

  // Atomically claim one unconsumed OPK (D1 doesn't support SELECT ... FOR UPDATE,
  // so we read + update + verify with a unique key + consumed_at IS NULL guard)
  const [opk] = await db
    .select()
    .from(schema.oneTimePrekeys)
    .where(
      and(
        eq(schema.oneTimePrekeys.agentId, agentId),
        isNull(schema.oneTimePrekeys.consumedAt),
      ),
    )
    .orderBy(asc(schema.oneTimePrekeys.keyId))
    .limit(1)

  let consumedOpk: { keyId: number; publicKey: string } | null = null
  if (opk) {
    const now = new Date().toISOString()
    const updateRes = await db
      .update(schema.oneTimePrekeys)
      .set({ consumedAt: now })
      .where(
        and(
          eq(schema.oneTimePrekeys.id, opk.id),
          isNull(schema.oneTimePrekeys.consumedAt),
        ),
      )
    if (updateRes.success && (updateRes.meta?.changes ?? 0) > 0) {
      consumedOpk = { keyId: opk.keyId, publicKey: opk.publicKey }
    }
  }

  const remainingRows = await db
    .select({ remaining: count() })
    .from(schema.oneTimePrekeys)
    .where(
      and(
        eq(schema.oneTimePrekeys.agentId, agentId),
        isNull(schema.oneTimePrekeys.consumedAt),
      ),
    )
  const remaining = remainingRows[0]?.remaining ?? 0

  return c.json({
    data: {
      agentId,
      identityKey: agent.identityKey,
      identityKeyX: agent.identityKeyX,
      signedPrekey: agent.signedPrekey,
      signedPrekeySignature: agent.signedPrekeySig,
      oneTimePrekey: consumedOpk?.publicKey ?? null,
      oneTimePrekeyId: consumedOpk?.keyId ?? null,
      lowPrekeys: remaining < LOW_PREKEY_THRESHOLD,
    },
  })
})

// DELETE /api/agents/:agentId — revoke an agent (session-auth, owner only)
agents.delete("/:agentId", requireSession, async (c) => {
  const agentId = c.req.param("agentId")
  const userId = c.get("userId") as string
  const db = drizzle(c.env.DB, { schema })

  const [agent] = await db
    .select()
    .from(schema.agents)
    .where(eq(schema.agents.id, agentId))

  if (!agent || agent.ownerUserId !== userId) {
    return c.json({ error: { code: "NOT_FOUND", message: "Agent not found" } }, 404)
  }

  await db.delete(schema.agents).where(eq(schema.agents.id, agentId))

  await writeAudit(db, {
    tenantId: agent.tenantId,
    actor: { type: "human", id: userId },
    action: "agent.revoked",
    resource: { type: "agent", id: agentId },
    payload: { displayName: agent.displayName, runtimeKind: agent.runtimeKind },
  })

  return c.json({ data: { revoked: true } })
})

// PUT /api/agents/:agentId/prekeys — upload more OPKs (caller must own the agent)
agents.put(
  "/:agentId/prekeys",
  requireAgentJwt,
  zValidator(
    "json",
    z.object({
      keys: z
        .array(z.object({ keyId: z.number().int(), publicKey: z.string() }))
        .min(1)
        .max(100),
    }),
  ),
  async (c) => {
    const targetAgentId = c.req.param("agentId")
    const callerAgentId = c.get("agentId") as string
    const { keys } = c.req.valid("json")

    if (targetAgentId !== callerAgentId) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "Can only upload prekeys for your own agent" } },
        403,
      )
    }

    const db = drizzle(c.env.DB, { schema })
    const now = new Date().toISOString()

    await db.insert(schema.oneTimePrekeys).values(
      keys.map((k) => ({
        id: nanoid(21),
        agentId: targetAgentId,
        keyId: k.keyId,
        publicKey: k.publicKey,
        createdAt: now,
      })),
    )

    return c.json({ data: { uploaded: keys.length } })
  },
)

export { agents as agentsRouter }
