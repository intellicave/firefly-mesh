# `@firefly-mesh/web`

> Next.js 16 App Router server + dashboard UI for [firefly-mesh](https://github.com/intellicave/firefly-mesh). This is the deployable.

If you want to run firefly-mesh, the friendly path is the docker-compose recipe in [`deploy/docker-compose/`](../../deploy/docker-compose) — it bundles this + Postgres + pgvector. This README documents what's *inside* the box.

## What's here

```
app/
├── (dashboard)/            # authenticated UI
│   ├── inbox/              # HITL approval inbox
│   ├── organization/       # org graph + employee directory
│   ├── audit/              # audit timeline + thread CSV export
│   ├── knowledge/          # 3-tier KB browser + RAG search
│   └── skills/             # skill registry + dry-run sandbox
├── onboarding/             # 4-step wizard (create-org → import → tokens → done)
├── login/                  # Better Auth sign-in
├── signup/                 # account creation
└── api/                    # 30+ HTTP routes + SSE channels

components/
├── layout/                 # AppShell (TopBar + Sidebar)
├── inbox/                  # Inbox row + drawer
├── organization/           # employee + agent panels
├── audit/                  # thread drawer
├── knowledge/              # upload dialog + document drawer
├── skills/                 # create dialog + skill drawer
├── onboarding/             # progress + import-preview + tokens-reveal
└── ui/                     # shadcn/ui primitives

lib/
├── api-client.ts           # fetch wrapper with envelope unwrap
├── auth-client.ts          # Better Auth client
└── middleware/             # 5 HOFs: withAuth / OrgGuard / RBAC / Scope / SenderSignature
```

## Routes

The full route map lives in [`docs/plans/2026-04-28-firefly-mesh-api.md`](../../docs/plans/2026-04-28-firefly-mesh-api.md). Highlights:

| Domain | Routes |
|---|---|
| `/api/auth/*` | Better Auth handlers |
| `/api/me`, `/api/onboarding/state` | Session + onboarding state |
| `/api/org`, `/api/employee/*`, `/api/department/*` | Org & directory |
| `/api/agent/*`, `/api/token/*` | Agent activation + token issuance |
| `/api/task/*` | Dispatch, approve, list, submit, review |
| `/api/a2a/*` | Send, inbox, approve, reject, accept |
| `/api/knowledge/*` | Upload, list, search, reindex, delete |
| `/api/skill/*` | CRUD, loaded merge, dry-run |
| `/api/audit/*` | Threads, log, CSV export |
| `/api/stream/[channel]` | Authenticated SSE with per-channel ACL |
| `/.well-known/agent-card.json` | Google A2A v1.2 agent card discovery |
| `/api/health` | Liveness probe |

## Authentication

Two modes, auto-detected by `lib/middleware/withAuth.ts`:

- **Cookie session** (web UI) — Better Auth handles login/signup/sessions.
- **Bearer JWT** (agent endpoints) — HS256, reuses `BETTER_AUTH_SECRET`. Issued by `/api/agent/activate` after consuming a one-time bootstrap token.

Subsequent middleware is composable:

```
withAuth → withOrgGuard → withRBAC(["owner","admin"]) → handler
withAuth → withOrgGuard → withScope("dispatch_task")  → handler
withAuth → withOrgGuard → withSenderSignature        → handler  // for /api/a2a/send
```

## Environment

Copy from [`deploy/docker-compose/.env.example`](../../deploy/docker-compose):

```bash
DATABASE_URL=postgres://firefly:...@localhost:5432/firefly_mesh
BETTER_AUTH_SECRET=...    # 32-byte base64
BETTER_AUTH_URL=http://localhost:3000
AI_GATEWAY_API_KEY=vck_...   # vercel.com/dashboard/ai/gateway
```

For self-host deployments, also set:

```bash
FIREFLY_MESH_KB_STORAGE=/var/lib/firefly-mesh/knowledge   # source bytes for /reindex
```

## Local development

```bash
pnpm install
cp ../../.env.local .env.local              # or set env vars directly
pnpm --filter @firefly-mesh/core migrate    # against your Postgres
pnpm dev                                     # Turbopack on :3000
```

Then open http://localhost:3000.

## Build

```bash
pnpm build      # next build
pnpm start      # next start (production)
```

The Dockerfile in the repo root produces a `next standalone` image suitable for containerized deployment.

## SSE channels (per-channel ACL)

| Channel | Subscriber must be |
|---|---|
| `inbox.{employeeId}` | that employee |
| `user.{userId}` | that user (cookie session only) |
| `audit.org.{orgId}` | owner / admin / auditor of that org |
| `org.graph.{orgId}` | a member of that org |
| `skill.{employeeId}` | that employee |
| `knowledge.indexing.{docId}` | any authenticated org member |

ACL is enforced in `app/api/stream/[channel]/route.ts`. EventSource clients pass auth via `?token=` (the API can't use Authorization headers).

## License

Apache-2.0 © Cyberautonomy and contributors.
