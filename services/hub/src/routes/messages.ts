import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq, and, gt } from "drizzle-orm"
import { drizzleD1 } from "../db/connect.ts"
import { nanoid } from "nanoid"
import { z } from "zod"
import * as schema from "../db/schema.ts"
import type { Bindings } from "../auth.ts"
import type { AuthVariables } from "../middleware/auth.ts"
import { requireAgentJwt } from "../middleware/auth.ts"
import { rateLimitByAgent } from "../middleware/rateLimit.ts"
import { computeHitlFlags, type A2AMessageType } from "../hitl/engine.ts"
import { writeAudit } from "../lib/audit.ts"
import { isInternalSecretUsable } from "../lib/internal-secret.ts"

const messages = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()

messages.use("*", requireAgentJwt)

// POST /api/messages — send a message (Agent JWT). Hub never sees plaintext body/structured.
// Rate-limited per-sender-agent (RL_MESSAGE = 60 req / 60s) to defend against
// write-DoS and spam from a single compromised agent token.
messages.post(
  "/",
  rateLimitByAgent("RL_MESSAGE"),
  zValidator(
    "json",
    z.object({
      recipientAgentId: z.string(),
      threadId: z.string().optional(),
      type: z
        .enum(["inform", "sync", "request", "commit", "handoff", "escalate", "block"])
        .default("inform"),
      summary: z.string().max(500).optional(),
      // Round-38 M3 fix: cap encryption envelope sizes (matches the
      // caps applied in a2a-messages.ts POST). See that file for
      // rationale; same XChaCha20 / Curve25519 / 64KB ciphertext.
      ciphertext: z.string().max(64 * 1024),
      nonce: z.string().max(64),
      ephemeralPk: z.string().max(64),
      oneTimePrekeyId: z.number().int().optional(),
    }),
  ),
  async (c) => {
    const { recipientAgentId, threadId, type, summary, ciphertext, nonce, ephemeralPk, oneTimePrekeyId } =
      c.req.valid("json")
    const senderAgentId = c.get("agentId") as string
    const tenantId = c.get("agentTenantId") as string
    const db = drizzleD1(c.env)
    const now = new Date()

    // Verify recipient exists and is in the same tenant
    const [recipient] = await db
      .select()
      .from(schema.agents)
      .where(
        and(
          eq(schema.agents.id, recipientAgentId),
          eq(schema.agents.tenantId, tenantId),
        ),
      )

    if (!recipient) {
      return c.json(
        { error: { code: "RECIPIENT_NOT_FOUND", message: "Recipient agent not found" } },
        404,
      )
    }

    const messageId = nanoid(21)
    const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString()

    // Create thread if none provided
    let resolvedThreadId = threadId
    if (!resolvedThreadId) {
      resolvedThreadId = nanoid(21)
      await db.insert(schema.threads).values({
        id: resolvedThreadId,
        tenantId,
        participants: JSON.stringify([senderAgentId, recipientAgentId]),
        createdAt: now.toISOString(),
        lastMessageAt: now.toISOString(),
      })
    }

    await db.insert(schema.messagesMeta).values({
      id: messageId,
      threadId: resolvedThreadId,
      tenantId,
      senderAgentId,
      recipientAgentId,
      type,
      summary: summary ?? null,
      createdAt: now.toISOString(),
    })

    const pendingId = nanoid(21)
    const wireEnvelope = {
      messageId,
      threadId: resolvedThreadId,
      type,
      summary: summary ?? null,
      senderAgentId,
      ciphertext,
      nonce,
      ephemeralPk,
      oneTimePrekeyId: oneTimePrekeyId ?? null,
      createdAt: now.toISOString(),
    }
    await db.insert(schema.pendingMessages).values({
      id: pendingId,
      messageId,
      recipientAgentId,
      senderAgentId,
      threadId: resolvedThreadId,
      payload: JSON.stringify(wireEnvelope),
      ciphertext,
      nonce,
      ephemeralPk,
      createdAt: now.toISOString(),
      expiresAt,
    })

    // Try real-time delivery via Durable Object (encrypted blob — hub never decrypts)
    // Deliver to both the recipient agent AND the recipient owner's PWA session
    // (so the inbox UI updates without a refresh).
    // Round-23 H: refuse to forward the publicly-known wrangler.toml
    // placeholder on a non-loopback host. The DO's constant-time compare
    // would otherwise accept the placeholder, exposing the impersonation
    // surface to anyone who read the repo.
    if (!isInternalSecretUsable(c.env.INTERNAL_SECRET, c.req.raw)) {
      console.error("[messages] INTERNAL_SECRET unusable (missing or placeholder on non-loopback host) — skipping real-time deliver")
      return c.json(
        {
          error: {
            code: "MISCONFIGURED",
            message: "INTERNAL_SECRET not set or still at placeholder",
          },
        },
        500,
      )
    }
    const doId = c.env.TENANT_HUB.idFromName(tenantId)
    const tenantHub = c.env.TENANT_HUB.get(doId)
    const deliverRes = await tenantHub.fetch(
      new Request("https://do.internal/internal/deliver", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // sec H2: shared-secret gate on DO internal RPC.
          "X-Internal-Auth": c.env.INTERNAL_SECRET,
        },
        body: JSON.stringify({
          recipientAgentId,
          recipientUserId: recipient.ownerUserId,
          message: wireEnvelope,
        }),
      }),
    )
    if (!deliverRes.ok) {
      // DO failed (e.g. INTERNAL_SECRET misconfigured). Surface it loudly
      // instead of letting an unparseable body explode the json() below.
      const errBody = await deliverRes.text().catch(() => "<unreadable>")
      console.error(
        `[messages] DO deliver failed status=${deliverRes.status} body=${errBody}`,
      )
      return c.json(
        {
          error: {
            code: "DELIVERY_INFRASTRUCTURE_FAILURE",
            message: `DO delivery failed: ${deliverRes.status} ${errBody}`,
          },
        },
        500,
      )
    }
    const { delivered, agentDelivered } = await deliverRes.json<{
      delivered: boolean
      agentDelivered: boolean
      userDelivered: boolean
    }>()
    // pending_messages is the agent's queue — only mark delivered when the
    // agent itself received it (PWA notification doesn't drain the queue).
    void delivered

    if (agentDelivered) {
      // Agent received it in real-time; drain from pending queue
      await db
        .delete(schema.pendingMessages)
        .where(eq(schema.pendingMessages.id, pendingId))
    }

    return c.json({ data: { messageId, delivered } }, 202)
  },
)

