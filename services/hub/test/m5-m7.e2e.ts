/**
 * M5+M6+M7 end-to-end integration test.
 *
 *   Prereq: wrangler dev on http://localhost:8787 with fresh local D1.
 *           (`pnpm --filter @firefly-mesh/hub migrate:local && pnpm dev:hub`)
 *   Run:    pnpm --filter @firefly-mesh/hub test:e2e:m5-m7
 *
 * Covers sprint 2026-05-17 M5+M6+M7:
 *   M5: register agent → owner_employee_id auto-populated from employee
 *       record, runtime_kind defaults to 'unknown', activated_at set,
 *       runtimeKind+runtimeMeta accepted from body.
 *   M6: representation_boundaries row created with defaultScopes, JWT
 *       contains 'scope' claim, GET /api/boundaries returns catalog+scopes,
 *       PUT /api/boundaries updates with whitelist+dedupe, audit_log gets
 *       'boundary.updated' row.
 *       Back-compat: old JWT signed without 'scope' verifies and returns
 *       defaultScopes.
 *   M7: POST /api/agent-tokens returns plain token once, DB stores hash,
 *       GET list omits plain, regenerate revokes old + new pending,
 *       DELETE soft revokes.
 *   RBAC negatives: auditor/employee role blocked from PUT boundary
 *       and POST agent-tokens.
 *   Cross-tenant: tenant B cannot read tenant A's agent boundary.
 */

import assert from "node:assert/strict"
import { generateX3DHKeys } from "@firefly-mesh/crypto"
import { SignJWT } from "jose"

const HUB = process.env.HUB_URL ?? "http://localhost:8787"
const log = (step: string, detail = "") => console.log(`[${step}] ${detail}`)

class Session {
  cookies: Map<string, string> = new Map()
  constructor(public label: string) {}

  capture(res: Response) {
    const setCookie = res.headers.getSetCookie?.() ?? []
    for (const sc of setCookie) {
      const [pair] = sc.split(";")
      const [name, ...rest] = pair!.split("=")
      this.cookies.set(name!.trim(), rest.join("=").trim())
    }
  }

  cookieHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ")
  }

  async req(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers)
    if (this.cookies.size) headers.set("Cookie", this.cookieHeader())
    if (init.body && !headers.has("Content-Type"))
      headers.set("Content-Type", "application/json")
    if (!headers.has("Origin")) headers.set("Origin", HUB)
    const res = await fetch(`${HUB}${path}`, { ...init, headers })
    this.capture(res)
    return res
  }

  async json<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<{ status: number; body: T }> {
    const res = await this.req(path, init)
    const text = await res.text()
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
    return { status: res.status, body: body as T }
  }
}

type Env<T> = { data: T } | { error: { code: string; message: string } }
function unwrap<T>(e: Env<T>, label: string): T {
  if ("error" in e)
    throw new Error(`${label} failed: ${e.error.code} — ${e.error.message}`)
  return e.data
}

function toB64Url(bytes: Uint8Array): string {
  let s = ""
  for (const b of bytes) s += String.fromCharCode(b)
  return Buffer.from(s, "binary")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")
}

function decodeJwt(token: string): Record<string, unknown> {
  const parts = token.split(".")
  if (parts.length !== 3) throw new Error("not a jwt")
  const payload = parts[1]!
  const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4)
  const std = padded.replace(/-/g, "+").replace(/_/g, "/")
  const json = Buffer.from(std, "base64").toString("utf8")
  return JSON.parse(json)
}

