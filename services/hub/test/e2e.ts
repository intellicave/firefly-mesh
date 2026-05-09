/**
 * End-to-end integration test against a running `wrangler dev` hub.
 *
 *   Prereq: wrangler dev is running on http://localhost:8787 with a fresh local D1
 *   Run:    pnpm --filter @firefly-mesh/hub test:e2e
 *
 * Walks the canonical user journey from plan.md M1 + M2:
 *   Carol signs up → creates Acme → invites Alice → Alice signs up →
 *   Alice accepts invite → Alice pairs OpenClaw skill (X3DH bundle) →
 *   Carol's PWA opens WebSocket → Alice sends an encrypted message →
 *   Carol's PWA receives the deliver frame.
 *
 * Exits non-zero on any assertion failure. Uses Node 24's native fetch +
 * WebSocket (no third-party deps).
 */

import assert from "node:assert/strict"
import { generateX3DHKeys } from "@firefly-mesh/crypto"

const HUB = process.env.HUB_URL ?? "http://localhost:8787"
const log = (step: string, detail = "") => console.log(`[${step}] ${detail}`)

function toBase64Url(bytes: Uint8Array): string {
  let s = ""
  for (const b of bytes) s += String.fromCharCode(b)
  return Buffer.from(s, "binary").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

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
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json")
    // Better Auth's CSRF protection requires an Origin matching trustedOrigins.
    // Native Node fetch doesn't set Origin by default for non-browser callers;
    // we send the hub's own origin so it matches the dev trustedOrigin entry.
    if (!headers.has("Origin")) headers.set("Origin", HUB)
    const res = await fetch(`${HUB}${path}`, { ...init, headers })
    this.capture(res)
    return res
  }

  async json<T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
    const res = await this.req(path, init)
    const text = await res.text()
    let body: unknown
    try { body = JSON.parse(text) } catch { body = text }
    return { status: res.status, body: body as T }
  }
}

