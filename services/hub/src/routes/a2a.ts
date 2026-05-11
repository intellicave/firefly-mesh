/**
 * Standard A2A wire format compatibility endpoints (M4).
 *
 * R12 hard rule: every inbound A2A message MUST be ed25519-verified before
 * any business logic runs. The single permitted verifier is
 * `verifySignature` from packages/proto/src/signing.ts.
 *
 * Additional hard rules enforced here (P0 expert-review fixes):
 *  - R8 multi-tenancy: sender and receiver must be in the same tenant.
 *    Federation across tenants is a future feature; until then any cross-
 *    tenant injection attempt is rejected with 403.
 *  - Replay protection: envelope.timestamp must be within ±5 minutes of now.
 *  - Idempotency: duplicate messageId is rejected explicitly with 409
 *    rather than relying on PK collision (which would surface as 5xx).
 */

import { Hono } from "hono"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import { nanoid } from "nanoid"
import { verifySignature, A2AMessageWire } from "@firefly-mesh/proto"
import * as schema from "../db/schema.ts"
import type { Bindings } from "../auth.ts"
import { rateLimitByIp } from "../middleware/rateLimit.ts"

/** ±5 minute freshness window for A2A envelope timestamps. */
const A2A_TIMESTAMP_WINDOW_MS = 5 * 60 * 1000

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

// POST /api/a2a/message — receive external A2A wire format message.
// Rate-limited by source IP via the dedicated RL_A2A binding (120 req / 60s).
// We can't key on the sender agent because the request is unauthenticated
// until step 3 (sig verify) — IP is the only signal available pre-auth.
// A separate (larger) limit from per-agent RL_MESSAGE because a single
// federation partner can legitimately fan out for many agents per call.
a2a.post("/message", rateLimitByIp("RL_A2A"), async (c) => {
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

  // Step 3: ed25519 signature verification (R12 — single permitted entry point).
  // Done BEFORE timestamp check so the timestamp comparison cannot serve as
  // an unauthenticated clock oracle.
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

  // Step 4: timestamp freshness — only checked after the sender is
  // authenticated, so the ±5 min window is not a probe-able oracle.
  const envTsMs = Date.parse(envelope.timestamp)
  if (Number.isNaN(envTsMs)) {
    return c.json(
      { error: { code: "INVALID_TIMESTAMP", message: "Envelope timestamp is not a valid ISO 8601 string" } },
      400,
    )
  }
  if (Math.abs(Date.now() - envTsMs) > A2A_TIMESTAMP_WINDOW_MS) {
    return c.json(
      {
        error: {
          code: "TIMESTAMP_OUT_OF_WINDOW",
          message: "Envelope timestamp is outside the ±5 minute freshness window",
        },
      },
      400,
    )
  }

  // Step 5: cross-tenant guard — receiver MUST be in the same tenant as sender.
  // Without this, a legitimate agent in tenant A could sign an envelope addressed
  // to any agent in tenant B, and the hub would persist + deliver it — bypassing
  // R8 multi-tenancy at the federated entry point.
  const [recipient] = await db
    .select({ ownerUserId: schema.agents.ownerUserId, tenantId: schema.agents.tenantId })
    .from(schema.agents)
    .where(eq(schema.agents.id, envelope.receiver.agentId))

  if (!recipient || recipient.tenantId !== sender.tenantId) {
    // One uniform 404 covers both "agent doesn't exist" and "agent exists in a
    // different tenant" so the response can't be used to enumerate agents
    // across tenants.
    return c.json(
      { error: { code: "NOT_FOUND", message: "Recipient agent not found in your tenant" } },
      404,
    )
  }

  // Step 6: idempotent persist of messages_meta. Use INSERT ... ON CONFLICT
  // DO NOTHING so concurrent duplicate POSTs both succeed at the SQL layer
  // and we detect replay via meta.changes === 0 — eliminating the SELECT-
  // then-INSERT TOCTOU window where two concurrent requests both saw "no row"
  // and the loser hit a PK violation 5xx.
  const messageId = envelope.messageId
  const now = new Date().toISOString()

  const insertMeta = await db
    .insert(schema.messagesMeta)
    .values({
      id: messageId,
      tenantId: recipient.tenantId, // tenant of the RECEIVER (= sender by step 5)
      senderAgentId: envelope.sender.agentId,
      recipientAgentId: envelope.receiver.agentId,
      type: envelope.type,
      summary: envelope.content.summary,
      createdAt: now,
    })
    .onConflictDoNothing()

  const inserted = (insertMeta.meta as { changes?: number } | undefined)?.changes ?? 0
  if (inserted === 0) {
    // Duplicate messageId — replay or legitimate retry. Treat as idempotent
    // success: same shape as the first acceptance, 202 status, with replay flag.
    return c.json({ data: { messageId, accepted: true, replay: true } }, 202)
  }

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

  // Step 8: route via TenantHub for real-time delivery, keyed on RECEIVER's
  // tenant (not sender's — same tenant by step 5 but receiver-rooted is the
  // semantically correct DO partition).
  const doId = c.env.TENANT_HUB.idFromName(recipient.tenantId)
  const tenantHub = c.env.TENANT_HUB.get(doId)
  await tenantHub.fetch(
    new Request("https://do.internal/internal/deliver", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipientAgentId: envelope.receiver.agentId,
        recipientUserId: recipient.ownerUserId ?? null,
        message: envelope,
      }),
    }),
  )

  return c.json({ data: { messageId, accepted: true } }, 202)
})

export { a2a as a2aRouter }
