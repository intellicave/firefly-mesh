import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { and, desc, eq } from "drizzle-orm"
import { nanoid } from "nanoid"
import { z } from "zod"
import * as schema from "../db/schema.ts"
import { drizzleD1 } from "../db/connect.ts"
import type { Bindings } from "../auth.ts"
import { type AuthVariables, requireSession } from "../middleware/auth.ts"
import {
  orgGuard,
  requireRole,
  type OrgGuardVariables,
} from "../middleware/orgGuard.ts"
import { writeAudit } from "../lib/audit.ts"

type Vars = AuthVariables & OrgGuardVariables

export const agentTokensRouter = new Hono<{
  Bindings: Bindings
  Variables: Vars
}>()

agentTokensRouter.use("*", requireSession)

const EXPIRES_IN_MS: Record<"7d" | "30d" | "90d", number> = {
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
}

/**
 * Generate a 32-byte random token, base64url-encoded with the "ftk_" prefix.
 * Returns the plain token (returned ONCE in response) and its SHA-256 hex
 * digest (stored in DB).
 */
async function generateToken(): Promise<{ plain: string; hash: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  // base64url
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
  const plain = `ftk_${b64}`

  const hashBuf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(plain),
  )
  let hex = ""
  for (const b of new Uint8Array(hashBuf)) hex += b.toString(16).padStart(2, "0")
  return { plain, hash: hex }
}

type TokenRow = typeof schema.agentTokens.$inferSelect

function deriveStatus(row: TokenRow, now: Date): TokenRow["status"] {
  if (row.status === "pending" && new Date(row.expiresAt) < now) {
    return "expired"
  }
  return row.status
}

function publicShape(row: TokenRow, now: Date) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    agentId: row.agentId,
    status: deriveStatus(row, now),
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  }
}

// POST /api/agent-tokens — admin issues a token bound to an employee
agentTokensRouter.post(
  "/",
  orgGuard,
  requireRole(["owner", "admin"]),
  zValidator(
    "json",
    z.object({
      employeeId: z.string(),
      expiresIn: z.enum(["7d", "30d", "90d"]).default("7d"),
    }),
  ),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const requester = c.get("employee")!
    const { employeeId, expiresIn } = c.req.valid("json")
    const now = new Date()

    // Verify employee belongs to current tenant
    const empRows = await db
      .select({ id: schema.employees.id })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.id, employeeId),
          eq(schema.employees.orgId, tenantId),
        ),
      )
    if (empRows.length === 0) {
      return c.json(
        {
          error: {
            code: "EMPLOYEE_NOT_FOUND",
            message: "Employee not found in this tenant",
          },
        },
        404,
      )
    }

    const { plain, hash } = await generateToken()
    const id = `tok_${nanoid(16)}`
    const expiresAt = new Date(now.getTime() + EXPIRES_IN_MS[expiresIn]).toISOString()

    await db.insert(schema.agentTokens).values({
      id,
      orgId: tenantId,
      employeeId,
      tokenHash: hash,
      status: "pending",
      expiresAt,
      createdAt: now.toISOString(),
      createdBy: requester.id,
    })

    await writeAudit(db, {
      tenantId,
      actor: { type: "human", id: requester.id },
      action: "agent_token.issued",
      resource: { type: "agent_token", id },
      payload: { employeeId, expiresIn },
    })

    return c.json(
      {
        data: {
          id,
          plainToken: plain,
          employeeId,
          expiresAt,
        },
      },
      201,
    )
  },
)

// GET /api/agent-tokens — list current tenant's tokens (no plain values)
agentTokensRouter.get("/", orgGuard, async (c) => {
  const db = drizzleD1(c.env)
  const tenantId = c.get("tenantId")
  const now = new Date()

  const rows = await db
    .select()
    .from(schema.agentTokens)
    .where(eq(schema.agentTokens.orgId, tenantId))
    .orderBy(desc(schema.agentTokens.createdAt))

  return c.json({ data: rows.map((r) => publicShape(r, now)) })
})

