/**
 * Standard A2A wire format compatibility endpoints (M4).
 *
 * R12 hard rule: every inbound A2A message MUST be ed25519-verified before
 * any business logic runs. The single permitted verifier is
 * `verifySignature` from packages/proto/src/signing.ts.
 */

import { Hono } from "hono"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import { nanoid } from "nanoid"
import { verifySignature, A2AMessageWire } from "@firefly-mesh/proto"
import * as schema from "../db/schema.ts"
import type { Bindings } from "../auth.ts"

const a2a = new Hono<{ Bindings: Bindings }>()

// GET /api/a2a/agent-card/:agentId — public Agent Card (A2A v1.0 spec)
a2a.get("/agent-card/:agentId", async (c) => {
  const agentId = c.req.param("agentId")
  const db = drizzle(c.env.DB, { schema })

  const [agent] = await db
    .select({
      id: schema.agents.id,
      displayName: schema.agents.displayName,
      type: schema.agents.type,
      identityKey: schema.agents.identityKey,
      tenantId: schema.agents.tenantId,
    })
    .from(schema.agents)
    .where(eq(schema.agents.id, agentId))

  if (!agent || !agent.identityKey) {
    return c.json({ error: { code: "AGENT_NOT_FOUND", message: "Agent not found" } }, 404)
  }

  return c.json({
    data: {
      agentId: agent.id,
      displayName: agent.displayName,
      type: agent.type,
      identityKey: agent.identityKey,
      protocolVersion: "1.2",
      endpoint: `${c.env.APP_URL}/api/a2a/message`,
    },
  })
})

// POST /api/a2a/message — receive external A2A wire format message
a2a.post("/message", async (c) => {
  const body = await c.req.json<unknown>()

  // Step 1: shape validation (zod)
  const parsed = A2AMessageWire.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { error: { code: "INVALID_WIRE", message: "Invalid A2A wire format", issues: parsed.error.issues } },
      400,
    )
  }

  const envelope = parsed.data

  // Step 2: protocolVersion enforcement (R12 — defense in depth)
  if (envelope.protocolVersion !== "1.2") {
    return c.json(
      { error: { code: "UNSUPPORTED_PROTOCOL", message: "Only A2A v1.2 accepted" } },
      400,
    )
  }

  // Step 3: ed25519 signature verification (R12 — single permitted entry point)
  const db = drizzle(c.env.DB, { schema })
  const [sender] = await db
    .select({ identityKey: schema.agents.identityKey, tenantId: schema.agents.tenantId })
    .from(schema.agents)
    .where(eq(schema.agents.id, envelope.sender.agentId))

  if (!sender || !sender.identityKey) {
    return c.json({ error: { code: "SENDER_NOT_FOUND", message: "Sender agent unknown" } }, 401)
  }

  const { signature, ...envelopeWithoutSig } = envelope
  const sigOk = verifySignature(envelopeWithoutSig, signature, sender.identityKey)
  if (!sigOk) {
    return c.json({ error: { code: "INVALID_SIGNATURE", message: "Signature verification failed" } }, 401)
  }

  // Step 4: persist as messages_meta (encrypted body lives in pending_messages)
  const now = new Date().toISOString()
  const messageId = envelope.messageId

  await db.insert(schema.messagesMeta).values({
    id: messageId,
    tenantId: sender.tenantId,
    senderAgentId: envelope.sender.agentId,
    recipientAgentId: envelope.receiver.agentId,
    type: envelope.type,
    summary: envelope.content.summary,
    createdAt: now,
  })

  if (envelope.encrypted_payload && envelope.nonce && envelope.ephemeral_pk) {
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
    await db.insert(schema.pendingMessages).values({
      id: nanoid(21),
      messageId,
      recipientAgentId: envelope.receiver.agentId,
      senderAgentId: envelope.sender.agentId,
      payload: JSON.stringify(envelope),
      ciphertext: envelope.encrypted_payload,
      nonce: envelope.nonce,
      ephemeralPk: envelope.ephemeral_pk,
      createdAt: now,
      expiresAt,
    })
  }

  // Step 5: route via TenantHub for real-time delivery
  // Look up the recipient's owner so PWA sessions also get pushed
  const [recipient] = await db
    .select({ ownerUserId: schema.agents.ownerUserId })
    .from(schema.agents)
    .where(eq(schema.agents.id, envelope.receiver.agentId))

  const doId = c.env.TENANT_HUB.idFromName(sender.tenantId)
  const tenantHub = c.env.TENANT_HUB.get(doId)
  await tenantHub.fetch(
    new Request("https://do.internal/internal/deliver", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipientAgentId: envelope.receiver.agentId,
        recipientUserId: recipient?.ownerUserId ?? null,
        message: envelope,
      }),
    }),
  )

  return c.json({ data: { messageId, accepted: true } }, 202)
})

export { a2a as a2aRouter }
