import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { and, eq } from "drizzle-orm"
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
import {
  SCOPE_CATALOG,
  SCOPE_IDS,
  defaultScopes,
} from "../lib/scopes.ts"

type Vars = AuthVariables & OrgGuardVariables

export const boundariesRouter = new Hono<{
  Bindings: Bindings
  Variables: Vars
}>()

boundariesRouter.use("*", requireSession)

// GET /api/boundaries/:agentId — any tenant member can read
boundariesRouter.get("/:agentId", orgGuard, async (c) => {
  const db = drizzleD1(c.env)
  const tenantId = c.get("tenantId")
  const agentId = c.req.param("agentId")

  // Cross-tenant guard: verify agent belongs to current tenant.
  const agentRows = await db
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(
      and(eq(schema.agents.id, agentId), eq(schema.agents.tenantId, tenantId)),
    )
  if (agentRows.length === 0) {
    return c.json(
      { error: { code: "AGENT_NOT_FOUND", message: "Agent not found" } },
      404,
    )
  }

  const rows = await db
    .select()
    .from(schema.representationBoundaries)
    .where(eq(schema.representationBoundaries.agentId, agentId))
  const row = rows[0]

  let scopes: string[]
  let updatedAt: string | null
  if (row) {
    try {
      const parsed = JSON.parse(row.scopes)
      scopes = Array.isArray(parsed)
        ? parsed.filter((s): s is string => typeof s === "string")
        : defaultScopes()
    } catch {
      scopes = defaultScopes()
    }
    updatedAt = row.updatedAt
  } else {
    // Legacy agent without an explicit boundary row — fall back to defaults.
    scopes = defaultScopes()
    updatedAt = null
  }

  return c.json({
    data: {
      agentId,
      scopes,
      catalog: SCOPE_CATALOG,
      updatedAt,
    },
  })
})

// PUT /api/boundaries/:agentId — owner/admin only
boundariesRouter.put(
  "/:agentId",
  orgGuard,
  requireRole(["owner", "admin"]),
  zValidator(
    "json",
    z.object({
      scopes: z.array(z.string()).max(50),
    }),
  ),
  async (c) => {
    const db = drizzleD1(c.env)
    const tenantId = c.get("tenantId")
    const requester = c.get("employee")!
    const agentId = c.req.param("agentId")
    const { scopes: nextScopes } = c.req.valid("json")
    const now = new Date().toISOString()

    // Cross-tenant guard
    const agentRows = await db
      .select({ id: schema.agents.id })
      .from(schema.agents)
      .where(
        and(
          eq(schema.agents.id, agentId),
          eq(schema.agents.tenantId, tenantId),
        ),
      )
    if (agentRows.length === 0) {
      return c.json(
        { error: { code: "AGENT_NOT_FOUND", message: "Agent not found" } },
        404,
      )
    }

    // Whitelist validation: every scope must be in the catalog.
    const invalid = nextScopes.filter((s) => !SCOPE_IDS.includes(s))
    if (invalid.length > 0) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: `Unknown scope ids: ${invalid.join(", ")}`,
          },
        },
        400,
      )
    }

    // Deduplicate while preserving order
    const seen = new Set<string>()
    const cleaned = nextScopes.filter((s) => {
      if (seen.has(s)) return false
      seen.add(s)
      return true
    })

    // Load existing for audit diff
    const existingRows = await db
      .select()
      .from(schema.representationBoundaries)
      .where(eq(schema.representationBoundaries.agentId, agentId))
    const existing = existingRows[0]
    let before: string[] = defaultScopes()
    if (existing) {
      try {
        const parsed = JSON.parse(existing.scopes)
        if (Array.isArray(parsed))
          before = parsed.filter((s): s is string => typeof s === "string")
      } catch {
        // fall through, before stays default
      }
    }

    if (existing) {
      await db
        .update(schema.representationBoundaries)
        .set({ scopes: JSON.stringify(cleaned), updatedAt: now })
        .where(eq(schema.representationBoundaries.agentId, agentId))
    } else {
      await db.insert(schema.representationBoundaries).values({
        id: nanoid(21),
        agentId,
        scopes: JSON.stringify(cleaned),
        updatedAt: now,
      })
    }

    // Audit: M12 will extend auditLog with payload; for now just record actor
    // + action + target.
    await db.insert(schema.auditLog).values({
      id: nanoid(21),
      tenantId,
      actorId: requester.id,
      action: "boundary.updated",
      targetId: agentId,
      createdAt: now,
    })

    void before // diff payload deferred to M12 auditLog extension

    return c.json({
      data: {
        agentId,
        scopes: cleaned,
        catalog: SCOPE_CATALOG,
        updatedAt: now,
      },
    })
  },
)