async function main() {
  // -- Phase 1: identity --------------------------------------------------
  log("1.1", "health check")
  const health = await fetch(`${HUB}/`).then((r) => r.json()) as { status: string }
  assert.equal(health.status, "ok", "hub /health")

  const carol = new Session("carol")
  log("1.2", "Carol signs up")
  const { status: signupStatus, body: signupBody } = await carol.json<{ user: { id: string } }>(
    "/api/auth/sign-up/email",
    { method: "POST", body: JSON.stringify({
      email: `carol+${Date.now()}@example.com`,
      password: "pass1234",
      name: "Carol",
    }) },
  )
  assert.equal(signupStatus, 200, `sign-up: ${signupStatus}`)
  assert.ok(signupBody.user?.id, "user id returned")
  const carolUserId = signupBody.user.id

  log("1.3", "Carol creates Acme")
  const slug = `acme-${Date.now().toString(36)}`
  const { status: tStatus, body: tenant } = await carol.json<{ data: { id: string; slug: string } }>(
    "/api/tenants",
    { method: "POST", body: JSON.stringify({ slug, displayName: "Acme Inc" }) },
  )
  assert.equal(tStatus, 201, `create tenant: ${tStatus}`)
  const tenantId = tenant.data.id
  log("1.3", `tenant ${tenantId} (${tenant.data.slug})`)

  log("1.4", "Carol invites Alice (email send may fail with dummy Resend, link is still valid)")
  const aliceEmail = `alice+${Date.now()}@example.com`
  const { status: invStatus, body: inv } = await carol.json<{
    data: { id: string; inviteLink: string; emailError: string | null }
  }>(`/api/tenants/${tenantId}/invite`, {
    method: "POST",
    body: JSON.stringify({ email: aliceEmail, role: "member" }),
  })
  assert.equal(invStatus, 201, `invite: ${invStatus}`)
  assert.ok(inv.data.inviteLink.includes("token="), "invite link contains token")
  const inviteToken = new URL(inv.data.inviteLink).searchParams.get("token")!

  // -- Phase 2: Alice joins ----------------------------------------------
  const alice = new Session("alice")
  log("2.1", "Alice signs up")
  await alice.json("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email: aliceEmail, password: "pass1234", name: "Alice" }),
  })
  log("2.2", "Alice accepts invite")
  const { status: acceptStatus } = await alice.json(`/api/invite/${inviteToken}/accept`, { method: "POST" })
  assert.equal(acceptStatus, 200, `invite accept: ${acceptStatus}`)

  const { body: aliceTenants } = await alice.json<{ data: Array<{ id: string; role: string }> }>("/api/tenants")
  assert.equal(aliceTenants.data.length, 1, "Alice has one tenant")
  assert.equal(aliceTenants.data[0]!.role, "member", "Alice is member")

  // -- Phase 3: Alice pairs OpenClaw skill --------------------------------
  log("3.1", "skill calls pair-init")
  const { body: pairInit } = await alice.json<{ data: { code: string } }>(
    "/api/agents/pair-init",
    { method: "POST", body: JSON.stringify({ deviceName: "Alice-OpenClaw" }) },
  )
  const code = pairInit.data.code
  log("3.1", `code=${code}`)

  log("3.2", "Alice's PWA confirms pairing (binds code to her tenant)")
  const { status: confirmStatus } = await alice.json("/api/agents/pair-confirm", {
    method: "POST",
    body: JSON.stringify({ code, tenantId }),
  })
  assert.equal(confirmStatus, 200, `pair-confirm: ${confirmStatus}`)

  log("3.3", "skill generates X3DH bundle and registers")
  const aliceKeys = generateX3DHKeys(20)
  const aliceRegisterBody = {
    code,
    displayName: "Alice-OpenClaw",
    type: "skill",
    identityKey: toBase64Url(aliceKeys.identityKey.publicKey),
    identityKeyX: toBase64Url(aliceKeys.identityKeyX25519.publicKey),
    signedPrekey: toBase64Url(aliceKeys.signedPrekey.publicKey),
    signedPrekeySignature: toBase64Url(aliceKeys.signedPrekeySignature),
    oneTimePrekeys: aliceKeys.oneTimePrekeys.map((kp, i) => ({
      keyId: i + 1,
      publicKey: toBase64Url(kp.publicKey),
    })),
  }
  const aliceRegRes = await fetch(`${HUB}/api/agents/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(aliceRegisterBody),
  })
  assert.equal(aliceRegRes.status, 201, `register: ${aliceRegRes.status}`)
  const aliceReg = await aliceRegRes.json() as { data: { agentId: string; token: string } }
  log("3.3", `Alice agentId=${aliceReg.data.agentId}`)

  // -- Phase 4: Carol pairs OpenClaw too ----------------------------------
  log("4.1", "Carol pairs her OpenClaw")
  const { body: carolPair } = await carol.json<{ data: { code: string } }>(
    "/api/agents/pair-init",
    { method: "POST", body: JSON.stringify({ deviceName: "Carol-OpenClaw" }) },
  )
  await carol.json("/api/agents/pair-confirm", {
    method: "POST",
    body: JSON.stringify({ code: carolPair.data.code, tenantId }),
  })
  const carolKeys = generateX3DHKeys(20)
  const carolReg = await fetch(`${HUB}/api/agents/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: carolPair.data.code,
      displayName: "Carol-OpenClaw",
      type: "skill",
      identityKey: toBase64Url(carolKeys.identityKey.publicKey),
      identityKeyX: toBase64Url(carolKeys.identityKeyX25519.publicKey),
      signedPrekey: toBase64Url(carolKeys.signedPrekey.publicKey),
      signedPrekeySignature: toBase64Url(carolKeys.signedPrekeySignature),
      oneTimePrekeys: carolKeys.oneTimePrekeys.map((kp, i) => ({
        keyId: i + 1,
        publicKey: toBase64Url(kp.publicKey),
      })),
    }),
  }).then((r) => r.json()) as { data: { agentId: string; token: string } }
  log("4.1", `Carol agentId=${carolReg.data.agentId}`)

  // -- Phase 5: PWA WebSocket + Alice → Carol message --------------------
  log("5.1", "Carol's PWA opens WebSocket")
  const ws = new WebSocket(
    `${HUB.replace(/^http/, "ws")}/ws?tenantId=${encodeURIComponent(tenantId)}`,
    { headers: { Cookie: carol.cookieHeader() } } as unknown as undefined,
  )

  const wsReady = new Promise<void>((res, rej) => {
    ws.addEventListener("open", () => res())
    ws.addEventListener("error", () => rej(new Error("ws error before open")))
    setTimeout(() => rej(new Error("ws open timeout")), 5_000)
  })
  await wsReady
  log("5.1", "ws open")

  const wsDeliver = new Promise<{ messageId: string; senderAgentId: string }>((res, rej) => {
    ws.addEventListener("message", (ev) => {
      const data = JSON.parse(typeof ev.data === "string" ? ev.data : "") as {
        op: string
        envelope?: { messageId: string; senderAgentId: string }
      }
      if (data.op === "deliver" && data.envelope) res(data.envelope)
    })
    setTimeout(() => rej(new Error("ws deliver timeout")), 10_000)
  })

  log("5.2", "Alice's skill sends inform message → Carol")
  const sendRes = await fetch(`${HUB}/api/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${aliceReg.data.token}`,
    },
    body: JSON.stringify({
      recipientAgentId: carolReg.data.agentId,
      type: "inform",
      summary: "test ping from e2e",
      ciphertext: toBase64Url(new TextEncoder().encode("dummy-ciphertext")),
      nonce: toBase64Url(new Uint8Array(12)),
      ephemeralPk: toBase64Url(new Uint8Array(32)),
    }),
  })
  assert.equal(sendRes.status, 202, `POST /api/messages: ${sendRes.status}`)
  const sent = await sendRes.json() as { data: { messageId: string } }
  log("5.2", `messageId=${sent.data.messageId}`)

  log("5.3", "Carol's PWA receives deliver frame")
  const deliverEnv = await wsDeliver
  assert.equal(deliverEnv.messageId, sent.data.messageId, "delivered messageId matches sent")
  assert.equal(deliverEnv.senderAgentId, aliceReg.data.agentId, "sender = Alice's agent")
  ws.close()

  // -- Phase 6: Carol fetches messages list --------------------------------
  log("6.1", "Carol fetches /api/tenants/:id/messages")
  const { body: msgList } = await carol.json<{ data: Array<{ id: string; summary: string }> }>(
    `/api/tenants/${tenantId}/messages?limit=20`,
  )
  const found = msgList.data.find((m) => m.id === sent.data.messageId)
  assert.ok(found, `message ${sent.data.messageId} present in inbox list`)
  assert.equal(found!.summary, "test ping from e2e", "summary preserved")

  log("DONE", `✓ all 6 phases passed (Carol=${carolUserId.slice(0, 8)})`)
}

main().catch((err) => {
  console.error(`✗ ${err.message}`)
  if (err.stack) console.error(err.stack)
  process.exit(1)
})
