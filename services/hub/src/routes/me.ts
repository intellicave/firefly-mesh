import { Hono } from "hono"
import { eq, and } from "drizzle-orm"
import { nanoid } from "nanoid"
import { zValidator } from "@hono/zod-validator"
import { drizzleD1 } from "../db/connect.ts"
import { z } from "zod"
import * as schema from "../db/schema.ts"
import type { Bindings } from "../auth.ts"
import type { AuthVariables } from "../middleware/auth.ts"
import { requireSession } from "../middleware/auth.ts"

const me = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()

me.use("*", requireSession)

// GET /api/me/agents — list agents owned by the current user, restricted to
// tenants where the user still has an active membership. Round-2 security H4
// fix: prior implementation joined only by ownerUserId, so agents in tenants
// the user had been removed from were still returned (leaks tenantId +
// agent metadata for tenants no longer accessible).
me.get("/agents", async (c) => {
  const userId = c.get("userId") as string
  const db = drizzleD1(c.env)

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
    .innerJoin(
      schema.memberships,
      and(
        eq(schema.memberships.tenantId, schema.agents.tenantId),
        eq(schema.memberships.userId, userId),
      ),
    )
    .where(eq(schema.agents.ownerUserId, userId))

  return c.json({ data: rows })
})

/**
 * Round-45 M (latent SSRF) fix: only accept HTTPS push endpoints to
 * public hosts. Web Push spec requires https; rejecting localhost /
 * loopback / RFC-1918 / link-local / private hostnames prevents a
 * future push-delivery worker from being weaponised into an SSRF
 * tool that fetches internal infra by reading a malicious row out
 * of pushSubscriptions.
 *
 * Currently no push-delivery worker exists in this codebase, but the
 * stored value WILL be fetched the moment one ships; sanitizing at
 * write-time is the right preventive place.
 */
function isSafePushEndpoint(u: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(u)
  } catch {
    return false
  }
  if (parsed.protocol !== "https:") return false
  const host = parsed.hostname.toLowerCase()
  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") return false
  if (host === "::1" || host === "[::1]") return false
  // RFC-1918 + link-local
  if (host.startsWith("10.")) return false
  if (host.startsWith("192.168.")) return false
  if (host.startsWith("169.254.")) return false
  // 172.16.0.0 - 172.31.255.255
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)) return false
  return true
}

// POST /api/me/push-subscription — register Web Push subscription
me.post(
  "/push-subscription",
  zValidator(
    "json",
    z.object({
      endpoint: z
        .string()
        .url()
        .max(2048)
        .refine(isSafePushEndpoint, {
          message: "endpoint must be an https URL to a public host",
        }),
      keys: z.object({
        p256dh: z.string().max(256),
        auth: z.string().max(64),
      }),
    }),
  ),
  async (c) => {
    const userId = c.get("userId") as string
    const { endpoint, keys } = c.req.valid("json")
    const db = drizzleD1(c.env)

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
  const db = drizzleD1(c.env)
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