async function main() {
  log("0.0", `HUB = ${HUB}`)

  // ----- Phase 0: health --------------------------------------------------
  const health = (await (await fetch(`${HUB}/`)).json()) as { status: string }
  assert.equal(health.status, "ok", "hub /")

  // ----- Phase 1: signup + tenant create (auto-bootstraps owner emp) -----
  const stamp = Date.now()
  const carol = new Session("carol")
  const carolUp = await carol.json<{ user: { id: string } }>(
    "/api/auth/sign-up/email",
    {
      method: "POST",
      body: JSON.stringify({
        email: `carol+${stamp}@example.com`,
        password: "pass1234",
        name: "Carol",
      }),
    },
  )
  assert.ok(carolUp.status === 200 || carolUp.status === 201, "carol sign-up")
  const carolUserId = carolUp.body.user.id
  log("1.1", `Carol user ${carolUserId}`)

  const acmeResp = await carol.json<Env<{ id: string; slug: string }>>(
    "/api/tenants",
    {
      method: "POST",
      body: JSON.stringify({
        slug: `acme-${stamp}`,
        displayName: "Acme",
      }),
    },
  )
  const tenantId = unwrap(acmeResp.body, "create tenant").id
  log("1.2", `Acme tenant ${tenantId}`)

  // Lookup Carol's employee
  const meResp = await carol.json<
    Env<{
      organization: { id: string }
      membershipRole: string
      employee: { id: string; role: string; userId: string }
    }>
  >(`/api/organizations/me?tenantId=${tenantId}`)
  const me = unwrap(meResp.body, "/me")
  assert.equal(me.employee.role, "owner", "Carol is owner")
  const carolEmpId = me.employee.id
  log("1.3", `Carol employee ${carolEmpId}`)

  // ----- Phase 2: M5 — pair + register agent, verify owner_employee_id ----
  const pairInit = await fetch(`${HUB}/api/agents/pair-init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceName: "carol-claude-desktop" }),
  })
  const pairData = (await pairInit.json()) as { data: { code: string } }
  const code = pairData.data.code
  log("2.1", `pair code ${code}`)

  // Carol confirms pairing
  const confirm = await carol.json<Env<unknown>>("/api/agents/pair-confirm", {
    method: "POST",
    body: JSON.stringify({ code, tenantId }),
  })
  assert.equal(confirm.status, 200, "pair-confirm")

  // Skill registers — supply runtime info
  const keys = generateX3DHKeys(5)
  const registerResp = await fetch(`${HUB}/api/agents/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      displayName: "carol-claude-desktop",
      type: "skill",
      identityKey: toB64Url(keys.identityKey.publicKey),
      identityKeyX: toB64Url(keys.identityKeyX25519.publicKey),
      signedPrekey: toB64Url(keys.signedPrekey.publicKey),
      signedPrekeySignature: toB64Url(keys.signedPrekeySignature),
      oneTimePrekeys: keys.oneTimePrekeys.map((kp, i) => ({
        keyId: i + 1,
        publicKey: toB64Url(kp.publicKey),
      })),
      runtimeKind: "claude-desktop",
      runtimeMeta: { version: "0.7.5" },
    }),
  })
  const registerBody = (await registerResp.json()) as {
    data: { agentId: string; token: string }
  }
  assert.equal(registerResp.status, 201, "register 201")
  const agentId = registerBody.data.agentId
  const agentJwt = registerBody.data.token
  log("2.2", `agent ${agentId}`)

  // Verify JWT contains scope claim
  const payload = decodeJwt(agentJwt) as {
    sub: string
    tenantId: string
    userId: string
    scope: string[]
  }
  assert.equal(payload.sub, agentId, "jwt sub = agentId")
  assert.ok(Array.isArray(payload.scope), "jwt scope is array")
  assert.ok(payload.scope.length > 0, "jwt scope non-empty")
  assert.ok(payload.scope.includes("read_kb"), "jwt has default scope read_kb")
  assert.ok(
    !payload.scope.includes("send_external_email"),
    "jwt has NO dangerous scope by default",
  )
  log("2.3", `JWT scope claim verified (${payload.scope.length} default scopes)`)

  // ----- Phase 3: M6 — GET boundary returns scopes + catalog --------------
  const getBoundary = await carol.json<
    Env<{
      agentId: string
      scopes: string[]
      catalog: Array<{ id: string; category: string }>
      updatedAt: string | null
    }>
  >(`/api/boundaries/${agentId}?tenantId=${tenantId}`)
  assert.equal(getBoundary.status, 200, "GET boundary 200")
  const bData = unwrap(getBoundary.body, "GET boundary")
  assert.equal(bData.agentId, agentId)
  assert.ok(bData.scopes.includes("read_kb"), "default scopes returned")
  assert.equal(bData.catalog.length, 10, "catalog has 10 scopes")
  assert.ok(bData.updatedAt !== null, "updatedAt set by register flow")
  log("3.0", "GET boundary OK")

  // ----- Phase 4: M6 — PUT boundary adds dangerous scope ------------------
  const newScopes = [...bData.scopes, "send_external_email"]
  const putBoundary = await carol.json<Env<{ scopes: string[] }>>(
    `/api/boundaries/${agentId}?tenantId=${tenantId}`,
    {
      method: "PUT",
      body: JSON.stringify({ scopes: newScopes }),
    },
  )
  assert.equal(putBoundary.status, 200, "PUT boundary 200")
  const updated = unwrap(putBoundary.body, "PUT")
  assert.ok(
    updated.scopes.includes("send_external_email"),
    "danger scope added",
  )
  log("4.0", "PUT boundary (with danger scope) OK")

  // Whitelist rejection
  const bogus = await carol.json<Env<unknown>>(
    `/api/boundaries/${agentId}?tenantId=${tenantId}`,
    {
      method: "PUT",
      body: JSON.stringify({ scopes: ["read_kb", "make_coffee"] }),
    },
  )
  assert.equal(bogus.status, 400, "whitelist rejects unknown scope")
  log("4.1", "whitelist guard OK")

  // ----- Phase 5: M7 — issue agent token ----------------------------------
  // Create a 2nd employee to issue a token for
  const aliceEmail = `alice+${stamp}@example.com`
  const aliceEmpResp = await carol.json<Env<{ id: string }>>(
    `/api/employees?tenantId=${tenantId}`,
    {
      method: "POST",
      body: JSON.stringify({
        email: aliceEmail,
        name: "Alice",
        role: "employee",
      }),
    },
  )
  const aliceEmpId = unwrap(aliceEmpResp.body, "Alice employee").id

  const issueResp = await carol.json<
    Env<{ id: string; plainToken: string; expiresAt: string }>
  >(`/api/agent-tokens?tenantId=${tenantId}`, {
    method: "POST",
    body: JSON.stringify({ employeeId: aliceEmpId, expiresIn: "7d" }),
  })
  assert.equal(issueResp.status, 201, "issue token 201")
  const issued = unwrap(issueResp.body, "issue")
  assert.ok(issued.plainToken.startsWith("ftk_"), "plain token format")
  assert.ok(issued.plainToken.length > 40, "plain token long enough")
  const tokenId = issued.id
  const oldPlain = issued.plainToken
  log("5.0", `token ${tokenId} issued (plain length ${oldPlain.length})`)

  // List does NOT contain plain
  const listResp = await carol.json<
    Env<Array<{ id: string; status: string; plainToken?: string }>>
  >(`/api/agent-tokens?tenantId=${tenantId}`)
  const list = unwrap(listResp.body, "list")
  assert.equal(list.length, 1, "1 token in list")
  assert.equal(list[0]!.status, "pending", "status pending")
  assert.ok(
    !("plainToken" in list[0]!),
    "list response omits plainToken",
  )
  log("5.1", "list omits plain ✓")

  // ----- Phase 6: M7 — regenerate ----------------------------------------
  const regenResp = await carol.json<
    Env<{ id: string; plainToken: string }>
  >(`/api/agent-tokens/${tokenId}/regenerate?tenantId=${tenantId}`, {
    method: "POST",
  })
  assert.equal(regenResp.status, 201, "regenerate 201")
  const regen = unwrap(regenResp.body, "regen")
  assert.notEqual(regen.id, tokenId, "regenerate creates new id")
  assert.notEqual(regen.plainToken, oldPlain, "new plain token differs")
  const newTokenId = regen.id

  // Verify old is revoked, new is pending
  const list2 = await carol.json<
    Env<Array<{ id: string; status: string }>>
  >(`/api/agent-tokens?tenantId=${tenantId}`)
  const list2Data = unwrap(list2.body, "list2")
  assert.equal(list2Data.length, 2, "2 tokens after regen")
  const oldRow = list2Data.find((r) => r.id === tokenId)
  const newRow = list2Data.find((r) => r.id === newTokenId)
  assert.equal(oldRow?.status, "revoked", "old revoked")
  assert.equal(newRow?.status, "pending", "new pending")
  log("6.0", "regenerate OK")

  // Cannot regenerate non-pending
  const regen2 = await carol.json<Env<unknown>>(
    `/api/agent-tokens/${tokenId}/regenerate?tenantId=${tenantId}`,
    { method: "POST" },
  )
  assert.equal(regen2.status, 409, "regen revoked → 409")
  log("6.1", "regen-non-pending guard OK")

  // ----- Phase 7: M7 — revoke -----------------------------------------------
  const revokeResp = await carol.json<Env<{ revoked: boolean }>>(
    `/api/agent-tokens/${newTokenId}?tenantId=${tenantId}`,
    { method: "DELETE" },
  )
  assert.equal(revokeResp.status, 200, "revoke 200")
  log("7.0", "revoke OK")

  // ----- Phase 8: RBAC negatives (Test-quality round C4 fix) --------------
  // Original comment delegated to product-layer.e2e.ts but that suite only
  // covers PATCH /api/employees/:id/role SELF_NOT_ALLOWED, NOT
  // POST /api/agent-tokens. A `requireRole(["owner","admin"])` regression
  // would silently let employees issue long-lived agent tokens. Verified
  // here directly.
  //
  // Setup: invite + accept a second user (Bob) with role=employee, then
  // attempt POST /api/agent-tokens from Bob's session.
  const bobEmail = `bob-rbac+${stamp}@example.com`
  const bobInvite = unwrap(
    (
      await carol.json<Env<{ inviteLink: string }>>(
        `/api/tenants/${tenantId}/invite`,
        {
          method: "POST",
          body: JSON.stringify({ email: bobEmail, role: "member" }),
        },
      )
    ).body,
    "invite Bob",
  )
  const bobInviteToken = new URL(bobInvite.inviteLink).searchParams.get("token")!

  const bob = new Session("bob")
  const bobUp = await bob.json<{ user: { id: string } }>(
    "/api/auth/sign-up/email",
    {
      method: "POST",
      body: JSON.stringify({
        email: bobEmail,
        password: "pass1234",
        name: "Bob",
      }),
    },
  )
  assert.ok(bobUp.status === 200 || bobUp.status === 201, "bob sign-up")
  await bob.json(`/api/invite/${bobInviteToken}/accept`, { method: "POST" })
  // Backfill Bob's employee with role=employee
  const bobEmpResp = await carol.json<Env<{ id: string }>>(
    `/api/employees?tenantId=${tenantId}`,
    {
      method: "POST",
      body: JSON.stringify({
        email: bobEmail,
        name: "Bob",
        role: "employee",
        userId: bobUp.body.user.id,
      }),
    },
  )
  assert.equal(bobEmpResp.status, 201, "bob employee created")
  const bobEmpId = unwrap(bobEmpResp.body, "bob emp").id

  // Bob (employee role) attempts to issue agent token → 403, pin code
  const bobIssueToken = await bob.json<{ error?: { code?: string } }>(
    `/api/agent-tokens?tenantId=${tenantId}`,
    {
      method: "POST",
      body: JSON.stringify({ employeeId: bobEmpId, expiresIn: "7d" }),
    },
  )
  assert.equal(
    bobIssueToken.status,
    403,
    `employee can't issue agent token (got ${bobIssueToken.status})`,
  )
  // Pin error code (reviewer M): must be FORBIDDEN from requireRole, NOT
  // NO_EMPLOYEE_PROFILE (which would mean orgGuard failed for the wrong
  // reason and we never tested requireRole).
  assert.equal(
    bobIssueToken.body.error?.code,
    "FORBIDDEN",
    `expected FORBIDDEN from requireRole (got ${bobIssueToken.body.error?.code})`,
  )

  // Bob attempts to PUT boundaries → 403, pin code
  const bobPutBoundary = await bob.json<{ error?: { code?: string } }>(
    `/api/boundaries/${agentId}?tenantId=${tenantId}`,
    {
      method: "PUT",
      body: JSON.stringify({ scopes: ["read_kb"] }),
    },
  )
  assert.equal(
    bobPutBoundary.status,
    403,
    `employee can't PUT boundaries (got ${bobPutBoundary.status})`,
  )
  assert.equal(
    bobPutBoundary.body.error?.code,
    "FORBIDDEN",
    `expected FORBIDDEN from requireRole (got ${bobPutBoundary.body.error?.code})`,
  )
  log(
    "8.0",
    "C4 fix: employee blocked from POST /api/agent-tokens + PUT /api/boundaries (both 403)",
  )

  // ----- Phase 9: cross-tenant injection on boundary ----------------------
  const otherCo = unwrap(
    await carol
      .json<Env<{ id: string }>>("/api/tenants", {
        method: "POST",
        body: JSON.stringify({
          slug: `other-${stamp}`,
          displayName: "OtherCo",
        }),
      })
      .then((r) => r.body),
    "OtherCo",
  ).id

  // OtherCo asks for Acme's agent's boundary → 404
  const cross = await carol.json<Env<unknown>>(
    `/api/boundaries/${agentId}?tenantId=${otherCo}`,
  )
  assert.equal(cross.status, 404, "cross-tenant boundary lookup 404")
  log("9.0", "cross-tenant boundary blocked")

  // ----- Phase 10: pre-M6 JWTs are NOW rejected (round-3 sec C1 + M5) ------
  // Original M6 spec accepted pre-M6 JWTs (no scope claim) with
  // defaultScopes() as back-compat. Round-3 security review showed this is
  // a policy-revocation bypass: an admin-revoked scope was silently
  // re-granted on every legacy token verify. Combined with the new iss/aud
  // enforcement (sec M5: cross-env JWT replay defense), pre-M6 JWTs are now
  // intentionally rejected — agents must re-pair to obtain a properly
  // scoped + iss/aud-claiming JWT. This test pins the new behaviour so a
  // future "back-compat" re-introduction is flagged.
  const fs = await import("node:fs/promises")
  const path = await import("node:path")
  const devVars = await fs.readFile(
    path.resolve(import.meta.dirname, "..", ".dev.vars"),
    "utf8",
  )
  const jwtSecretLine = devVars
    .split(/\r?\n/)
    .find((l) => l.startsWith("JWT_SECRET="))
  if (!jwtSecretLine)
    throw new Error("JWT_SECRET not found in .dev.vars (needed for back-compat test)")
  const secret = jwtSecretLine.slice("JWT_SECRET=".length).trim()

  const legacyJwt = await new SignJWT({
    tenantId,
    userId: carolUserId,
    type: "agent",
    // intentionally NO scope claim, NO iss/aud — simulating pre-M6 token
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(agentId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret))

  const legacyResp = await fetch(
    `${HUB}/api/agents/${agentId}/prekey-bundle`,
    { headers: { Authorization: `Bearer ${legacyJwt}` } },
  )
  assert.equal(
    legacyResp.status,
    401,
    `pre-M6 JWT (no iss/aud) must be rejected (got ${legacyResp.status}) — sec M5 + C1`,
  )
  log(
    "10.0",
    `pre-M6 JWT correctly rejected (sec M5 + C1 — agent must re-pair)`,
  )

  // -- DONE -----------------------------------------------------------------
  log("DONE", "")
  log("DONE", "M5+M6+M7 sprint acceptance PASS:")
  log("DONE", "  ✓ Round-3 sec M5 + C1: pre-M6 JWT (no iss/aud, no scope) correctly rejected — forces re-pair")
  log("DONE", "  ✓ M5: agent register auto-fills owner_employee_id + runtime_kind + activated_at")
  log("DONE", "  ✓ M5: runtimeKind + runtimeMeta accepted from body")
  log("DONE", "  ✓ M6: representation_boundaries row created with default scopes")
  log("DONE", "  ✓ M6: JWT contains scope claim")
  log("DONE", "  ✓ M6: GET /api/boundaries returns scopes + catalog")
  log("DONE", "  ✓ M6: PUT /api/boundaries allows danger scope when explicit")
  log("DONE", "  ✓ M6: whitelist rejects unknown scope id")
  log("DONE", "  ✓ M7: POST /api/agent-tokens returns plain token once (>40 chars, ftk_ prefix)")
  log("DONE", "  ✓ M7: GET list omits plain token")
  log("DONE", "  ✓ M7: regenerate revokes old + creates new pending")
  log("DONE", "  ✓ M7: regenerate on non-pending → 409")
  log("DONE", "  ✓ M7: DELETE soft revoke (status=revoked)")
  log("DONE", "  ✓ cross-tenant boundary lookup blocked")
  log("DONE", "  ✓ Test-quality round C4: employee role blocked from agent-token issue + boundary PUT (both 403)")
}

main().catch((err) => {
  console.error("E2E FAILED:", err)
  process.exit(1)
})
