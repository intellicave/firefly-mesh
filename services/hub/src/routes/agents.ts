import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { drizzle } from "drizzle-orm/d1"
import { eq, and, gt } from "drizzle-orm"
import { nanoid } from "nanoid"
import { z } from "zod"
import * as schema from "../db/schema.ts"
import type { Bindings } from "../auth.ts"
import type { AuthVariables } from "../middleware/auth.ts"
import { requireSession, requireAgentJwt, sessionMiddleware } from "../middleware/auth.ts"
import { signAgentJwt } from "../lib/jwt.ts"

const agents = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()

// POST /api/agents/pair-init — skill creates a pairing code (public)
agents.post(
  "/pair-init",
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
        confirmUrl: `${c.env.APP_URL}/connect?code=${code}`,
      },
    })
  },
)

// GET /api/agents/pair-status?code=X — skill polls pairing status
agents.get("/pair-status", sessionMiddleware, async (c) => {
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

// POST /api/agents/register — skill registers agent + gets JWT
agents.post(
  "/register",
  zValidator(
    "json",
    z.object({
      code: z.string().length(6),
      displayName: z.string().min(1).max(50),
      type: z.enum(["skill", "bot"]).default("skill"),
      identityKey: z.string().optional(),
    }),
  ),
  async (c) => {
    const { code, displayName, type, identityKey } = c.req.valid("json")
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

    const agentId = nanoid(21)

    await db.insert(schema.agents).values({
      id: agentId,
      tenantId: pairing.tenantId,
      ownerUserId: pairing.userId,
      displayName,
      type,
      identityKey: identityKey ?? null,
      createdAt: now.toISOString(),
    })

    // Invalidate the pairing code by expiring it
    await db
      .update(schema.devicePairingCodes)
      .set({ agentId, expiresAt: now.toISOString() })
      .where(eq(schema.devicePairingCodes.code, code))

    await db.insert(schema.auditLog).values({
      id: nanoid(21),
      tenantId: pairing.tenantId,
      actorId: pairing.userId,
      action: "agent.registered",
      targetId: agentId,
      createdAt: now.toISOString(),
    })

    const token = await signAgentJwt(agentId, pairing.tenantId, pairing.userId, c.env.JWT_SECRET)

    return c.json({ data: { agentId, token, tenantId: pairing.tenantId } }, 201)
  },
)

export { agents as agentsRouter }
