import { Hono, type Context } from "hono"
import { zValidator } from "@hono/zod-validator"
import { and, asc, desc, eq, lt, gt, type SQL } from "drizzle-orm"
import { alias } from "drizzle-orm/sqlite-core"
import { nanoid } from "nanoid"
import { z } from "zod"
import * as schema from "../db/schema.ts"
import { drizzleD1 } from "../db/connect.ts"
import type { Bindings } from "../auth.ts"
import {
  type AuthVariables,
  requireSession,
  requireAgentJwt,
} from "../middleware/auth.ts"
import {
  orgGuard,
  type OrgGuardVariables,
} from "../middleware/orgGuard.ts"
import {
  computeInitialA2aStatus,
  InvalidA2aTransitionError,
  nextReceiverStatus,
  nextSenderStatus,
  resolveAgentEmployee,
} from "../lib/a2a-messages.ts"
import { writeAudit } from "../lib/audit.ts"

type SessionVars = AuthVariables & OrgGuardVariables
type AgentVars = AuthVariables

export const a2aMessagesRouter = new Hono<{
  Bindings: Bindings
  Variables: SessionVars & AgentVars
}>()

const a2aTypeEnum = z.enum([
  "inform",
  "sync",
  "request",
  "commit",
  "handoff",
  "escalate",
  "block",
])

