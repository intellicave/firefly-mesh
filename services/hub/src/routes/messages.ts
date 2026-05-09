import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { drizzle } from "drizzle-orm/d1"
import { eq, and, gt } from "drizzle-orm"
import { nanoid } from "nanoid"
import { z } from "zod"
import * as schema from "../db/schema.ts"
import type { Bindings } from "../auth.ts"
import type { AuthVariables } from "../middleware/auth.ts"
import { requireAgentJwt } from "../middleware/auth.ts"

const messages = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()

messages.use("*", requireAgentJwt)

// POST /api/messages — send a message (Agent JWT). Hub never sees plaintext body/structured.
messages.post(
  "/",
  zValidator(
    "json",
    z.object({
      recipientAgentId: z.string(),
      threadId: z.string().optional(),
      type: z
        .enum(["inform", "sync", "request", "commit", "handoff", "escalate", "block"])
        .default("inform"),
      summary: z.string().max(500).optional(),
      ciphertext: z.string(),
      nonce: z.string(),
      ephemeralPk: z.string(),
      oneTimePrekeyId: z.number().int().optional(),
    }),
  ),
  async (c) => {
    const { recipientAgentId, threadId, type, summary, ciphertext, nonce, ephemeralPk, oneTimePrekeyId } =
      c.req.valid("json")
    const senderAgentId = c.get("agentId") as string
    const tenantId = c.get("agentTenantId") as string
    const db = drizzle(c.env.DB, { schema })
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
    const doId = c.env.TENANT_HUB.idFromName(tenantId)
    const stub = c.env.TENANT_HUB.get(doId)
    const deliverRes = await stub.fetch(
      new Request("https://do.internal/internal/deliver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: recipientAgentId,
          message: wireEnvelope,
        }),
      }),
    )
    const { delivered } = await deliverRes.json<{ delivered: boolean }>()

    if (delivered) {
      // Message delivered in real-time; remove from pending queue
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
  const db = drizzle(c.env.DB, { schema })
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
  const db = drizzle(c.env.DB, { schema })

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

export { messages as messagesRouter }
