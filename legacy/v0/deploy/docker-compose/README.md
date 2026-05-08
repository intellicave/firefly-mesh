# firefly-mesh — Self-host with Docker Compose (5-minute setup)

Bring your own agent. We bring the org.

## Prerequisites

- Docker Desktop or Docker Engine ≥ 24
- Docker Compose V2 (`docker compose`, not `docker-compose`)

## Setup (5 minutes)

```bash
# 1. Clone the repo
git clone https://github.com/<your-org>/firefly-mesh.git
cd firefly-mesh/deploy/docker-compose

# 2. Configure env
cp .env.example .env

# Generate Better Auth secret
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# → paste the output as BETTER_AUTH_SECRET in .env

# Get Vercel AI Gateway API key
# → https://vercel.com/dashboard/ai/gateway
# → paste it as AI_GATEWAY_API_KEY in .env

# 3. Start
docker compose up -d

# 4. Wait for health (typically 30-60 seconds)
docker compose ps
# both services should be (healthy)

# 5. Open browser
open http://localhost:3000
# (first user to register becomes the org owner)
```

## What's running

| Service | Port | Image |
|---|---|---|
| `postgres` | 5432 | pgvector/pgvector:pg17 (with vector + uuid-ossp extensions) |
| `firefly-mesh` | 3000 | locally built from `../../Dockerfile` |

## Verify

```bash
curl http://localhost:3000/api/health
# {"status":"ok","service":"firefly-mesh","timestamp":"..."}
```

## Onboarding (after first start)

1. Open http://localhost:3000 → first user signs up → becomes org owner
2. Run the onboarding wizard (4 steps):
   - Create organization
   - Import employees (CSV / paste / skip)
   - Generate one-time access tokens
   - Done — distribute tokens to employees

3. Each employee installs firefly skill in their own agent:
   ```bash
   # OpenClaw / Hermes Agent / Claude Code
   <agent> skill install firefly
   firefly init --server=http://<host>:3000 --token=<one-time-token>

   # Cursor / Claude Desktop / any MCP-ready agent
   # Add MCP server URL: http://<host>:3001 (with token)
   ```

## Updating

```bash
git pull
docker compose build --pull
docker compose up -d
```

## Backup

```bash
# Postgres data lives in the named volume `firefly-mesh_pgdata`
docker run --rm -v firefly-mesh_pgdata:/source -v $(pwd):/backup \
  alpine tar czf /backup/pgdata-$(date +%F).tar.gz -C /source .
```

## Tear down

```bash
docker compose down            # stops, keeps data
docker compose down -v         # stops + deletes data (DESTRUCTIVE)
```

## Troubleshooting

- **Build slow on first run** — the multi-stage Dockerfile downloads all
  pnpm deps + builds Next.js. Subsequent rebuilds use BuildKit layer cache.
- **`BETTER_AUTH_SECRET` required** — see step 2 above; the secret must be
  ≥ 32 bytes of random base64.
- **Postgres won't start** — check `docker compose logs postgres`. Port 5432
  may be already in use; change `POSTGRES_PORT` in `.env`.
- **Agent can't connect** — check host firewall + DNS; agents need to reach
  `BETTER_AUTH_URL` from their machine. For dev on a single machine,
  `http://localhost:3000` works; for a LAN deploy, set it to your LAN IP.

## What's next

V1 ships only the docker-compose form factor. V2 will add:
- Helm chart (Kubernetes / on-prem)
- Single-cloud one-click templates (Vercel SaaS / AWS / Azure)

See [`firefly-mesh/docs/plans/2026-04-28-firefly-mesh-meta.md`](../../docs/plans/2026-04-28-firefly-mesh-meta.md) for the full project roadmap.