// ---------------------------------------------------------------------------
// POST /api/a2a-messages — sender agent creates a product-tier message,
// coordinating with the encryption layer (messages_meta + pending_messages).
//
// Auth: agent JWT (Bearer)
// ---------------------------------------------------------------------------
a2aMessagesRouter.post(
  "/",
  requireAgentJwt,
  zValidator(
    "json",
    z.object({
      receiverAgentId: z.string(),
      type: a2aTypeEnum,
      summary: z.string().max(500).optional(),
      threadId: z.string().optional(),
      threadTopic: z.string().max(200).optional(),
      replyToMessageId: z.string().optional(),
      relatedTaskId: z.string().optional(),
      // Encryption envelope (same shape as POST /api/messages).
      ciphertext: z.string(),
      nonce: z.string(),
      ephemeralPk: z.string(),
      oneTimePrekeyId: z.number().int().optional(),
    }),
  ),
  async (c) => {
    const db = drizzleD1(c.env)
    const senderAgentId = c.get("agentId") as string
    const tenantId = c.get("agentTenantId") as string
    const body = c.req.valid("json")
    const now = new Date()
    const nowIso = now.toISOString()

    // Resolve sender + receiver agents → owner employees.
    const sender = await resolveAgentEmployee(db, senderAgentId, tenantId)
    if (!sender.agentExists) {
      return c.json(
        { error: { code: "SENDER_NOT_FOUND", message: "Sender agent not found" } },
        404,
      )
    }
    const receiver = await resolveAgentEmployee(
      db,
      body.receiverAgentId,
      tenantId,
    )
    if (!receiver.agentExists) {
      return c.json(
        {
          error: {
            code: "RECIPIENT_NOT_FOUND",
            message: "Recipient agent not found in this tenant",
          },
        },
        404,
      )
    }

    // Compute HITL initial state.
    const initial = computeInitialA2aStatus(body.type)

    // Step 1: resolve or create a2a_thread.
    let threadId = body.threadId
    if (threadId) {
      const existing = await db
        .select({ id: schema.a2aThreads.id })
        .from(schema.a2aThreads)
        .where(
          and(
            eq(schema.a2aThreads.id, threadId),
            eq(schema.a2aThreads.orgId, tenantId),
          ),
        )
      if (existing.length === 0) {
        return c.json(
          {
            error: {
              code: "THREAD_NOT_FOUND",
              message: "threadId not found in this tenant",
            },
          },
          404,
        )
      }
    } else {
      threadId = `athd_${nanoid(16)}`
      await db.insert(schema.a2aThreads).values({
        id: threadId,
        orgId: tenantId,
        topic: body.threadTopic ?? null,
        relatedTaskId: body.relatedTaskId ?? null,
        messageCount: 0,
        createdAt: nowIso,
      })
    }

    // Step 2: ensure an encryption-layer thread exists (hub's `threads` table).
    // Hub's POST /api/messages auto-creates this; we mirror that behaviour by
    // looking up the existing thread for this (sender, recipient) pair or
    // creating one if none.
    const encryptionThreadId = nanoid(21)
    await db.insert(schema.threads).values({
      id: encryptionThreadId,
      tenantId,
      participants: JSON.stringify([senderAgentId, body.receiverAgentId]),
      createdAt: nowIso,
      lastMessageAt: nowIso,
    })

    // Step 3: messages_meta (envelope metadata, non-encrypted)
    const messageId = nanoid(21)
    await db.insert(schema.messagesMeta).values({
      id: messageId,
      threadId: encryptionThreadId,
      tenantId,
      senderAgentId,
      recipientAgentId: body.receiverAgentId,
      type: body.type,
      summary: body.summary ?? null,
      createdAt: nowIso,
    })

    // Step 4: pending_messages (encrypted body, deliverable on accept)
    const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString()
    const wireEnvelope = {
      messageId,
      threadId: encryptionThreadId,
      type: body.type,
      summary: body.summary ?? null,
      senderAgentId,
      ciphertext: body.ciphertext,
      nonce: body.nonce,
      ephemeralPk: body.ephemeralPk,
      oneTimePrekeyId: body.oneTimePrekeyId,
    }
    await db.insert(schema.pendingMessages).values({
      id: nanoid(21),
      messageId,
      recipientAgentId: body.receiverAgentId,
      senderAgentId,
      threadId: encryptionThreadId,
      payload: JSON.stringify(wireEnvelope),
      ciphertext: body.ciphertext,
      nonce: body.nonce,
      ephemeralPk: body.ephemeralPk,
      createdAt: nowIso,
      expiresAt,
    })

    // Step 5: product-layer a2a_messages row.
    const a2aMessageId = `amsg_${nanoid(16)}`
    await db.insert(schema.a2aMessages).values({
      id: a2aMessageId,
      orgId: tenantId,
      threadId,
      encryptedMessageId: messageId,
      replyToMessageId: body.replyToMessageId ?? null,
      senderAgentId,
      senderEmployeeId: sender.employeeId,
      receiverAgentId: body.receiverAgentId,
      receiverEmployeeId: receiver.employeeId,
      type: body.type,
      senderApprovalStatus: initial.senderApprovalStatus,
      senderApprovalAt:
        initial.senderApprovalStatus === "auto" ? nowIso : null,
      receiverActionStatus: initial.receiverActionStatus,
      receiverActionAt:
        initial.receiverActionStatus === "auto" ? nowIso : null,
      relatedTaskId: body.relatedTaskId ?? null,
      createdAt: nowIso,
    })

    // Step 6: bump message_count. D1 has no atomic INCREMENT via Drizzle;
    // read-modify-write is acceptable here (low contention; RL_MESSAGE caps
    // the per-agent write rate).
    const [tRow] = await db
      .select({ messageCount: schema.a2aThreads.messageCount })
      .from(schema.a2aThreads)
      .where(eq(schema.a2aThreads.id, threadId))
    if (tRow) {
      await db
        .update(schema.a2aThreads)
        .set({ messageCount: tRow.messageCount + 1 })
        .where(eq(schema.a2aThreads.id, threadId))
    }

    await writeAudit(db, {
      tenantId,
      actor: { type: "agent", id: senderAgentId },
      action: "a2a_message.sent",
      resource: { type: "a2a_message", id: a2aMessageId },
      payload: {
        type: body.type,
        threadId,
        receiverAgentId: body.receiverAgentId,
        senderApprovalStatus: initial.senderApprovalStatus,
        receiverActionStatus: initial.receiverActionStatus,
      },
    })

    return c.json(
      {
        data: {
          id: a2aMessageId,
          threadId,
          encryptedMessageId: messageId,
          type: body.type,
          senderApprovalStatus: initial.senderApprovalStatus,
          receiverActionStatus: initial.receiverActionStatus,
          createdAt: nowIso,
        },
      },
      201,
    )
  },
)

