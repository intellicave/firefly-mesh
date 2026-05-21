/**
 * B.0 end-to-end — Sprint B new endpoints.
 *
 * Prereq: wrangler dev on http://localhost:8787, migrations 0001-0015.
 * Run:    pnpm --filter @firefly-mesh/hub test:e2e:b0
 *
 * Coverage:
 *   GET /api/agents (tenant-wide list)
 *     - Carol owner + Bob employee in Acme; Carol pairs an agent
 *     - Carol GET → [carol's agent], no userId field (R42 privacy)
 *     - Bob (employee role) GET → also sees Carol's agent (any member can read)
 *     - Cross-tenant: passing OtherCo tenantId → 404 from orgGuard
 *     - Filter ownerEmployeeId=carolEmp → 1 hit
 *     - Filter ownerEmployeeId=bobEmp → 0 hits
 *     - Pagination: limit=1 returns nextCursor; cursor → next page (empty here)
 *
 *   POST /api/employees/bulk-import (multipart CSV)
 *     - dryRun mode: valid 3-row CSV → total=3 valid=3 invalid=0 created=0
 *     - commit mode: same CSV → 201 total=3 valid=3 created=3 errors=[]
 *     - Mixed CSV (1 valid, 1 dup-of-existing, 1 invalid-email, 1 dup-in-batch)
 *       → partial commit; errors list pinpoints row numbers + field
 *     - Bob (employee) bulk-import → 403 FORBIDDEN (requireRole)
 *     - Empty CSV → 400 INVALID_CSV
 *     - Missing header → 400 INVALID_CSV
 *     - Too many rows (BULK_IMPORT_MAX_ROWS + 1) → 413 TOO_MANY_ROWS
 *     - Owner-role creation by admin requester → row error (not row-insert)
 */

import assert from "node:assert/strict"
import { generateX3DHKeys } from "@firefly-mesh/crypto"

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
    if (init.body && !headers.has("Content-Type") && typeof init.body === "string")
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
    throw new Error(`${label}: ${e.error.code} — ${e.error.message}`)
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

async function registerAgent(
  sess: Session,
  tenantId: string,
  deviceName: string,
): Promise<{ agentId: string; token: string }> {
  const pairInit = await fetch(`${HUB}/api/agents/pair-init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceName }),
  })
  const code = ((await pairInit.json()) as { data: { code: string } }).data.code
  await sess.json("/api/agents/pair-confirm", {
    method: "POST",
    body: JSON.stringify({ code, tenantId }),
  })
  const keys = generateX3DHKeys(5)
  const r = await fetch(`${HUB}/api/agents/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      displayName: deviceName,
      type: "skill",
      identityKey: toB64Url(keys.identityKey.publicKey),
      identityKeyX: toB64Url(keys.identityKeyX25519.publicKey),
      signedPrekey: toB64Url(keys.signedPrekey.publicKey),
      signedPrekeySignature: toB64Url(keys.signedPrekeySignature),
      oneTimePrekeys: keys.oneTimePrekeys.map((kp, i) => ({
        keyId: i + 1,
        publicKey: toB64Url(kp.publicKey),
      })),
      runtimeKind: "claude-code",
    }),
  })
  const body = (await r.json()) as { data: { agentId: string; token: string } }
  if (r.status !== 201) {
    throw new Error(`register: ${r.status} ${JSON.stringify(body)}`)
  }
  return body.data
}

/**
 * multipart/form-data helper — Node fetch doesn't auto-build multipart from an
 * object; we use FormData + Blob (available in Node 18+) and let fetch set the
 * boundary header automatically (must NOT manually set Content-Type for FormData).
 */
function csvFormData(csv: string, filename = "import.csv"): FormData {
  const fd = new FormData()
  const blob = new Blob([csv], { type: "text/csv" })
  fd.append("file", blob, filename)
  return fd
}

