# DNS handover: firefly-mesh.com → Vercel

Sprint B B.3 result: web app deployed to Vercel; **firefly-mesh.com is added
to the Vercel project (verified=true) but DNS still resolves to the old
Cloudflare Worker IPs**. Until the DNS change below is applied, the apex
domain serves stale content and the auth flow cannot work cross-subdomain
with `hub.firefly-mesh.com`.

This file is the canonical record of the one-time DNS migration; once
applied, delete this file (it has no recurring value).

## Current state (2026-05-24)

- Vercel project: `prj_KQ0KtmmlRyT7O68ju7JbXxmfdNLW` (team `ohbabytriples`)
- Vercel preview: `https://firefly-mesh-8mi0c8a0m-ohbabytriples-projects.vercel.app` — verified READY, marketing landing renders, all 5 smoke routes return 200.
- Domains added to project: `firefly-mesh.com`, `www.firefly-mesh.com`
- Vercel reports `misconfigured: true` because A records still point to Cloudflare anycast (172.67.189.38, 104.21.65.72) instead of Vercel anycast.

## Required DNS changes (Cloudflare dashboard or API)

Cloudflare zone `dc2aac51143f38687db424bba97dbfe3` (firefly-mesh.com).

| Record | Current | New | Proxy |
|--------|---------|-----|-------|
| `firefly-mesh.com` (A) | 172.67.189.38, 104.21.65.72 (CF Worker) | **216.198.79.1, 64.29.17.1** (Vercel) | **DNS only (grey cloud)** |
| `www.firefly-mesh.com` (CNAME) | currently A → 104.21.65.72 / 172.67.189.38 | **CNAME `cname.vercel-dns.com`** | **DNS only (grey cloud)** |

Notes:
- **Must turn proxy OFF** — Vercel needs to see the request directly to
  serve its own SSL cert. Cloudflare orange-cloud breaks Vercel cert issuance.
- `hub.firefly-mesh.com` (CF Worker) stays unchanged.
- Vercel will auto-issue SSL cert within ~60s after DNS propagates.

## Why the agent could not apply this autonomously

- `wrangler login` OAuth token has scope `zone:read` only, not `zone:edit`.
- A Cloudflare API token with `Zone:DNS:Edit` for the firefly-mesh.com zone is required.
- No such token is committed (and shouldn't be).

## Apply via CF API (if you create a token)

Create a CF API token at https://dash.cloudflare.com/profile/api-tokens
with permission `Zone → DNS → Edit` scoped to the `firefly-mesh.com` zone.
Then:

```bash
CF_TOKEN="<your token>"
ZONE=dc2aac51143f38687db424bba97dbfe3

# List current DNS records (find IDs)
curl -s "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records?type=A&name=firefly-mesh.com" \
  -H "Authorization: Bearer $CF_TOKEN" | jq

# Delete the two CF Worker A records, then create new ones:
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records" \
  -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"A","name":"firefly-mesh.com","content":"216.198.79.1","ttl":1,"proxied":false}'

curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records" \
  -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"A","name":"firefly-mesh.com","content":"64.29.17.1","ttl":1,"proxied":false}'

# www → Vercel CNAME (delete any existing A/CNAME for www first)
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records" \
  -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"CNAME","name":"www","content":"cname.vercel-dns.com","ttl":1,"proxied":false}'
```

## Verify after DNS propagates

```bash
# Should resolve to Vercel anycast (not 172.67.x.x)
dig +short firefly-mesh.com @1.1.1.1
# Expected: 216.198.79.1, 64.29.17.1 (or similar Vercel range)

# Should serve the marketing landing
curl -s https://firefly-mesh.com/ -o /dev/null -w "%{http_code}\n"
# Expected: 200

# Should still proxy /api/* to hub
curl -s https://firefly-mesh.com/api/agents -o /dev/null -w "%{http_code}\n"
# Expected: 401 (auth required, but proxy works)
```

## Once verified, smoke the full auth flow

```bash
# Test cross-subdomain cookie binding:
# 1. Visit https://firefly-mesh.com/signup
# 2. Create account → cookie should be set with Domain=.firefly-mesh.com
# 3. Visit https://firefly-mesh.com/inbox → should load without redirecting
#    to /login (cookie carries to hub.firefly-mesh.com on /api/me)
```