// ---------------------------------------------------------------------------
// GET /api/a2a-messages/inbox — dashboard inbox view, session-authed
// ---------------------------------------------------------------------------
a2aMessagesRouter.get(
  "/inbox",
  requireSession,
  orgGuard,
  zValidator(
    "query",
    z.object({
      tab: z.enum(["approve", "action"]).default("action"),
      type: a2aTypeEnum.optional(),
      counterpartEmployeeId: z.string().optional(),
      cursor: z.string().optional(), // ISO datetime
      limit: z.coerce.number().int().min(1).max(100).default(50),
      sort: z.enum(["desc", "asc"]).default("desc"),
      tenantId: z.string().optional(), // consumed by orgGuard
    }),
  ),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const employee = c.get("employee")
    const q = c.req.valid("query")

    if (!employee) {
      return c.json({ data: { tab: q.tab, items: [], nextCursor: null } })
    }

    const cursorOp = q.sort === "desc" ? lt : gt
    const orderBy = q.sort === "desc" ? desc : asc

    const senderEmp = alias(schema.employees, "senderEmp")
    const receiverEmp = alias(schema.employees, "receiverEmp")

    if (q.tab === "approve") {
      const conditions: SQL[] = [
        eq(schema.a2aMessages.orgId, tenantId),
        eq(schema.a2aMessages.senderEmployeeId, employee.id),
        eq(schema.a2aMessages.senderApprovalStatus, "pending"),
      ]
      if (q.type) conditions.push(eq(schema.a2aMessages.type, q.type))
      if (q.counterpartEmployeeId)
        conditions.push(
          eq(schema.a2aMessages.receiverEmployeeId, q.counterpartEmployeeId),
        )
      if (q.cursor)
        conditions.push(cursorOp(schema.a2aMessages.createdAt, q.cursor))

      const rows = await db
        .select({
          id: schema.a2aMessages.id,
          type: schema.a2aMessages.type,
          summary: schema.messagesMeta.summary,
          threadId: schema.a2aMessages.threadId,
          relatedTaskId: schema.a2aMessages.relatedTaskId,
          senderAgentId: schema.a2aMessages.senderAgentId,
          senderEmployeeId: schema.a2aMessages.senderEmployeeId,
          senderEmployeeName: senderEmp.name,
          receiverAgentId: schema.a2aMessages.receiverAgentId,
          receiverEmployeeId: schema.a2aMessages.receiverEmployeeId,
          receiverEmployeeName: receiverEmp.name,
          createdAt: schema.a2aMessages.createdAt,
        })
        .from(schema.a2aMessages)
        .innerJoin(
          schema.messagesMeta,
          eq(schema.messagesMeta.id, schema.a2aMessages.encryptedMessageId),
        )
        .leftJoin(
          senderEmp,
          eq(senderEmp.id, schema.a2aMessages.senderEmployeeId),
        )
        .leftJoin(
          receiverEmp,
          eq(receiverEmp.id, schema.a2aMessages.receiverEmployeeId),
        )
        .where(and(...conditions))
        .orderBy(orderBy(schema.a2aMessages.createdAt))
        .limit(q.limit + 1)

      const hasMore = rows.length > q.limit
      const items = hasMore ? rows.slice(0, q.limit) : rows
      const nextCursor =
        hasMore && items.length > 0 ? items[items.length - 1]!.createdAt : null

      return c.json({ data: { tab: "approve", items, nextCursor } })
    }

    // tab = action (receiver side)
    const conditions: SQL[] = [
      eq(schema.a2aMessages.orgId, tenantId),
      eq(schema.a2aMessages.receiverEmployeeId, employee.id),
      eq(schema.a2aMessages.receiverActionStatus, "pending"),
    ]
    if (q.type) conditions.push(eq(schema.a2aMessages.type, q.type))
    if (q.counterpartEmployeeId)
      conditions.push(
        eq(schema.a2aMessages.senderEmployeeId, q.counterpartEmployeeId),
      )
    if (q.cursor)
      conditions.push(cursorOp(schema.a2aMessages.createdAt, q.cursor))

    const rows = await db
      .select({
        id: schema.a2aMessages.id,
        type: schema.a2aMessages.type,
        summary: schema.messagesMeta.summary,
        threadId: schema.a2aMessages.threadId,
        relatedTaskId: schema.a2aMessages.relatedTaskId,
        senderAgentId: schema.a2aMessages.senderAgentId,
        senderEmployeeId: schema.a2aMessages.senderEmployeeId,
        senderEmployeeName: senderEmp.name,
        receiverAgentId: schema.a2aMessages.receiverAgentId,
        receiverEmployeeId: schema.a2aMessages.receiverEmployeeId,
        receiverEmployeeName: receiverEmp.name,
        createdAt: schema.a2aMessages.createdAt,
      })
      .from(schema.a2aMessages)
      .innerJoin(
        schema.messagesMeta,
        eq(schema.messagesMeta.id, schema.a2aMessages.encryptedMessageId),
      )
      .leftJoin(
        senderEmp,
        eq(senderEmp.id, schema.a2aMessages.senderEmployeeId),
      )
      .leftJoin(
        receiverEmp,
        eq(receiverEmp.id, schema.a2aMessages.receiverEmployeeId),
      )
      .where(and(...conditions))
      .orderBy(orderBy(schema.a2aMessages.createdAt))
      .limit(q.limit + 1)

    const hasMore = rows.length > q.limit
    const items = hasMore ? rows.slice(0, q.limit) : rows
    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1]!.createdAt : null

    return c.json({ data: { tab: "action", items, nextCursor } })
  },
)

// ---------------------------------------------------------------------------
// Common HITL CTA handler factory
// ---------------------------------------------------------------------------
type CtaSide = "sender" | "receiver"
type CtaAction = "approve" | "reject" | "accept" | "reject-receive"

interface CtaConfig {
  side: CtaSide
  transitionAction: "approve" | "reject" | "accept"
  auditAction: string
}

