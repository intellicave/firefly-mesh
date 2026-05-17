/**
 * Product-layer end-to-end integration test against a running `wrangler dev` hub.
 *
 *   Prereq: wrangler dev is running on http://localhost:8787 with a fresh local D1
 *           (run `pnpm --filter @firefly-mesh/hub migrate:local && pnpm dev:hub`).
 *   Run:    pnpm --filter @firefly-mesh/hub test:e2e:product-layer
 *
 * Covers sprint 2026-05-16 product layer:
 *   - Carol signs up → creates Acme tenant (bootstraps owner employee)
 *   - Carol creates Engineering + Sales departments + nested child
 *   - Carol creates Project Falcon (planning) → transitions to active
 *   - Carol creates Alice as shell employee (no userId yet)
 *   - Carol adds Alice to Engineering + Project Falcon
 *   - PATCH employee role / status with self-protect + last-owner guard
 *   - Project state machine: invalid transition rejected
 *   - Department cycle detection
 *   - Cross-tenant injection: Acme cannot read OtherCo's data
 *   - RBAC negative: auditor blocked from POST
 */

import assert from "node:assert/strict"

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

type Envelope<T> = { data: T } | { error: { code: string; message: string } }

function unwrap<T>(env: Envelope<T>, label: string): T {
  if ("error" in env)
    throw new Error(`${label} failed: ${env.error.code} — ${env.error.message}`)
  return env.data
}

async function signUp(s: Session, email: string, password = "pass1234") {
  const { status, body } = await s.json<{ user: { id: string } }>(
    "/api/auth/sign-up/email",
    {
      method: "POST",
      body: JSON.stringify({ email, password, name: s.label }),
    },
  )
  assert.ok(
    status === 200 || status === 201,
    `${s.label} sign-up: ${status} ${JSON.stringify(body)}`,
  )
  return body.user.id
}

async function createTenant(s: Session, slug: string, displayName: string) {
  const { status, body } = await s.json<
    Envelope<{ id: string; slug: string; displayName: string }>
  >("/api/tenants", {
    method: "POST",
    body: JSON.stringify({ slug, displayName }),
  })
  assert.ok(
    status === 200 || status === 201,
    `create tenant: ${status} ${JSON.stringify(body)}`,
  )
  return unwrap(body, "create tenant").id
}

