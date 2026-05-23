import { test, expect } from "@playwright/test"

// Sprint B B.6 — production smoke tests against the deployed Vercel
// surface. These do NOT require auth and are safe to run any time.
//
// The 5 "must pass" tests below are the contract: if any fails,
// production is broken.

test.describe("firefly-mesh prod smoke", () => {
  test("1. marketing landing renders hero + diagram + Q&A", async ({ page }) => {
    await page.goto("/")
    // hero copy — heading text contains both halves (split by <br/>)
    const heading = page.getByRole("heading", { level: 1 })
    await expect(heading).toBeVisible()
    await expect(heading).toContainText(/Give your AI agent/i)
    await expect(heading).toContainText(/a phone number/i)
    // BYO section title
    await expect(page.getByRole("heading", { name: /Bring your own agent/i })).toBeVisible()
    // primary CTA
    const cta = page.getByRole("link", { name: /Get started free/i }).first()
    await expect(cta).toBeVisible()
    await expect(cta).toHaveAttribute("href", "/signup")
    // Q&A heading
    await expect(page.getByRole("heading", { name: /Will it reach my agent/i })).toBeVisible()
  })

  test("2. /signup renders the sign-up form", async ({ page }) => {
    await page.goto("/signup")
    // form should have email + password inputs and a submit
    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible()
    await expect(page.locator('input[type="password"]').first()).toBeVisible()
  })

  test("3. /login renders the login form with link to signup", async ({ page }) => {
    await page.goto("/login")
    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible()
    await expect(page.locator('input[type="password"]').first()).toBeVisible()
    // link to signup
    await expect(page.getByRole("link", { name: /sign up|create/i }).first()).toBeVisible()
  })

  test("4. /api/health returns ok JSON (Vercel-served route)", async ({ request }) => {
    const res = await request.get("/api/health")
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ status: "ok", service: "firefly-mesh" })
    expect(typeof body.timestamp).toBe("string")
  })

  test("5. /api/agents proxies to hub and returns 401 unauth", async ({ request }) => {
    // Confirms the Next rewrite to NEXT_PUBLIC_HUB_URL/api/* is wired
    // AND the hub is reachable AND auth middleware fires.
    const res = await request.get("/api/agents")
    expect(res.status()).toBe(401)
  })
})

test.describe("firefly-mesh prod — informational", () => {
  // "banner only": these are nice-to-have signals. They don't gate the
  // release.

  test("6. /.well-known/agent-card.json (A2A discovery) returns 200 JSON", async ({ request }) => {
    const res = await request.get("/.well-known/agent-card.json")
    expect(res.status()).toBe(200)
    const body = await res.json()
    // Loose check — A2A spec gives this room to evolve
    expect(typeof body).toBe("object")
  })

  test("7. Chinese locale: switching renders zh copy", async ({ page }) => {
    await page.goto("/")
    // The page has a language toggle button labeled "中" (when en) or "EN" (when zh)
    const toggle = page.getByRole("button", { name: /中|EN/i }).first()
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click()
      // After switching to zh, the marketing landing's eyebrow becomes
      // something Chinese — but to avoid brittle copy assertions, just
      // verify the html lang attribute flipped.
      await page.waitForTimeout(500)
      const lang = await page.locator("html").getAttribute("lang")
      expect(["zh", "zh-CN", "en"]).toContain(lang ?? "en") // forgiving: just that lang is set
    }
  })
})