// GET /api/messages/inbox — fetch pending messages (Agent JWT)
messages.get("/inbox", async (c) => {
  const agentId = c.get("agentId") as string
  const db = drizzleD1(c.env)
  const now = new Date().toISOString()

  const pending = await db
    .select()
    .from(schema.pendingMessages)
    .where(
      and(
        eq(schema.pendingMessages.recipientAgentId, agentId),
        gt(schema.pendingMessages.expiresAt, now),
      ),
    )

  return c.json({ data: pending })
})

// POST /api/messages/:id/ack — acknowledge message receipt
messages.post("/:id/ack", async (c) => {
  const messageId = c.req.param("id")
  const agentId = c.get("agentId") as string
  const db = drizzleD1(c.env)

  const [pending] = await db
    .select()
    .from(schema.pendingMessages)
    .where(
      and(
        eq(schema.pendingMessages.messageId, messageId),
        eq(schema.pendingMessages.recipientAgentId, agentId),
      ),
    )

  if (!pending) {
    return c.json({ error: { code: "NOT_FOUND", message: "Message not found" } }, 404)
  }

  await db
    .delete(schema.pendingMessages)
    .where(eq(schema.pendingMessages.id, pending.id))

  return c.json({ data: { acked: true } })
})

// POST /api/messages/:id/accept — receiver accepts (HITL)
messages.post("/:id/accept", async (c) => {
  const messageId = c.req.param("id")
  const agentId = c.get("agentId") as string
  const tenantId = c.get("agentTenantId") as string
  const db = drizzleD1(c.env)
  const now = new Date().toISOString()

  const [meta] = await db
    .select()
    .from(schema.messagesMeta)
    .where(
      and(
        eq(schema.messagesMeta.id, messageId),
        eq(schema.messagesMeta.recipientAgentId, agentId),
      ),
    )

  if (!meta) {
    return c.json({ error: { code: "NOT_FOUND", message: "Message not found" } }, 404)
  }

  await db
    .delete(schema.pendingMessages)
    .where(
      and(
        eq(schema.pendingMessages.messageId, messageId),
        eq(schema.pendingMessages.recipientAgentId, agentId),
      ),
    )

  await writeAudit(db, {
    tenantId,
    actor: { type: "agent", id: agentId },
    action: "message.accepted",
    resource: { type: "message", id: messageId },
  })

  return c.json({ data: { accepted: true, messageId } })
})

// POST /api/messages/:id/reject — receiver rejects (HITL)
messages.post("/:id/reject", async (c) => {
  const messageId = c.req.param("id")
  const agentId = c.get("agentId") as string
  const tenantId = c.get("agentTenantId") as string
  const db = drizzleD1(c.env)
  const now = new Date().toISOString()

  const [meta] = await db
    .select()
    .from(schema.messagesMeta)
    .where(
      and(
        eq(schema.messagesMeta.id, messageId),
        eq(schema.messagesMeta.recipientAgentId, agentId),
      ),
    )

  if (!meta) {
    return c.json({ error: { code: "NOT_FOUND", message: "Message not found" } }, 404)
  }

  await db
    .delete(schema.pendingMessages)
    .where(
      and(
        eq(schema.pendingMessages.messageId, messageId),
        eq(schema.pendingMessages.recipientAgentId, agentId),
      ),
    )

  await writeAudit(db, {
    tenantId,
    actor: { type: "agent", id: agentId },
    action: "message.rejected",
    resource: { type: "message", id: messageId },
  })

  return c.json({ data: { rejected: true, messageId } })
})

export { messages as messagesRouter, computeHitlFlags as _computeHitlFlags }
export type { A2AMessageType }