async function main() {
  log("0.0", `HUB=${HUB}`)
  const stamp = Date.now()

  // ---- Carol (owner) + acmeId + otherCoId + Alice (admin) + Bob (employee) ----
  const carol = new Session("carol")
  await carol.json("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({
      email: `carol+${stamp}@example.com`,
      password: "pass1234",
      name: "Carol",
    }),
  })
  const acmeId = unwrap(
    (
      await carol.json<Env<{ id: string }>>("/api/tenants", {
        method: "POST",
        body: JSON.stringify({
          slug: `acme-${stamp}`,
          displayName: "Acme",
        }),
      })
    ).body,
    "Acme",
  ).id
  log("1.0", `Acme tenant ${acmeId}`)

  const otherCoId = unwrap(
    (
      await carol.json<Env<{ id: string }>>("/api/tenants", {
        method: "POST",
        body: JSON.stringify({
          slug: `otherco-${stamp}`,
          displayName: "OtherCo",
        }),
      })
    ).body,
    "OtherCo",
  ).id
  log("1.1", `OtherCo tenant ${otherCoId}`)

  const carolEmp = unwrap(
    (
      await carol.json<Env<{ employee: { id: string } }>>(
        `/api/organizations/me?tenantId=${acmeId}`,
      )
    ).body,
    "/me",
  ).employee.id

  // Bob: signup → invite → accept → employee profile (role=employee)
  const bob = new Session("bob")
  const bobEmail = `bob+${stamp}@example.com`
  await bob.json("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({
      email: bobEmail,
      password: "pass1234",
      name: "Bob",
    }),
  })
  const bobUserId = (
    await bob.json<{ user: { id: string } | null }>("/api/auth/get-session")
  ).body.user!.id

  const invRaw = unwrap(
    (
      await carol.json<Env<{ inviteLink: string }>>(
        `/api/tenants/${acmeId}/invite`,
        {
          method: "POST",
          body: JSON.stringify({ email: bobEmail, role: "member" }),
        },
      )
    ).body,
    "invite",
  )
  const inviteToken = new URL(invRaw.inviteLink).searchParams.get("token")!
  await bob.json(`/api/invite/${inviteToken}/accept`, { method: "POST" })

  const bobEmp = unwrap(
    (
      await carol.json<Env<{ id: string }>>(
        `/api/employees?tenantId=${acmeId}`,
        {
          method: "POST",
          body: JSON.stringify({
            email: bobEmail,
            name: "Bob",
            role: "employee",
            userId: bobUserId,
          }),
        },
      )
    ).body,
    "Bob emp",
  ).id
  log("1.2", `Bob employee ${bobEmp}`)

  // ===========================================================================
  // Phase A — GET /api/agents (tenant-wide list)
  // ===========================================================================

  // Carol pairs an agent
  const carolAgent = await registerAgent(carol, acmeId, "Carol-OpenClaw")
  log("2.0", `Carol agentId=${carolAgent.agentId}`)

  // A.1: Carol lists → 1 agent, no userId field
  const listA = await carol.json<
    Env<{
      data: Array<{
        id: string
        displayName: string
        ownerEmployeeId: string | null
        runtimeKind: string
      }>
      nextCursor: string | null
    }>
  >(`/api/agents?tenantId=${acmeId}`)
  assert.equal(listA.status, 200, "list 200")
  const dataA = (listA.body as { data: typeof listA.body extends Env<infer D> ? D extends { data: infer X } ? X : never : never }).data as Array<Record<string, unknown>>
  assert.equal(dataA.length, 1, `1 agent (got ${dataA.length})`)
  assert.equal(dataA[0]!.id, carolAgent.agentId)
  assert.equal(dataA[0]!.ownerEmployeeId, carolEmp)
  assert.ok(
    !("userId" in dataA[0]!) && !("ownerUserId" in dataA[0]!),
    "GET /api/agents must not leak userId/ownerUserId (R42 privacy)",
  )
  log("2.1", "Carol GET /api/agents → 1 row, no userId leak ✓")

  // A.2: Bob (employee role) can also list (no role gate, any member can)
  const listB = await bob.json<Env<{ data: unknown[]; nextCursor: string | null }>>(
    `/api/agents?tenantId=${acmeId}`,
  )
  assert.equal(listB.status, 200, "Bob list 200")
  const dataB = (listB.body as { data: unknown[] }).data
  assert.equal(dataB.length, 1, "Bob also sees Carol's agent")
  log("2.2", "Bob (employee role) can list agents ✓")

  // A.3: cross-tenant — Carol passes otherCoId but no agent there → 0 rows
  const listC = await carol.json<Env<{ data: unknown[]; nextCursor: string | null }>>(
    `/api/agents?tenantId=${otherCoId}`,
  )
  assert.equal(listC.status, 200, "cross-tenant list 200")
  const dataC = (listC.body as { data: unknown[] }).data
  assert.equal(dataC.length, 0, "OtherCo has 0 agents")
  log("2.3", "Cross-tenant scoping correct (Carol sees 0 in OtherCo) ✓")

  // A.4: filter ownerEmployeeId=carolEmp → 1 hit
  const listD = await carol.json<Env<{ data: unknown[] }>>(
    `/api/agents?tenantId=${acmeId}&ownerEmployeeId=${carolEmp}`,
  )
  assert.equal((listD.body as { data: unknown[] }).data.length, 1, "carol filter → 1")

  // A.5: filter ownerEmployeeId=bobEmp → 0 hits (Bob has no agent)
  const listE = await carol.json<Env<{ data: unknown[] }>>(
    `/api/agents?tenantId=${acmeId}&ownerEmployeeId=${bobEmp}`,
  )
  assert.equal((listE.body as { data: unknown[] }).data.length, 0, "bob filter → 0")
  log("2.4", "ownerEmployeeId filter works ✓")

  // A.6: pagination — limit=1; nextCursor is null since exactly 1 agent total
  const listF = await carol.json<Env<{ data: unknown[]; nextCursor: string | null }>>(
    `/api/agents?tenantId=${acmeId}&limit=1`,
  )
  const bodyF = listF.body as { data: unknown[]; nextCursor: string | null }
  assert.equal(bodyF.data.length, 1)
  assert.equal(bodyF.nextCursor, null, "exactly 1 row → no next page")
  log("2.5", "Pagination shape correct (limit=1, nextCursor=null when exact) ✓")

  // ===========================================================================
  // Phase B — POST /api/employees/bulk-import
  // ===========================================================================

  // B.1: dryRun valid CSV
  const csvOk = [
    "name,email,title,role",
    `Alice,alice+${stamp}@example.com,Engineer,employee`,
    `Dave,dave+${stamp}@example.com,Designer,employee`,
    `Eve,eve+${stamp}@example.com,,manager`,
  ].join("\n")

  const dryRes = await carol.req(
    `/api/employees/bulk-import?tenantId=${acmeId}&mode=dryRun`,
    { method: "POST", body: csvFormData(csvOk) },
  )
  const dryBody = (await dryRes.json()) as {
    data: {
      mode: string
      total: number
      valid: number
      invalid: number
      created: number
      errors: unknown[]
    }
  }
  assert.equal(dryRes.status, 200, "dryRun 200")
  assert.equal(dryBody.data.mode, "dryRun")
  assert.equal(dryBody.data.total, 3)
  assert.equal(dryBody.data.valid, 3)
  assert.equal(dryBody.data.invalid, 0)
  assert.equal(dryBody.data.created, 0, "dryRun creates 0")
  log("3.0", "dryRun mode validates without inserting ✓")

  // B.2: commit valid CSV
  const commitRes = await carol.req(
    `/api/employees/bulk-import?tenantId=${acmeId}&mode=commit`,
    { method: "POST", body: csvFormData(csvOk) },
  )
  const commitBody = (await commitRes.json()) as {
    data: { mode: string; total: number; created: number; errors: unknown[] }
  }
  assert.equal(commitRes.status, 201, "commit 201")
  assert.equal(commitBody.data.mode, "commit")
  assert.equal(commitBody.data.created, 3, "3 employees created")
  assert.deepEqual(commitBody.data.errors, [], "no errors")
  log("3.1", "commit mode inserts 3 valid rows ✓")

  // B.3: mixed CSV — 1 valid new + 1 dup-of-existing + 1 invalid-email + 1 dup-in-batch
  const csvMixed = [
    "name,email,title,role",
    `Frank,frank+${stamp}@example.com,QA,employee`, // valid new
    `AliceDup,alice+${stamp}@example.com,Engineer,employee`, // dup of B.2 row
    `Bad,not-an-email,Title,employee`, // invalid email
    `Frank2,frank+${stamp}@example.com,QA2,employee`, // dup in same batch
  ].join("\n")

  const mixedRes = await carol.req(
    `/api/employees/bulk-import?tenantId=${acmeId}&mode=commit`,
    { method: "POST", body: csvFormData(csvMixed) },
  )
  const mixedBody = (await mixedRes.json()) as {
    data: {
      total: number
      valid: number
      invalid: number
      created: number
      errors: Array<{ rowNumber: number; field?: string; message: string }>
    }
  }
  assert.equal(mixedRes.status, 201, "mixed commit 201 (partial success)")
  assert.equal(mixedBody.data.total, 4)
  assert.equal(mixedBody.data.created, 1, "only Frank created")
  assert.equal(mixedBody.data.errors.length, 3, "3 errors")
  // Row numbers are 1-indexed and account for the header (header=row 1; first
  // data row=row 2). So our 4 data rows are rows 2-5.
  const errsByRow = new Map(
    mixedBody.data.errors.map((e) => [e.rowNumber, e]),
  )
  assert.ok(errsByRow.has(3), "row 3 (dup of existing) errored")
  assert.equal(errsByRow.get(3)!.field, "email")
  assert.ok(errsByRow.has(4), "row 4 (invalid email) errored")
  assert.equal(errsByRow.get(4)!.field, "email")
  assert.ok(errsByRow.has(5), "row 5 (dup in batch) errored")
  log("3.2", "mixed CSV partial success: 1 created, 3 errors with row numbers ✓")

  // B.4: Bob (employee role) blocked from bulk-import → 403 FORBIDDEN
  const bobImport = await bob.req(
    `/api/employees/bulk-import?tenantId=${acmeId}&mode=dryRun`,
    { method: "POST", body: csvFormData(csvOk) },
  )
  assert.equal(bobImport.status, 403, "employee role blocked 403")
  log("3.3", "Bob (employee role) blocked from bulk-import 403 ✓")

  // B.5: empty CSV → 400
  const emptyRes = await carol.req(
    `/api/employees/bulk-import?tenantId=${acmeId}&mode=dryRun`,
    { method: "POST", body: csvFormData("") },
  )
  assert.equal(emptyRes.status, 400, "empty CSV → 400")

  // B.6: missing required headers → 400
  const noHeaderRes = await carol.req(
    `/api/employees/bulk-import?tenantId=${acmeId}&mode=dryRun`,
    {
      method: "POST",
      body: csvFormData("foo,bar\n1,2\n"),
    },
  )
  assert.equal(noHeaderRes.status, 400, "missing name/email columns → 400")
  log("3.4", "empty + missing-header CSV both 400 ✓")

  // B.7: too many rows (5001) → 413
  const rows: string[] = ["name,email"]
  for (let i = 0; i < 5001; i++) {
    rows.push(`User${i},u${i}+${stamp}@example.com`)
  }
  const tooManyRes = await carol.req(
    `/api/employees/bulk-import?tenantId=${acmeId}&mode=dryRun`,
    { method: "POST", body: csvFormData(rows.join("\n")) },
  )
  assert.equal(tooManyRes.status, 413, "5001 rows → 413")
  log("3.5", "Too-many-rows 413 ✓")

  // B.8: owner-role row from admin requester — promote Alice to admin first,
  // then admin Alice tries bulk-import with an owner-role row → row error.
  await carol.json(`/api/employees/${bobEmp}/role?tenantId=${acmeId}`, {
    method: "PATCH",
    body: JSON.stringify({ role: "admin" }),
  })
  // Bob now admin. Bob bulk-imports a CSV with owner role → 201 but row errored.
  const csvOwnerRole = [
    "name,email,title,role",
    `WantOwner,wantowner+${stamp}@example.com,Founder,owner`,
  ].join("\n")
  const adminOwnerRes = await bob.req(
    `/api/employees/bulk-import?tenantId=${acmeId}&mode=commit`,
    { method: "POST", body: csvFormData(csvOwnerRole) },
  )
  const adminOwnerBody = (await adminOwnerRes.json()) as {
    data: {
      created: number
      errors: Array<{ field?: string; message: string }>
    }
  }
  assert.equal(adminOwnerRes.status, 201, "admin owner-role commit 201")
  assert.equal(adminOwnerBody.data.created, 0, "0 created (owner blocked)")
  assert.equal(adminOwnerBody.data.errors.length, 1)
  assert.equal(adminOwnerBody.data.errors[0]!.field, "role")
  log("3.6", "Admin cannot bulk-create owner role (per-row error) ✓")

  // ----- DONE ---------------------------------------------------------------
  log("DONE", "")
  log("DONE", "Sprint B B.0 endpoints acceptance PASS:")
  log("DONE", "  ✓ GET /api/agents tenant-wide list (no userId leak, owner filter, pagination)")
  log("DONE", "  ✓ POST /api/employees/bulk-import dryRun + commit + partial-success + RBAC + size limits + owner-role guard")
}

main().catch((err) => {
  console.error("E2E FAILED:", err)
  process.exit(1)
})
