# Firefly Mesh Edge — Deployment Runbook

End-to-end deployment of the edge stack on Cloudflare. Numbered checklist; each
step has a verifiable success signal.

## 0. Prerequisites

- Cloudflare account with Workers Paid plan (Durable Objects + D1 production
  require it; free plan is fine for early dev/preview)
- Domain pointed at Cloudflare DNS (`firefly-mesh.io` and a hub subdomain such
  as `hub-dev.firefly-mesh.io`)
- Local toolchain (verified `pnpm install` succeeds at repo root):
  - Node 24+
  - pnpm 10.30+
  - wrangler 4.90+ (already a workspace devDep — invoke via
    `pnpm --filter @firefly-mesh/hub exec wrangler …`)
- Service accounts:
  - Resend account + verified sender domain (`cyberautonomy.io` per current
    config; change `RESEND_FROM_EMAIL` in `services/hub/wrangler.toml` if you
    use a different domain)
  - Google OAuth app + GitHub OAuth app (callbacks: `https://<hub>/api/auth/callback/google` and `…/callback/github`)

## 1. First-time hub deployment

### 1.1 Login + create the production D1 database

```bash
pnpm --filter @firefly-mesh/hub exec wrangler login
pnpm --filter @firefly-mesh/hub exec wrangler d1 create firefly-mesh-hub-db
```

The `d1 create` output prints a `database_id`. Copy it.

### 1.2 Wire the database id into `wrangler.toml`

Edit `services/hub/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "firefly-mesh-hub-db"
database_id = "<paste the id from step 1.1>"
```

Commit this change — the placeholder `placeholder-replace-before-deploy`
must not stay in main.

### 1.3 Apply migrations to the production D1

```bash
pnpm --filter @firefly-mesh/hub exec wrangler d1 migrations apply firefly-mesh-hub-db --remote
```

You should see all three migrations (`0001_init.sql`, `0002_delivery.sql`,
`0003_encryption.sql`) marked ✅.

### 1.4 Set Worker secrets

Generate strong secrets first:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # for BETTER_AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # for JWT_SECRET
```

Then push them (each command opens a stdin prompt; paste the value, Enter):

```bash
cd services/hub
pnpm exec wrangler secret put BETTER_AUTH_SECRET
pnpm exec wrangler secret put JWT_SECRET
pnpm exec wrangler secret put RESEND_API_KEY
pnpm exec wrangler secret put GOOGLE_CLIENT_ID
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
pnpm exec wrangler secret put GITHUB_CLIENT_ID
pnpm exec wrangler secret put GITHUB_CLIENT_SECRET
```

Verify:

```bash
pnpm exec wrangler secret list
```

### 1.5 Deploy the Worker

```bash
pnpm --filter @firefly-mesh/hub deploy
```

Wrangler prints the deploy URL (something like
`https://firefly-mesh-hub.<account>.workers.dev`).

### 1.6 Bind a custom domain

In the Cloudflare dashboard, **Workers & Pages → firefly-mesh-hub → Settings →
Triggers → Custom Domains → Add Custom Domain** and bind
`hub-dev.firefly-mesh.io` (preview) or `hub.firefly-mesh.io` (prod). DNS
records are created automatically.

### 1.7 Smoke test the live hub

```bash
curl https://hub-dev.firefly-mesh.io/
# → {"status":"ok","version":"0.1.0"}
```

## 2. PWA deployment (Cloudflare Pages)

### 2.1 First-time setup

In the Cloudflare dashboard, **Workers & Pages → Create → Pages → Connect to Git**
and pick the `firefly-mesh` repo.

Build configuration:
- Framework preset: **Astro**
- Build command: `pnpm --filter @firefly-mesh/pwa build`
- Build output directory: `services/pwa/dist`
- Root directory: `/` (the build script handles workspace context)
- Environment variables:
  - `PUBLIC_HUB_URL` = `https://hub-dev.firefly-mesh.io` (preview env)
  - `PUBLIC_HUB_URL` = `https://hub.firefly-mesh.io` (production env)
  - `NODE_VERSION` = `24`

### 2.2 Bind the apex domain

In the Pages project → Custom Domains → add `firefly-mesh.io`.

### 2.3 Verify CORS

```bash
curl -i -X OPTIONS https://hub-dev.firefly-mesh.io/api/tenants \
  -H "Origin: https://firefly-mesh.io" \
  -H "Access-Control-Request-Method: GET"
# → 204, Access-Control-Allow-Origin: https://firefly-mesh.io
```

## 3. OAuth callback URLs

In Google Cloud Console / GitHub Developer Settings, add these callback URLs
to the OAuth apps:

- `https://hub-dev.firefly-mesh.io/api/auth/callback/google`
- `https://hub-dev.firefly-mesh.io/api/auth/callback/github`
- `https://hub.firefly-mesh.io/api/auth/callback/google` (when going to prod)
- `https://hub.firefly-mesh.io/api/auth/callback/github`

## 4. Resend domain verification

In the Resend dashboard, verify ownership of the sender domain (DNS records:
DKIM CNAMEs + SPF TXT + DMARC TXT). Until verified, invitation emails fail
silently — the `inviteLink` in the API response still works as a manual share.

## 5. Cron triggers

`wrangler.toml` already declares two cron triggers; the `wrangler deploy` from
step 1.5 registers them with Cloudflare automatically:

- `0 * * * *` — hourly drain of expired `pending_messages`
- `0 3 * * *` — daily 03:00 UTC `audit_log` truncation to last 90 days

To trigger manually for testing on a deployed worker:

```bash
curl https://hub-dev.firefly-mesh.io/cdn-cgi/handler/scheduled
```

## 6. Local development

```bash
# 1. Generate dev secrets (one time)
cd services/hub
echo "BETTER_AUTH_SECRET=$(node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\")" > .dev.vars
echo "JWT_SECRET=$(node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\")" >> .dev.vars
echo "RESEND_API_KEY=re_local_dummy_does_not_send" >> .dev.vars
echo "GOOGLE_CLIENT_ID=local-dummy-google" >> .dev.vars
echo "GOOGLE_CLIENT_SECRET=local-dummy-google-secret" >> .dev.vars
echo "GITHUB_CLIENT_ID=local-dummy-github" >> .dev.vars
echo "GITHUB_CLIENT_SECRET=local-dummy-github-secret" >> .dev.vars

# 2. Apply migrations to local D1
pnpm --filter @firefly-mesh/hub migrate:local

# 3. Run hub
pnpm --filter @firefly-mesh/hub dev
# Hub up at http://localhost:8787

# 4. (separate terminal) Run PWA
echo "PUBLIC_HUB_URL=http://localhost:8787" > services/pwa/.env
pnpm --filter @firefly-mesh/pwa dev
# PWA at http://localhost:4321

# 5. (separate terminal) Run e2e against the hub
pnpm --filter @firefly-mesh/hub test:e2e
# → "✓ all 6 phases passed"
```

## 7. Rolling back a deploy

Cloudflare keeps recent versions. From the dashboard, **Workers & Pages →
firefly-mesh-hub → Deployments**, pick a known-good earlier version and click
**Rollback**.

D1 schema rollback is harder (we don't ship `down` migrations). For a broken
schema change, either:

- write a forward-fixing migration (`0004_…`) that undoes the harm, or
- export the database (`wrangler d1 export firefly-mesh-hub-db --remote …`),
  drop and recreate, restore.

## 8. Failure modes encountered in dev (already fixed in code)

These bugs were caught by the first wrangler boot + e2e test (commit
`41ee602` and `95b8e61`); listing them here so future deploys know what
correct behavior looks like.

| Symptom | Cause | Fix |
|---|---|---|
| `POST /api/auth/sign-up/email → 404` | Hono splat is `*`, not `**` | `app.on(["GET","POST"], "/api/auth/*", …)` |
| Better Auth refused unknown route on localhost | `baseURL` hardcoded to prod URL | `createAuth(env, requestOrigin)` derives baseURL from request |
| `FAILED_TO_CREATE_USER` D1 type error | Better Auth passes `Date`; our schema used TEXT | Better Auth tables now use `integer({ mode: "timestamp" })` |
| Invite endpoint 500'd on bad Resend key | Email failure was uncaught | Wrap send in try/catch, return 201 with `{inviteLink, emailError}` |
| Sign-up 403 from Node fetch | Better Auth CSRF check needs Origin in trustedOrigins | Dev allowlists `localhost` origins; tests send explicit `Origin: <hub>` header |

## 9. Quick command reference

| Goal | Command |
|---|---|
| Apply migrations local | `pnpm --filter @firefly-mesh/hub migrate:local` |
| Apply migrations remote | `pnpm --filter @firefly-mesh/hub exec wrangler d1 migrations apply firefly-mesh-hub-db --remote` |
| Run hub local | `pnpm --filter @firefly-mesh/hub dev` |
| Run e2e | `pnpm --filter @firefly-mesh/hub test:e2e` (hub must be running) |
| Deploy hub | `pnpm --filter @firefly-mesh/hub deploy` |
| Set secret | `pnpm --filter @firefly-mesh/hub exec wrangler secret put NAME` |
| Tail logs | `pnpm --filter @firefly-mesh/hub exec wrangler tail` |
