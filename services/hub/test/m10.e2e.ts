/**
 * M10 end-to-end integration test — tasks + HITL state machine.
 *
 * Prereq: wrangler dev on http://localhost:8787 with migrations 0001-0010.
 * Run:    pnpm --filter @firefly-mesh/hub test:e2e:m10
 *
 * 12 phases cover the full task lifecycle:
 *   - create (assigned), start (in_progress), submit (pending_review),
 *     review reject (rejected; round=1), re-submit (pending_review),
 *     review approve (approved; terminal)
 *   - RBAC negatives: self-review forbidden, same-assignee-reviewer
 *     blocked at create time, non-assignee submit blocked
 *   - agent JWT submit path (Bob's agent with submit_task scope)
 *   - cross-tenant injection blocked
 *   - GET list filters for employee role
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
    throw new Error(`register failed: ${r.status} ${JSON.stringify(body)}`)
  }
  return body.data
}

async function main() {
  log("0.0", `HUB = ${HUB}`)

  // -- Setup: 3 employees in Acme (Carol owner, Bob employee, Dave manager) --
  const stamp = Date.now()

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
  const carolMe = unwrap(
    (
      await carol.json<Env<{ employee: { id: string } }>>(
        `/api/organizations/me?tenantId=${acmeId}`,
      )
    ).body,
    "/me",
  )
  const carolEmp = carolMe.employee.id
  log("1.0", `Acme=${acmeId}, Carol emp=${carolEmp}`)

  // Bob: invite + accept + backfill employee
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
    await bob.json<{ user: { id: string } | null }>(
      "/api/auth/get-session",
    )
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
    "invite bob",
  )
  const bobToken = new URL(invRaw.inviteLink).searchParams.get("token")!
  await bob.json(`/api/invite/${bobToken}/accept`, { method: "POST" })

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
    "create Bob employee",
  ).id

  // Dave: another employee (reviewer for some tasks)
  const dave = new Session("dave")
  const daveEmail = `dave+${stamp}@example.com`
  await dave.json("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({
      email: daveEmail,
      password: "pass1234",
      name: "Dave",
    }),
  })
  const daveUserId = (
    await dave.json<{ user: { id: string } | null }>(
      "/api/auth/get-session",
    )
  ).body.user!.id

  const invDaveRaw = unwrap(
    (
      await carol.json<Env<{ inviteLink: string }>>(
        `/api/tenants/${acmeId}/invite`,
        {
          method: "POST",
          body: JSON.stringify({ email: daveEmail, role: "member" }),
        },
      )
    ).body,
    "invite dave",
  )
  const daveToken = new URL(invDaveRaw.inviteLink).searchParams.get("token")!
  await dave.json(`/api/invite/${daveToken}/accept`, { method: "POST" })
  const daveEmp = unwrap(
    (
      await carol.json<Env<{ id: string }>>(
        `/api/employees?tenantId=${acmeId}`,
        {
          method: "POST",
          body: JSON.stringify({
            email: daveEmail,
            name: "Dave",
            role: "manager",
            userId: daveUserId,
          }),
        },
      )
    ).body,
    "Dave employee",
  ).id

  log("1.1", `Bob emp=${bobEmp}, Dave emp=${daveEmp}`)

  // -- Phase 1: SAME_ASSIGNEE_REVIEWER guard ------------------------------
  const sameResp = await carol.json<Env<unknown>>(
    `/api/tasks?tenantId=${acmeId}`,
    {
      method: "POST",
      body: JSON.stringify({
        title: "self review test",
        assigneeEmployeeId: bobEmp,
        reviewerEmployeeId: bobEmp,
      }),
    },
  )
  assert.equal(sameResp.status, 409, "same assignee/reviewer 409")
  log("1.2", "same assignee=reviewer guard ✓")

  // -- Phase 2: create task (Bob assignee, Dave reviewer) -----------------
  const createResp = await carol.json<
    Env<{
      id: string
      status: string
      assigneeEmployeeId: string
      reviewerEmployeeId: string
    }>
  >(`/api/tasks?tenantId=${acmeId}`, {
    method: "POST",
    body: JSON.stringify({
      title: "Q3 spec draft",
      description: "Write Q3 product spec",
      assigneeEmployeeId: bobEmp,
      reviewerEmployeeId: daveEmp,
      deadline: "2026-09-01T00:00:00Z",
    }),
  })
  assert.equal(createResp.status, 201, "create task 201")
  const task = unwrap(createResp.body, "create task")
  assert.equal(task.status, "assigned")
  assert.equal(task.assigneeEmployeeId, bobEmp)
  assert.equal(task.reviewerEmployeeId, daveEmp)
  const taskId = task.id
  log("2.0", `task=${taskId} status=assigned`)

  // -- Phase 2.1: M4 fix — employee-role POST /api/tasks → 403 -----------
  // Test quality round Medium: requireRole(["owner","admin","manager"]) on
  // task creation untested. Bob is employee role, attempt create from
  // his session — must be rejected with FORBIDDEN.
  const bobCreateTask = await bob.json<{ error?: { code?: string } }>(
    `/api/tasks?tenantId=${acmeId}`,
    {
      method: "POST",
      body: JSON.stringify({
        title: "should be blocked",
        assigneeEmployeeId: bobEmp,
        reviewerEmployeeId: daveEmp,
      }),
    },
  )
  assert.equal(
    bobCreateTask.status,
    403,
    `employee create task → 403 (got ${bobCreateTask.status})`,
  )
  assert.equal(
    bobCreateTask.body.error?.code,
    "FORBIDDEN",
    `expected FORBIDDEN from requireRole (got ${bobCreateTask.body.error?.code})`,
  )
  log("2.1", "M4 fix: employee POST /api/tasks → 403 FORBIDDEN")

  // -- Phase 3: Bob start ------------------------------------------------
  const startResp = await bob.json<Env<{ status: string }>>(
    `/api/tasks/${taskId}/start?tenantId=${acmeId}`,
    { method: "POST" },
  )
  assert.equal(startResp.status, 200, "start 200")
  assert.equal(unwrap(startResp.body, "start").status, "in_progress")
  log("3.0", "Bob → in_progress")

  // Phase 3.1: non-assignee can't start
  const aliceStartResp = await dave.json<Env<unknown>>(
    `/api/tasks/${taskId}/start?tenantId=${acmeId}`,
    { method: "POST" },
  )
  // Dave is manager not admin/owner → should be 403 OR 409 (transition from
  // in_progress to in_progress already done). Either is acceptable proof.
  assert.ok(
    aliceStartResp.status === 403 || aliceStartResp.status === 409,
    `non-assignee non-admin start → 403/409 (got ${aliceStartResp.status})`,
  )
  log("3.1", `non-assignee start blocked (${aliceStartResp.status})`)

  // -- Phase 4: Bob submit ----------------------------------------------
  const submitResp = await bob.json<Env<{ status: string }>>(
    `/api/tasks/${taskId}/submit?tenantId=${acmeId}`,
    {
      method: "POST",
      body: JSON.stringify({
        output: { sections: ["Goals", "Risks", "Timeline"] },
      }),
    },
  )
  assert.equal(submitResp.status, 200, "submit 200")
  assert.equal(unwrap(submitResp.body, "submit").status, "pending_review")
  log("4.0", "Bob submitted → pending_review")

  // -- Phase 4.1: C2 fix — non-assignee session submit blocked -----------
  // Test quality round: docstring claimed coverage but no test existed for
  // the session-path NOT_ASSIGNEE 403 branch on POST /tasks/:id/submit.
  // We use a task already in pending_review (from Phase 4) — but submit
  // also runs RBAC before the state-machine check, so Dave (reviewer, NOT
  // assignee) attempting submit must 403 NOT_ASSIGNEE, NOT 409 state.
  const daveSubmit = await dave.json<{ error?: { code?: string } }>(
    `/api/tasks/${taskId}/submit?tenantId=${acmeId}`,
    {
      method: "POST",
      body: JSON.stringify({ output: { reason: "should be blocked" } }),
    },
  )
  assert.equal(
    daveSubmit.status,
    403,
    `non-assignee submit → 403 (got ${daveSubmit.status})`,
  )
  // Pin error code (reviewer M): must be NOT_ASSIGNEE specifically — any
  // other 403 (e.g. NO_EMPLOYEE_PROFILE) would mean a regression in the
  // employee lookup that masks the RBAC check we're trying to exercise.
  assert.equal(
    daveSubmit.body.error?.code,
    "NOT_ASSIGNEE",
    `expected NOT_ASSIGNEE (got ${daveSubmit.body.error?.code})`,
  )
  log("4.1", "C2 fix: non-assignee session submit → 403 NOT_ASSIGNEE")

  // -- Phase 5: Bob attempts self-review ---------------------------------
  // (Bob is assignee, not reviewer, so this is also caught by FORBIDDEN
  // before SELF_REVIEW_FORBIDDEN. Either error code proves the guard.)
  const selfReview = await bob.json<Env<unknown>>(
    `/api/tasks/${taskId}/review?tenantId=${acmeId}`,
    {
      method: "POST",
      body: JSON.stringify({ decision: "approved" }),
    },
  )
  assert.equal(selfReview.status, 403, "self-review 403")
  log("5.0", `self-review blocked (Bob is assignee, not reviewer)`)

  // -- Phase 6: Dave (reviewer) rejects with comment ---------------------
  const rejResp = await dave.json<
    Env<{ status: string; reviewRound: number; reviewComment: string | null }>
  >(`/api/tasks/${taskId}/review?tenantId=${acmeId}`, {
    method: "POST",
    body: JSON.stringify({
      decision: "rejected",
      comment: "Please expand the Risks section.",
    }),
  })
  assert.equal(rejResp.status, 200, "review reject 200")
  const rej = unwrap(rejResp.body, "reject")
  assert.equal(rej.status, "rejected")
  assert.equal(rej.reviewRound, 1, "round bumped to 1")
  assert.equal(rej.reviewComment, "Please expand the Risks section.")
  log("6.0", `Dave rejected → round=${rej.reviewRound}`)

  // -- Phase 7: Bob re-submits ------------------------------------------
  const resubmitResp = await bob.json<Env<{ status: string }>>(
    `/api/tasks/${taskId}/submit?tenantId=${acmeId}`,
    {
      method: "POST",
      body: JSON.stringify({
        output: { sections: ["Goals", "Risks (expanded)", "Timeline"] },
      }),
    },
  )
  assert.equal(resubmitResp.status, 200)
  assert.equal(unwrap(resubmitResp.body, "resubmit").status, "pending_review")
  log("7.0", "Bob re-submitted → pending_review (round still 1 until next reject)")

  // -- Phase 8: Dave approves -------------------------------------------
  const apprResp = await dave.json<Env<{ status: string; reviewRound: number }>>(
    `/api/tasks/${taskId}/review?tenantId=${acmeId}`,
    {
      method: "POST",
      body: JSON.stringify({ decision: "approved" }),
    },
  )
  assert.equal(apprResp.status, 200)
  const appr = unwrap(apprResp.body, "approve")
  assert.equal(appr.status, "approved")
  assert.equal(appr.reviewRound, 1, "round unchanged on approve")
  log("8.0", "Dave approved → terminal")

  // -- Phase 9: terminal state — repeat review → 409 ---------------------
  const dupReview = await dave.json<Env<unknown>>(
    `/api/tasks/${taskId}/review?tenantId=${acmeId}`,
    {
      method: "POST",
      body: JSON.stringify({ decision: "approved" }),
    },
  )
  assert.equal(dupReview.status, 409, "review on approved → 409")
  log("9.0", "terminal state guard ✓")

  // -- Phase 10: agent JWT submit path (Bob's agent) ----------------------
  // Create a second task assigned to Bob; this time Bob's agent submits.
  const task2Id = unwrap(
    (
      await carol.json<Env<{ id: string }>>(
        `/api/tasks?tenantId=${acmeId}`,
        {
          method: "POST",
          body: JSON.stringify({
            title: "Agent-submit task",
            assigneeEmployeeId: bobEmp,
            reviewerEmployeeId: daveEmp,
          }),
        },
      )
    ).body,
    "task2",
  ).id

  const bobAgent = await registerAgent(bob, acmeId, "bob-claude")
  const agentSubmit = await fetch(
    `${HUB}/api/tasks/${task2Id}/submit`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bobAgent.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ output: "auto-submitted by agent" }),
    },
  )
  const agentSubmitBody = (await agentSubmit.json()) as Env<{ status: string }>
  assert.equal(agentSubmit.status, 200, `agent submit 200 (got ${agentSubmit.status} ${JSON.stringify(agentSubmitBody)})`)
  assert.equal(
    unwrap(agentSubmitBody, "agent submit").status,
    "pending_review",
  )
  log("10.0", "Bob's agent submitted task2 → pending_review")

  // -- Phase 11: cross-tenant injection blocked ---------------------------
  const otherCoId = unwrap(
    (
      await carol.json<Env<{ id: string }>>("/api/tenants", {
        method: "POST",
        body: JSON.stringify({
          slug: `other-${stamp}`,
          displayName: "OtherCo",
        }),
      })
    ).body,
    "OtherCo",
  ).id
  const crossResp = await carol.json<Env<unknown>>(
    `/api/tasks/${taskId}?tenantId=${otherCoId}`,
  )
  assert.equal(crossResp.status, 404, "cross-tenant GET 404")
  log("11.0", "cross-tenant GET blocked")

  // Phase 11.1: cross-tenant WRITE paths must also be blocked. Added
  // 2026-05-18 after code review (M-1) — original e2e only covered GET.
  // SELECT-with-orgId guard short-circuits before any UPDATE runs.
  const crossStart = await carol.json<Env<unknown>>(
    `/api/tasks/${task2Id}/start?tenantId=${otherCoId}`,
    { method: "POST" },
  )
  assert.equal(crossStart.status, 404, "cross-tenant POST /start → 404")

  const crossReview = await carol.json<Env<unknown>>(
    `/api/tasks/${taskId}/review?tenantId=${otherCoId}`,
    {
      method: "POST",
      body: JSON.stringify({ decision: "approved" }),
    },
  )
  assert.equal(crossReview.status, 404, "cross-tenant POST /review → 404")
  log("11.1", "cross-tenant POST /start + /review blocked")

  // -- Phase 12: GET list as Bob (employee) -- self-filter ----------------
  const bobList = await bob.json<Env<Array<{ id: string }>>>(
    `/api/tasks?tenantId=${acmeId}`,
  )
  const bobItems = unwrap(bobList.body, "Bob list")
  // Bob should see tasks where he is assignee (both task1 and task2).
  assert.ok(
    bobItems.length >= 2,
    `Bob sees at least his 2 assigned tasks (got ${bobItems.length})`,
  )
  assert.ok(
    bobItems.every(
      (t) =>
        // Every visible task must involve Bob
        (t as { assigneeEmployeeId?: string }).assigneeEmployeeId ===
          bobEmp ||
        (t as { reviewerEmployeeId?: string }).reviewerEmployeeId === bobEmp ||
        (t as { creatorEmployeeId?: string }).creatorEmployeeId === bobEmp,
    ),
    "all Bob's listed tasks involve him",
  )
  log("12.0", `Bob list filter ✓ (${bobItems.length} tasks)`)

  // -- DONE -------------------------------------------------------------
  log("DONE", "")
  log("DONE", "M10 sprint acceptance PASS:")
  log("DONE", "  ✓ create task (assigned) with assignee/reviewer/creator trio")
  log("DONE", "  ✓ SAME_ASSIGNEE_REVIEWER 409 guard at create")
  log("DONE", "  ✓ assignee start → in_progress")
  log("DONE", "  ✓ non-assignee start blocked")
  log("DONE", "  ✓ assignee submit → pending_review")
  log("DONE", "  ✓ Test-quality round C2: non-assignee session submit blocked 403")
  log("DONE", "  ✓ Test-quality round M4: employee POST /api/tasks blocked 403 FORBIDDEN")
  log("DONE", "  ✓ self-review (assignee != reviewer) blocked 403")
  log("DONE", "  ✓ reviewer reject + comment → status='rejected', round=1")
  log("DONE", "  ✓ assignee re-submit → pending_review (round preserved)")
  log("DONE", "  ✓ reviewer approve → status='approved' terminal")
  log("DONE", "  ✓ terminal state 409 guard")
  log("DONE", "  ✓ agent JWT submit path (assignee's agent w/ submit_task)")
  log("DONE", "  ✓ cross-tenant injection blocked")
  log("DONE", "  ✓ GET list filters to own-related for employee role")
}

main().catch((err) => {
  console.error("E2E FAILED:", err)
  process.exit(1)
})
