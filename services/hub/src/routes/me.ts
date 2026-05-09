import { Hono } from "hono"
import { drizzle } from "drizzle-orm/d1"
import { eq, and } from "drizzle-orm"
import { nanoid } from "nanoid"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import * as schema from "../db/schema.ts"
import type { Bindings } from "../auth.ts"
import type { AuthVariables } from "../middleware/auth.ts"
import { requireSession } from "../middleware/auth.ts"

const me = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()

me.use("*", requireSession)

// GET /api/me/agents — list all agents owned by the current user across tenants
me.get("/agents", async (c) => {
  const userId = c.get("userId") as string
  const db = drizzle(c.env.DB, { schema })

  const rows = await db
    .select({
      id: schema.agents.id,
      tenantId: schema.agents.tenantId,
      displayName: schema.agents.displayName,
      type: schema.agents.type,
      createdAt: schema.agents.createdAt,
      lastSeenAt: schema.agents.lastSeenAt,
    })
    .from(schema.agents)
    .where(eq(schema.agents.ownerUserId, userId))

  return c.json({ data: rows })
})

// POST /api/me/push-subscription — register Web Push subscription
me.post(
  "/push-subscription",
  zValidator(
    "json",
    z.object({
      endpoint: z.string().url(),
      keys: z.object({ p256dh: z.string(), auth: z.string() }),
    }),
  ),
  async (c) => {
    const userId = c.get("userId") as string
    const { endpoint, keys } = c.req.valid("json")
    const db = drizzle(c.env.DB, { schema })

    await db
      .insert(schema.pushSubscriptions)
      .values({
        id: nanoid(21),
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        createdAt: new Date().toISOString(),
      })
      .onConflictDoNothing()

    return c.json({ data: { subscribed: true } }, 201)
  },
)

// DELETE /api/me/push-subscription — unsubscribe by endpoint
me.delete("/push-subscription", async (c) => {
  const userId = c.get("userId") as string
  const endpoint = c.req.query("endpoint")
  if (!endpoint) {
    return c.json({ error: { code: "MISSING_ENDPOINT", message: "endpoint required" } }, 400)
  }
  const db = drizzle(c.env.DB, { schema })
  await db
    .delete(schema.pushSubscriptions)
    .where(
      and(
        eq(schema.pushSubscriptions.userId, userId),
        eq(schema.pushSubscriptions.endpoint, endpoint),
      ),
    )
  return c.json({ data: { unsubscribed: true } })
})

export { me as meRouter }