const CTA_CONFIGS: Record<CtaAction, CtaConfig> = {
  approve: { side: "sender", transitionAction: "approve", auditAction: "a2a_message.approved" },
  reject: { side: "sender", transitionAction: "reject", auditAction: "a2a_message.rejected" },
  accept: { side: "receiver", transitionAction: "accept", auditAction: "a2a_message.accepted" },
  "reject-receive": { side: "receiver", transitionAction: "reject", auditAction: "a2a_message.reject_receive" },
}

type CtaContext = Context<{
  Bindings: Bindings
  Variables: SessionVars & AgentVars
}>

async function handleCta(c: CtaContext, cta: CtaAction): Promise<Response> {
  const cfg = CTA_CONFIGS[cta]
  const db = drizzleD1(c.env)
  const tenantId = c.get("tenantId")
  const employee = c.get("employee")
  // Hono's generic Context type can't infer the :id path param; route is
  // always /:id/<cta>, so the cast is safe.
  const id = c.req.param("id") as string

  if (!employee) {
    return c.json(
      {
        error: {
          code: "NO_EMPLOYEE_PROFILE",
          message: "User has no employee profile",
        },
      },
      403,
    )
  }

  const rows = await db
    .select()
    .from(schema.a2aMessages)
    .where(
      and(
        eq(schema.a2aMessages.id, id),
        eq(schema.a2aMessages.orgId, tenantId),
      ),
    )
  const msg = rows[0]
  if (!msg) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Message not found" } },
      404,
    )
  }

  // RBAC: caller must be the relevant party (sender for approve/reject;
  // receiver for accept/reject-receive) OR admin/owner.
  const isAdmin = employee.role === "owner" || employee.role === "admin"
  const isSenderSide = cfg.side === "sender"
  const isReceiverSide = cfg.side === "receiver"
  const isOwnSender = isSenderSide && msg.senderEmployeeId === employee.id
  const isOwnReceiver =
    isReceiverSide && msg.receiverEmployeeId === employee.id

  if (!isAdmin && !isOwnSender && !isOwnReceiver) {
    return c.json(
      {
        error: {
          code: "NOT_AUTHORIZED",
          message: `Only the ${cfg.side} or admin can ${cta} this message`,
        },
      },
      403,
    )
  }

  const now = new Date().toISOString()
  try {
    if (isSenderSide) {
      const nextStatus = nextSenderStatus(
        msg.senderApprovalStatus as Parameters<typeof nextSenderStatus>[0],
        cfg.transitionAction as "approve" | "reject",
      )
      await db
        .update(schema.a2aMessages)
        .set({
          senderApprovalStatus: nextStatus,
          senderApprovalBy: employee.id,
          senderApprovalAt: now,
        })
        .where(
          and(
            eq(schema.a2aMessages.id, id),
            eq(schema.a2aMessages.orgId, tenantId),
          ),
        )
      await writeAudit(db, {
        tenantId,
        actor: { type: "human", id: employee.id },
        action: cfg.auditAction,
        resource: { type: "a2a_message", id },
        payload: { side: "sender", newStatus: nextStatus },
      })
      return c.json({ data: { id, side: "sender", status: nextStatus } })
    }

    const nextStatus = nextReceiverStatus(
      msg.receiverActionStatus as Parameters<typeof nextReceiverStatus>[0],
      cfg.transitionAction as "accept" | "reject",
    )
    await db
      .update(schema.a2aMessages)
      .set({
        receiverActionStatus: nextStatus,
        receiverActionBy: employee.id,
        receiverActionAt: now,
      })
      .where(
        and(
          eq(schema.a2aMessages.id, id),
          eq(schema.a2aMessages.orgId, tenantId),
        ),
      )
    await writeAudit(db, {
      tenantId,
      actor: { type: "human", id: employee.id },
      action: cfg.auditAction,
      resource: { type: "a2a_message", id },
      payload: { side: "receiver", newStatus: nextStatus },
    })
    return c.json({ data: { id, side: "receiver", status: nextStatus } })
  } catch (err) {
    if (err instanceof InvalidA2aTransitionError) {
      return c.json(
        { error: { code: err.code, message: err.message } },
        409,
      )
    }
    throw err
  }
}

a2aMessagesRouter.post("/:id/approve", requireSession, orgGuard, (c) =>
  handleCta(c, "approve"),
)
a2aMessagesRouter.post("/:id/reject", requireSession, orgGuard, (c) =>
  handleCta(c, "reject"),
)
a2aMessagesRouter.post("/:id/accept", requireSession, orgGuard, (c) =>
  handleCta(c, "accept"),
)
a2aMessagesRouter.post("/:id/reject-receive", requireSession, orgGuard, (c) =>
  handleCta(c, "reject-receive"),
)