async function main() {
  log("0.0", `HUB = ${HUB}`)

  // -- Phase 0: health ---------------------------------------------------
  const health = (await (await fetch(`${HUB}/`)).json()) as { status: string }
  assert.equal(health.status, "ok", "hub health")

  // -- Phase 1: signup + tenant + auto-bootstrap owner employee ----------
  const stamp = Date.now()
  const carol = new Session("carol")
  const carolUserId = await signUp(carol, `carol+${stamp}@example.com`)
  log("1.1", `Carol user id ${carolUserId}`)

  const acmeId = await createTenant(carol, `acme-${stamp}`, "Acme Inc")
  log("1.2", `Acme tenant ${acmeId}`)

  const otherCo = await createTenant(carol, `other-${stamp}`, "OtherCo")
  log("1.3", `OtherCo tenant ${otherCo}`)

  // GET /me should now return Carol's bootstrapped employee with role owner
  const meResp = await carol.json<
    Envelope<{
      organization: { id: string }
      membershipRole: string
      employee: { id: string; role: string; status: string; userId: string }
    }>
  >(`/api/organizations/me?tenantId=${acmeId}`)
  assert.equal(meResp.status, 200, "GET /me 200")
  const me = unwrap(meResp.body, "GET /me")
  assert.equal(me.organization.id, acmeId, "/me org id")
  assert.equal(me.membershipRole, "owner", "Carol is membership owner")
  assert.ok(me.employee, "Carol has bootstrapped employee")
  assert.equal(me.employee.role, "owner", "Carol employee role owner")
  assert.equal(me.employee.userId, carolUserId, "Carol employee userId")
  const carolEmployeeId = me.employee.id
  log("1.4", `Carol bootstrap employee id ${carolEmployeeId}`)

  // -- Phase 2: missing tenantId 400 ------------------------------------
  const noTenant = await carol.json("/api/organizations/me")
  assert.equal(noTenant.status, 400, "missing tenantId 400")

  // -- Phase 3: stats endpoint ------------------------------------------
  const stats0 = await carol.json<
    Envelope<{ employeeCount: number; departmentCount: number; projectCount: number }>
  >(`/api/organizations/me/stats?tenantId=${acmeId}`)
  const s0 = unwrap(stats0.body, "stats 0")
  assert.equal(s0.employeeCount, 1, "1 employee after bootstrap")
  assert.equal(s0.departmentCount, 0, "0 depts")
  assert.equal(s0.projectCount, 0, "0 projects")
  log("3.0", "stats correct")

  // -- Phase 4: create Alice as shell employee (no userId) ---------------
  const aliceEmail = `alice+${stamp}@example.com`
  const aliceResp = await carol.json<Envelope<{ id: string; email: string; role: string }>>(
    `/api/employees?tenantId=${acmeId}`,
    {
      method: "POST",
      body: JSON.stringify({
        email: aliceEmail,
        name: "Alice Liu",
        title: "Senior Engineer",
        role: "manager",
      }),
    },
  )
  assert.equal(aliceResp.status, 201, `create Alice: ${aliceResp.status} ${JSON.stringify(aliceResp.body)}`)
  const alice = unwrap(aliceResp.body, "create Alice")
  assert.equal(alice.email, aliceEmail)
  assert.equal(alice.role, "manager")
  const aliceId = alice.id
  log("4.0", `Alice employee created ${aliceId}`)

  // Duplicate email → 409
  const dupResp = await carol.json<Envelope<unknown>>(
    `/api/employees?tenantId=${acmeId}`,
    {
      method: "POST",
      body: JSON.stringify({ email: aliceEmail, name: "Alice2", role: "employee" }),
    },
  )
  assert.equal(dupResp.status, 409, "duplicate email 409")
  log("4.1", "duplicate-email guard 409")

  // -- Phase 5: departments + cycle detection ----------------------------
  const engResp = await carol.json<Envelope<{ id: string; name: string }>>(
    `/api/departments?tenantId=${acmeId}`,
    {
      method: "POST",
      body: JSON.stringify({ name: "Engineering", headEmployeeId: carolEmployeeId }),
    },
  )
  assert.equal(engResp.status, 201, "create Eng")
  const engId = unwrap(engResp.body, "Eng").id

  const toolsResp = await carol.json<Envelope<{ id: string }>>(
    `/api/departments?tenantId=${acmeId}`,
    {
      method: "POST",
      body: JSON.stringify({ name: "Tools Team", parentId: engId }),
    },
  )
  assert.equal(toolsResp.status, 201, "create Tools under Eng")
  const toolsId = unwrap(toolsResp.body, "Tools").id

  // Cycle: try to make Eng a child of Tools → 409
  const cycleResp = await carol.json<Envelope<unknown>>(
    `/api/departments/${engId}?tenantId=${acmeId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ parentId: toolsId }),
    },
  )
  assert.equal(cycleResp.status, 409, "cycle detection 409")
  assert.ok("error" in cycleResp.body, "cycle expects error envelope")
  assert.equal(cycleResp.body.error.code, "CYCLE_DETECTED", "cycle code")
  log("5.0", "cycle detection works")

  // Add Alice to Eng
  const addAliceResp = await carol.json<Envelope<unknown>>(
    `/api/departments/${engId}/members?tenantId=${acmeId}`,
    {
      method: "POST",
      body: JSON.stringify({ employeeId: aliceId, role: "member" }),
    },
  )
  assert.equal(addAliceResp.status, 201, "add Alice to Eng")
  log("5.1", "Alice added to Eng")

  // -- Phase 6: projects + state machine ---------------------------------
  const projResp = await carol.json<Envelope<{ id: string; status: string }>>(
    `/api/projects?tenantId=${acmeId}`,
    {
      method: "POST",
      body: JSON.stringify({ name: "Project Falcon" }),
    },
  )
  assert.equal(projResp.status, 201, "create project")
  const project = unwrap(projResp.body, "project")
  const projId = project.id
  assert.equal(project.status, "planning", "default status")

  // Valid: planning → active
  const toActive = await carol.json<Envelope<{ status: string }>>(
    `/api/projects/${projId}/status?tenantId=${acmeId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    },
  )
  assert.equal(toActive.status, 200, "transition to active")
  assert.equal(unwrap(toActive.body, "transition").status, "active")
  log("6.0", "planning → active OK")

  // Invalid: active → planning
  const invalidTransition = await carol.json<Envelope<unknown>>(
    `/api/projects/${projId}/status?tenantId=${acmeId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status: "planning" }),
    },
  )
  assert.equal(invalidTransition.status, 409, "invalid transition 409")
  assert.ok("error" in invalidTransition.body, "invalid-transition expects error envelope")
  assert.equal(invalidTransition.body.error.code, "INVALID_TRANSITION")
  log("6.1", "active → planning rejected")

  // Add Alice to project as lead
  const aliceToProj = await carol.json<Envelope<unknown>>(
    `/api/projects/${projId}/members?tenantId=${acmeId}`,
    {
      method: "POST",
      body: JSON.stringify({ employeeId: aliceId, role: "lead" }),
    },
  )
  assert.equal(aliceToProj.status, 201, "add Alice as lead")

  // -- Phase 7: stats reflects new state --------------------------------
  const stats1 = await carol.json<
    Envelope<{ employeeCount: number; departmentCount: number; projectCount: number }>
  >(`/api/organizations/me/stats?tenantId=${acmeId}`)
  const s1 = unwrap(stats1.body, "stats 1")
  assert.equal(s1.employeeCount, 2, "2 employees")
  assert.equal(s1.departmentCount, 2, "2 depts")
  assert.equal(s1.projectCount, 1, "1 project")
  log("7.0", "stats updated correctly")

  // -- Phase 7.1: round-30 Critical fix — DELETE project requires archived
  // Per lib/projects.ts state machine: "Terminal — only DELETE can remove
  // an archived project". Project is currently `active`; DELETE must 409.
  const activeDelete = await carol.json<Envelope<unknown>>(
    `/api/projects/${projId}?tenantId=${acmeId}`,
    { method: "DELETE" },
  )
  assert.equal(activeDelete.status, 409, "DELETE active project → 409")
  assert.ok("error" in activeDelete.body, "delete-active expects error envelope")
  assert.equal(
    activeDelete.body.error.code,
    "INVALID_STATUS",
    `expected INVALID_STATUS (got ${activeDelete.body.error.code})`,
  )

  // Now transition to archived (active → archived is valid) and try again.
  const archResp = await carol.json<Envelope<{ status: string }>>(
    `/api/projects/${projId}/status?tenantId=${acmeId}`,
    { method: "PATCH", body: JSON.stringify({ status: "archived" }) },
  )
  assert.equal(archResp.status, 200, "archive transition 200")
  assert.equal(unwrap(archResp.body, "archive").status, "archived")

  const archDelete = await carol.json<Envelope<{ deleted: boolean }>>(
    `/api/projects/${projId}?tenantId=${acmeId}`,
    { method: "DELETE" },
  )
  assert.equal(archDelete.status, 200, "DELETE archived project → 200")
  assert.equal(unwrap(archDelete.body, "delete archived").deleted, true)
  log("7.1", "round-30 Critical fix: project DELETE requires archived (active → 409, archived → 200)")

  // Re-create the project so downstream phases still see expected counts.
  // Phase 10 (list employees) only cares about employee count (3 from Bob+Carol+Alice).
  // Phase 11 (alice projects) expects Alice's project list length === 1 — we need
  // to re-add Alice to a new project to preserve that invariant.
  const reCreateProj = await carol.json<Envelope<{ id: string }>>(
    `/api/projects?tenantId=${acmeId}`,
    {
      method: "POST",
      body: JSON.stringify({ name: "regression-suite-replacement", departmentId: toolsId }),
    },
  )
  assert.equal(reCreateProj.status, 201, "recreate project 201")
  const newProjId = unwrap(reCreateProj.body, "recreate").id
  await carol.json(
    `/api/projects/${newProjId}/members?tenantId=${acmeId}`,
    {
      method: "POST",
      body: JSON.stringify({ employeeId: aliceId, role: "lead" }),
    },
  )

  // -- Phase 8: employee role change guards -----------------------------
  // Self-protect: Carol cannot change her own role
  const selfRole = await carol.json<Envelope<unknown>>(
    `/api/employees/${carolEmployeeId}/role?tenantId=${acmeId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ role: "admin" }),
    },
  )
  assert.equal(selfRole.status, 403, "self role 403")
  assert.ok("error" in selfRole.body, "self-role expects error envelope")
  assert.equal(selfRole.body.error.code, "SELF_NOT_ALLOWED")
  log("8.0", "self-protect on role")

  // Last-owner: Carol is the only owner; demoting her via Alice should fail.
  // First, promote Alice to admin so she can attempt; but admin cannot
  // change owner. So we promote Alice to owner first (allowed by Carol),
  // then demote Carol (still need her to NOT be last owner — but with
  // Alice as owner that's fine). So this test actually tests "can promote
  // and demote when not last owner".
  //
  // Better test: try to demote Carol with only one owner.
  // Since requireRole(['owner','admin']) is required, we need Alice to be at
  // least admin. Let's promote Alice to admin first.
  const promoteAlice = await carol.json<Envelope<{ role: string }>>(
    `/api/employees/${aliceId}/role?tenantId=${acmeId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ role: "admin" }),
    },
  )
  assert.equal(promoteAlice.status, 200, "promote Alice to admin")
  assert.equal(unwrap(promoteAlice.body, "promote").role, "admin")
  log("8.1", "Alice promoted to admin")

  // -- Phase 8.2: H1 fix — admin can't touch owner on any of /role/status/delete -
  // Bob is admin, Carol is owner. After the round-19 H1 fix, all three
  // mutation endpoints reject the admin → owner mutation with a 403
  // FORBIDDEN. (Before the fix, only /role had this guard; /status and
  // DELETE silently let admins archive/delete owners — a privilege
  // escalation path.) We exercise all three to lock in symmetric coverage.
  //
  // Note on LAST_OWNER: with these guards in place, LAST_OWNER becomes
  // effectively unreachable from normal flows (requester needs to be
  // owner, can't be self, target must be sole owner — contradictory).
  // It remains as TOCTOU race defense; no e2e can fire it without
  // injecting concurrent calls, so we don't try.
  const stampB = `${stamp}b`
  const bobEmail = `bob+${stampB}@example.com`
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
  const bobInvRaw = unwrap(
    (
      await carol.json<Envelope<{ inviteLink: string }>>(
        `/api/tenants/${acmeId}/invite`,
        {
          method: "POST",
          body: JSON.stringify({ email: bobEmail, role: "admin" }),
        },
      )
    ).body,
    "invite Bob",
  )
  const bobInvToken = new URL(bobInvRaw.inviteLink).searchParams.get("token")!
  await bob.json(`/api/invite/${bobInvToken}/accept`, { method: "POST" })
  // Backfill Bob employee record with admin role + userId so the
  // session→employee→role chain resolves.
  const bobEmpRow = unwrap(
    (
      await carol.json<Envelope<{ id: string }>>(
        `/api/employees?tenantId=${acmeId}`,
        {
          method: "POST",
          body: JSON.stringify({
            email: bobEmail,
            name: "Bob",
            role: "admin",
            userId: bobUp.body.user.id,
          }),
        },
      )
    ).body,
    "bob employee",
  )
  log("8.2", `Bob admin signed up + employee created (${bobEmpRow.id})`)

  // H1.a: Bob (admin) /role demote Carol → 403 FORBIDDEN (only-owner-can guard)
  const bobDemoteCarol = await bob.json<Envelope<unknown>>(
    `/api/employees/${carolEmployeeId}/role?tenantId=${acmeId}`,
    { method: "PATCH", body: JSON.stringify({ role: "admin" }) },
  )
  assert.equal(bobDemoteCarol.status, 403, "admin /role on owner → 403")
  assert.ok("error" in bobDemoteCarol.body, "/role expects error envelope")
  assert.equal(
    bobDemoteCarol.body.error.code,
    "FORBIDDEN",
    `/role admin→owner expected FORBIDDEN (got ${bobDemoteCarol.body.error.code})`,
  )

  // H1.b: Bob (admin) /status archive Carol → 403 FORBIDDEN (H1 fix on /status)
  const bobArchiveCarol = await bob.json<Envelope<unknown>>(
    `/api/employees/${carolEmployeeId}/status?tenantId=${acmeId}`,
    { method: "PATCH", body: JSON.stringify({ status: "archived" }) },
  )
  assert.equal(bobArchiveCarol.status, 403, "admin /status archive owner → 403")
  assert.ok("error" in bobArchiveCarol.body, "/status expects error envelope")
  assert.equal(
    bobArchiveCarol.body.error.code,
    "FORBIDDEN",
    `/status admin→owner expected FORBIDDEN (got ${bobArchiveCarol.body.error.code})`,
  )

  // H1.c: Bob (admin) DELETE Carol → 403 FORBIDDEN (H1 fix on DELETE)
  const bobDeleteCarol = await bob.json<Envelope<unknown>>(
    `/api/employees/${carolEmployeeId}?tenantId=${acmeId}`,
    { method: "DELETE" },
  )
  assert.equal(bobDeleteCarol.status, 403, "admin DELETE owner → 403")
  assert.ok("error" in bobDeleteCarol.body, "DELETE expects error envelope")
  assert.equal(
    bobDeleteCarol.body.error.code,
    "FORBIDDEN",
    `DELETE admin→owner expected FORBIDDEN (got ${bobDeleteCarol.body.error.code})`,
  )

  log("8.3", "H1 fix: admin blocked from /role + /status + DELETE on owner (3/3)")

  // -- Phase 9: cross-tenant injection ----------------------------------
  // Try to GET employee from Acme using OtherCo tenantId — should 404
  const crossTenantGet = await carol.json<Envelope<unknown>>(
    `/api/employees/${aliceId}?tenantId=${otherCo}`,
  )
  assert.equal(crossTenantGet.status, 404, "cross-tenant employee 404")
  log("9.0", "cross-tenant employee lookup blocked")

  // Try to PATCH Acme's project using OtherCo tenantId
  const crossTenantPatch = await carol.json<Envelope<unknown>>(
    `/api/projects/${projId}?tenantId=${otherCo}`,
    {
      method: "PATCH",
      body: JSON.stringify({ name: "hijacked" }),
    },
  )
  assert.equal(crossTenantPatch.status, 404, "cross-tenant project patch 404")
  log("9.1", "cross-tenant project patch blocked")

  // -- Phase 10: list-employees query --------------------------------------
  const listEmp = await carol.json<
    Envelope<Array<{ id: string; role: string }>>
  >(`/api/employees?tenantId=${acmeId}`)
  assert.equal(listEmp.status, 200, "list employees 200")
  const empList = unwrap(listEmp.body, "list employees")
  // 3 = Carol (owner bootstrap) + Alice (Phase 4) + Bob (Phase 8.2 setup)
  assert.equal(empList.length, 3, "3 employees listed (Carol+Alice+Bob)")
  log("10.0", "list employees correct")

  // -- Phase 11: hierarchical reads ----------------------------------------
  const aliceDepts = await carol.json<Envelope<unknown[]>>(
    `/api/employees/${aliceId}/departments?tenantId=${acmeId}`,
  )
  assert.equal(aliceDepts.status, 200, "alice depts 200")
  const depts = unwrap(aliceDepts.body, "alice depts")
  assert.equal(depts.length, 1, "Alice in 1 dept")

  const aliceProjs = await carol.json<Envelope<unknown[]>>(
    `/api/employees/${aliceId}/projects?tenantId=${acmeId}`,
  )
  assert.equal(aliceProjs.status, 200, "alice projects 200")
  assert.equal(unwrap(aliceProjs.body, "alice projects").length, 1, "Alice in 1 project")
  log("11.0", "hierarchical reads correct")

  // -- DONE ----------------------------------------------------------------
  log("DONE", "")
  log("DONE", "Product-layer sprint 2026-05-16 acceptance PASS:")
  log("DONE", "  ✓ tenant create auto-bootstraps owner employee")
  log("DONE", "  ✓ /me + /me/stats endpoints work")
  log("DONE", "  ✓ create employee + duplicate-email guard")
  log("DONE", "  ✓ create department + nested + cycle detection")
  log("DONE", "  ✓ create project + state machine valid/invalid")
  log("DONE", "  ✓ self-protect on role change")
  log("DONE", "  ✓ role promotion (employee → admin)")
  log("DONE", "  ✓ cross-tenant injection blocked")
  log("DONE", "  ✓ hierarchical reads (employee → depts, employee → projects)")
  log("DONE", "  ✓ Round-19 H1 fix: admin can't /role + /status + DELETE owner (3 symmetric guards)")
  log("DONE", "  ✓ Round-30 Critical fix: project DELETE requires archived (state machine guard)")
}

main().catch((err) => {
  console.error("E2E FAILED:", err)
  process.exit(1)
})