// POST /api/agent-tokens/:id/regenerate
// Revokes the old token and issues a new pending token for the same employee,
// preserving the original expiresIn window.
agentTokensRouter.post(
  "/:id/regenerate",
  orgGuard,
  requireRole(["owner", "admin"]),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const requester = c.get("employee")!
    const id = c.req.param("id")
    const now = new Date()

    const existingRows = await db
      .select()
      .from(schema.agentTokens)
      .where(
        and(
          eq(schema.agentTokens.id, id),
          eq(schema.agentTokens.orgId, tenantId),
        ),
      )
    const existing = existingRows[0]
    if (!existing) {
      return c.json(
        { error: { code: "TOKEN_NOT_FOUND", message: "Token not found" } },
        404,
      )
    }

    if (existing.status !== "pending") {
      return c.json(
        {
          error: {
            code: "INVALID_STATUS",
            message: `Cannot regenerate token in status '${existing.status}'`,
          },
        },
        409,
      )
    }

    // Revoke the old one
    await db
      .update(schema.agentTokens)
      .set({ status: "revoked", revokedAt: now.toISOString() })
      .where(
        and(
          eq(schema.agentTokens.id, existing.id),
          eq(schema.agentTokens.orgId, tenantId),
        ),
      )

    // Issue a new token, preserving the original expires_at
    const { plain, hash } = await generateToken()
    const newId = `tok_${nanoid(16)}`
    await db.insert(schema.agentTokens).values({
      id: newId,
      orgId: tenantId,
      employeeId: existing.employeeId,
      tokenHash: hash,
      status: "pending",
      expiresAt: existing.expiresAt,
      createdAt: now.toISOString(),
      createdBy: requester.id,
    })

    await writeAudit(db, {
      tenantId,
      actor: { type: "human", id: requester.id },
      action: "agent_token.regenerated",
      resource: { type: "agent_token", id: newId },
      payload: { oldId: existing.id, employeeId: existing.employeeId },
    })

    return c.json(
      {
        data: {
          id: newId,
          plainToken: plain,
          employeeId: existing.employeeId,
          expiresAt: existing.expiresAt,
        },
      },
      201,
    )
  },
)

// DELETE /api/agent-tokens/:id — soft revoke
agentTokensRouter.delete(
  "/:id",
  orgGuard,
  requireRole(["owner", "admin"]),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const requester = c.get("employee")!
    const id = c.req.param("id")
    const now = new Date()

    const existingRows = await db
      .select({ id: schema.agentTokens.id, status: schema.agentTokens.status })
      .from(schema.agentTokens)
      .where(
        and(
          eq(schema.agentTokens.id, id),
          eq(schema.agentTokens.orgId, tenantId),
        ),
      )
    if (existingRows.length === 0) {
      return c.json(
        { error: { code: "TOKEN_NOT_FOUND", message: "Token not found" } },
        404,
      )
    }

    // Round-29 M2 fix: only `pending` tokens can be revoked. Previously the
    // DELETE handler unconditionally overwrote status, which corrupted
    // consumed/expired/already-revoked rows by stamping them with a fresh
    // revokedAt — making the audit trail show "explicitly revoked
    // post-consumption" for tokens the admin never actually revoked. Mirror
    // the guard the regenerate handler uses.
    const existing = existingRows[0]!
    if (existing.status !== "pending") {
      return c.json(
        {
          error: {
            code: "INVALID_STATUS",
            message: `Cannot revoke token in status '${existing.status}'`,
          },
        },
        409,
      )
    }

    await db
      .update(schema.agentTokens)
      .set({ status: "revoked", revokedAt: now.toISOString() })
      .where(
        and(
          eq(schema.agentTokens.id, id),
          eq(schema.agentTokens.orgId, tenantId),
        ),
      )

    await writeAudit(db, {
      tenantId,
      actor: { type: "human", id: requester.id },
      action: "agent_token.revoked",
      resource: { type: "agent_token", id },
    })

    return c.json({ data: { id, revoked: true } })
  },
)
