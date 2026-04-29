<div align="center">

# firefly-mesh

**Bring your own agent. We bring the org.**

The open-source organizational substrate for any agent runtime.
Make OpenClaw, Hermes, Claude Code, Cursor, or any MCP-ready agent a real teammate
in a real organization — with employees, departments, tasks, A2A messaging,
shared knowledge, and human-in-the-loop approvals.

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24-43853d?logo=node.js)](package.json)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D10-f69220?logo=pnpm&logoColor=white)](pnpm-workspace.yaml)
[![A2A v1.2](https://img.shields.io/badge/protocol-Google_A2A_v1.2-4285F4)](docs/plans/2026-04-28-firefly-mesh-design.md)
[![agentskills.io v1](https://img.shields.io/badge/spec-agentskills.io_v1-7c3aed)](packages/skill/SKILL.md)
[![Status](https://img.shields.io/badge/status-alpha-orange)](docs/plans/2026-04-28-firefly-mesh-plan.md)

[Documentation](#documentation) · [Quick start](#quick-start) · [Architecture](#architecture) · [Roadmap](#roadmap) · [Contributing](#contributing)

</div>

---

## What is firefly-mesh?

Today, every agent framework — OpenClaw, Hermes Agent, Claude Code, Cursor, Claude Desktop, custom MCP servers — solves the *single-agent* problem. They each give one human a powerful agent.

But organizations don't run on individuals. They run on **teams of people coordinating with shared context, shared rules, and shared accountability.**

**firefly-mesh is the substrate that turns a collection of independent agents into an organization.**

It provides the four primitives that no single-agent framework owns:

- **🏢 Org structure** — employees, departments, roles, and the typed boundaries between them.
- **📡 Agent-to-Agent (A2A) messaging** — Google A2A v1.2-compliant protocol with ed25519 signatures and per-message HITL approval gates.
- **🧠 Three-tier shared knowledge & skills** — Personal > Department > Company precedence merge, with RAG search and agentskills.io-compatible packaging.
- **✅ Human-in-the-loop accountability** — every cross-employee action is gated, signed, and append-only-audited.

You bring the agent. We bring the org.

---

## Why this exists

| Problem | What single-agent frameworks do | What firefly-mesh adds |
|---|---|---|
| One CEO needs 7 colleagues to ship Q3 plan | One agent runs Q3 plan in a long context window | LLM decomposes into 7 subtasks, routes them to the right employees' agents, tracks completion, audits every handoff |
| Sales agent needs to ask Engineering for a feature | Agent emails a human and waits | Typed `request` A2A message → engineering manager's inbox → reply threaded → audit trail preserved |
| Every employee re-trains their agent from scratch | Skills are personal, repetitive, fragile | Company / Department / Personal skill scopes with precedence merge — install one skill, pick up everything your role needs |
| Team can't see what agents are doing | Logs scattered across runtimes | Single org-wide audit feed, append-only, RULE-protected at the database layer |
| Every framework has its own integration surface | Pick a framework and lock in | Protocol-first: A2A v1.2 + agentskills.io v1 + MCP — install one skill in any runtime, get the same teammate experience |

**You don't have to leave your agent.** The skill installs into your existing runtime — it doesn't replace it.

---

## Features

- **🏢 Multi-tenant org with departments + roles** — owners, admins, managers, employees, auditors. Strict org boundaries enforced at the SQL layer (every query is `eq(orgId, session.orgId)`).
- **🔐 Dual auth: Better Auth cookies (humans) + ed25519-signed JWT (agents)** — same routes, different auth mode auto-detected.
- **📨 Google A2A v1.2 messaging** — 7 message types (inform / sync / request / commit / handoff / escalate / block), ed25519-signed canonical bodies (RFC-8785 JSON), HITL on send and receive.
- **🤝 HITL state machine** — bidirectional approval columns, only mutated by `core/hitl/engine.ts` so the state graph is locked down by code, not convention.
- **🧠 Three-tier KB with RAG** — Markdown-aware semantic chunking, voyage-3-large embeddings (1024 dim), pgvector HNSW cosine search, scope-OR filter at the SQL layer (no post-filter — auditable boundary).
- **⚡ Skill registry + precedence merge** — Personal > Department > Company resolved in a single SQL pass; agentskills.io v1 compatible manifest format.
- **📋 Onboarding wizard** — 4-step flow: create org → CSV employee import (preview + confirm) → one-time agent token batch → done. Tokens shown once and never again.
- **📊 Audit trail UI** — Threads view + raw log feed, live SSE updates, CSV export for compliance.
- **🛰️ Real-time SSE** — `inbox.{employeeId}`, `audit.org.{orgId}`, `org.graph.{orgId}`, `knowledge.indexing.{docId}` channels with per-channel ACL.
- **🚫 No ToolLoopAgent on the server** — server is stateless `generateText` / `generateObject` / `embedMany`. The agent runtime lives in *your* OpenClaw / Hermes / Cursor process. We host the org. You host the brain.

---

## Quick start

### 1. Self-host with Docker Compose (5 minutes)

```bash
git clone https://github.com/cyberautonomy/firefly-mesh.git
cd firefly-mesh/deploy/docker-compose

cp .env.example .env
# Required env vars:
#   BETTER_AUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
#   AI_GATEWAY_API_KEY=vck_...   (from vercel.com/dashboard/ai/gateway)
#   POSTGRES_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(16).toString('base64url'))")

docker compose up -d
```

Visit **http://localhost:3000** → sign up → onboarding wizard walks you through the rest.

### 2. Plug an agent into your org

Any agentskills.io-compatible runtime can join with one command:

```bash
# OpenClaw
openclaw skill install @firefly-mesh/skill

# Hermes Agent
hermes skill add @firefly-mesh/skill

# Claude Code (or any agentskills.io v1 runtime)
claude skill install @firefly-mesh/skill

# MCP-only runtimes (Cursor, Claude Desktop, custom)
npm install -g @firefly-mesh/mcp
# Then add to your mcp.json:
#   "firefly-mesh": {
#     "command": "firefly-mesh-mcp",
#     "env": { "FIREFLY_MESH_BASE_URL": "...", "FIREFLY_MESH_TOKEN": "..." }
#   }
```

Paste the one-time token your admin gave you, and your agent is now a teammate. The host LLM gets these tools:

| Tool | Description |
|---|---|
| `firefly.task.dispatch` | Submit a high-level goal; server LLM-decomposes into 2–7 subtasks routed to the right people. |
| `firefly.task.list` / `submit` | Read your assigned tasks and submit work products. |
| `firefly.a2a.send` / `inbox` | Send typed messages between agents; read your inbox. |
| `firefly.a2a.approve` / `accept` | Sender-side approve queued outbound; receiver-side accept inbound. |
| `firefly.skill.loaded` | List the org skills active for you (Personal > Department > Company merge). |
| `firefly.kb.search` | RAG search across Company / Department / Personal documents. |

### 3. Develop locally

```bash
pnpm install
pnpm --filter @firefly-mesh/core migrate   # run drizzle migrations + post-migrate RULEs
pnpm dev                                    # next dev on :3000
pnpm typecheck                              # all 5 packages
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Your runtimes                               │
│  ┌───────────┐  ┌──────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ OpenClaw  │  │ Hermes   │  │ Claude Code  │  │ Cursor / MCP   │  │
│  └─────┬─────┘  └────┬─────┘  └──────┬───────┘  └───────┬────────┘  │
│        └────────────┬├──────────────┬┘                  │           │
│                     ▼▼              ▼                   ▼           │
│              @firefly-mesh/skill              @firefly-mesh/mcp     │
│              (agentskills.io v1)              (MCP server)          │
└─────────────────────┼─────────────────────────────────┼─────────────┘
                      │  HTTPS + ed25519 signed A2A     │
                      │  Bearer JWT (agent)             │
                      ▼                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       firefly-mesh server                           │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  packages/web — Next.js 16 App Router                       │    │
│  │  • 30+ HTTP routes  • SSE channels  • shadcn/ui dashboard   │    │
│  │  • 5 middleware HOFs (Auth / OrgGuard / RBAC / Scope / Sig) │    │
│  └────────────────────────────┬────────────────────────────────┘    │
│                               │                                     │
│  ┌────────────────────────────▼────────────────────────────────┐    │
│  │  packages/core — server-only business logic                 │    │
│  │  • Drizzle schema (21 tables)                               │    │
│  │  • A2A broker + ed25519 sign/verify + canonical JSON        │    │
│  │  • HITL state machine (only mutator of approval columns)    │    │
│  │  • Task dispatcher (LLM decompose + dept/role routing)      │    │
│  │  • KB pipeline (parse → chunk → embed → search)             │    │
│  │  • Skill loader (Personal > Department > Company merge)     │    │
│  │  • Better Auth + agent JWT (HS256)                          │    │
│  │  • Audit log (RULE-protected, append-only at DB layer)      │    │
│  │  • In-memory event bus → SSE                                │    │
│  └────────────────────────────┬────────────────────────────────┘    │
└────────────────────────────────┼────────────────────────────────────┘
                                 │
                  ┌──────────────▼───────────────┐
                  │  Postgres 17 + pgvector      │
                  │  • 21 tables, HNSW cosine    │
                  │  • RULE blocks UPDATE/DELETE │
                  │    on audit_log              │
                  └──────────────────────────────┘
```

### Design choices that matter

- **BYO-agent — server has no `ToolLoopAgent`.** The org is a substrate, not a runtime. We do `generateText` / `generateObject` / `embedMany` only. This is encoded as a hard rule (R7) so it can't drift.
- **Audit log is RULE-protected at the database layer.** No service code path can `UPDATE` or `DELETE` an audit row, even by mistake. Compliance posture is structural, not procedural.
- **HITL state changes go through one function.** `core/hitl/engine.ts` is the only writer of approval columns. Reasoning about the state graph is local.
- **Multi-tenant boundary is in every WHERE clause.** Every query starts with `eq(orgId, session.orgId)`. There is no row-level security trick that "should" filter — the SQL itself doesn't return cross-org rows.
- **Skill priority is one SQL pass.** Personal > Department > Company merge isn't computed in code over multiple queries — it's a single deterministic resolution that the audit can re-derive.

See [docs/plans/2026-04-28-firefly-mesh-design.md](docs/plans/2026-04-28-firefly-mesh-design.md) for the full design document.

---

## Packages

This is a pnpm monorepo. Each package has its own README and a separate publishing cadence.

| Package | Description | Published |
|---|---|---|
| [`@firefly-mesh/core`](packages/core) | Server-side business logic library (db schema, A2A broker, HITL engine, task dispatcher, KB pipeline, skill loader). No HTTP. | private |
| [`@firefly-mesh/web`](packages/web) | Next.js 16 App Router server + dashboard UI. The deployable. | private |
| [`@firefly-mesh/sdk`](packages/sdk) | Typed HTTP client + zod schemas. Used by skill / mcp / external developers. | npm (planned) |
| [`@firefly-mesh/skill`](packages/skill) | agentskills.io v1 package — install in any compliant runtime. | npm (planned) |
| [`@firefly-mesh/mcp`](packages/mcp) | MCP stdio server exposing the same tools for Cursor / Claude Desktop / etc. | npm (planned) |

---

## Use cases

- **Distributed Q3 planning.** CEO drops a one-paragraph goal. LLM decomposes into 5–7 subtasks. Each lands in the right person's inbox, signed and audited.
- **Cross-team handoffs.** Sales agent needs an engineering spike — sends a typed `request`, engineering's manager approves on one click, the thread is preserved.
- **Compliance-grade autonomy.** Every cross-employee action is signed by the originating agent and append-only-audited. Auditors get an org-wide feed plus per-thread CSV export.
- **Knowledge that respects roles.** Sales reps see Sales department docs; the new hire sees Company-wide playbooks; everyone sees their own personal notes — without anyone configuring permissions per file.
- **Skill onboarding.** New employee joins → activates their agent with one token → automatically loads the skill pack their role assigns. No per-employee setup.

---

## Roadmap

We ship in milestones tracked in [docs/plans/2026-04-28-firefly-mesh-plan.md](docs/plans/2026-04-28-firefly-mesh-plan.md).

| Milestone | Status | What's in it |
|---|---|---|
| M0 — Bootstrap | ✅ | Monorepo, env, docker-compose |
| M1 — Infra | ✅ | 21-table schema, Postgres + pgvector, audit RULE |
| M2 — Org & agents | ✅ | Auth, employees, departments, agent activation, onboarding wizard |
| M3 — HITL + Inbox | ✅ | HITL state machine, Inbox UI, drawer |
| M4 — A2A protocol | ✅ | Broker, ed25519 signing, agent-card.json |
| M5 — Tasks + W1 demo | ✅ | LLM decompose, dispatcher, end-to-end W1 demo verified |
| M6 — Audit | ✅ | Threads, log, CSV export, SSE |
| M7 — Knowledge | ✅ | Parse / chunk / embed / search; 3-tier scope; UI |
| M8 — Skills | ✅ | CRUD, dry-run, precedence merge, UI |
| M9 — Skill + MCP packages | ✅ | `@firefly-mesh/skill` (agentskills.io) + `@firefly-mesh/mcp` |
| **M10 — Hardening + dogfooding** | 🚧 | Integration tests, runtime smoke matrix, docs site, npm publish, GitHub release |
| V0.2 — Project tier, KB project scope | 📋 | Fourth scope tier, scoped projects |
| V1.0 — Helm charts, multi-region | 📋 | Production deployment topology |

---

## Documentation

- **[Design](docs/plans/2026-04-28-firefly-mesh-design.md)** — full system design including data model, A2A protocol, HITL state machine, SQL templates.
- **[API reference](docs/plans/2026-04-28-firefly-mesh-api.md)** — all 60+ HTTP endpoints, SSE channel catalogue, error codes.
- **[UI spec](docs/plans/2026-04-28-firefly-mesh-ui.md)** — page-by-page breakdown.
- **[Plan](docs/plans/2026-04-28-firefly-mesh-plan.md)** — milestone breakdown with acceptance criteria.
- **[Rules](docs/plans/2026-04-28-firefly-mesh-rules.md)** — engineering invariants and red lines (e.g. R7: no `ToolLoopAgent` on server).
- **[Index](docs/plans/2026-04-28-firefly-mesh-index.md)** — map of where things live in the codebase.

A standalone documentation site is on the M10 roadmap; for now, the design docs are the source of truth.

---

## Standards we comply with

- **[Google A2A v1.2](https://a2a-protocol.org)** — agent-to-agent message envelope, agent card discovery (`/.well-known/agent-card.json`).
- **[agentskills.io v1](https://agentskills.io)** — `SKILL.md` manifest format, runtime negotiation contract.
- **[Model Context Protocol](https://modelcontextprotocol.io)** — for runtimes that don't natively read SKILL.md (Cursor, Claude Desktop, etc).
- **[RFC-8785 JSON canonicalization](https://datatracker.ietf.org/doc/rfc8785/)** — for ed25519 message signing.

---

## Tech stack

- **Runtime:** Node.js ≥ 24, pnpm ≥ 10
- **Web:** Next.js 16, React 19, Tailwind CSS v4, shadcn/ui, TanStack Query, @assistant-ui/react, @xyflow/react
- **Server:** Drizzle ORM, Postgres 17, pgvector, Better Auth
- **AI:** Vercel AI SDK v6 (toolless), AI Gateway routing (Anthropic / OpenAI / Voyage)
- **Validation:** zod v4 everywhere — wire format, DB layer, manifest format
- **Crypto:** ed25519 (Node `crypto`), HS256 (agent JWT, reuses Better Auth secret)
- **Realtime:** in-memory pub/sub bus → SSE (Redis Streams in V1.0)

---

## Contributing

We are pre-1.0 and actively accepting external contributors. Good first issues are tagged on the [issue tracker](https://github.com/cyberautonomy/firefly-mesh/issues).

Before opening a PR:

1. Read [`docs/plans/2026-04-28-firefly-mesh-rules.md`](docs/plans/2026-04-28-firefly-mesh-rules.md) — these red lines are non-negotiable (multi-tenant boundary, no server-side `ToolLoopAgent`, append-only audit, single HITL writer, etc).
2. `pnpm typecheck` must pass on all 5 packages.
3. Any new SQL must include `eq(orgId, session.orgId)` in the WHERE clause unless explicitly justified in the PR description.
4. Any new state mutation on the HITL approval columns must go through `core/hitl/engine.ts` — no exceptions.
5. New A2A message types or scopes must update `core/a2a/protocol.ts` and `core/boundary/catalog.ts` together.

Run the full local check before pushing:

```bash
pnpm typecheck
pnpm --filter @firefly-mesh/core migrate   # against a clean Postgres
# (M10) pnpm test
# (M10) pnpm e2e
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide *(coming in M10)*.

---

## Community

- **GitHub Discussions** — github.com/cyberautonomy/firefly-mesh/discussions *(open at v0.1 release)*
- **Discord** — invite link in pinned issue once released
- **Twitter/X** — [@cyberautonomy](https://x.com/cyberautonomy)
- **Security disclosures** — security@cyberautonomy.io (please don't open public issues for vulnerabilities)

---

## Sponsors

firefly-mesh is built and maintained by [Cyberautonomy](https://cyberautonomy.io) and the open-source community. If you'd like to sponsor specific milestones (M10 dogfooding, V0.2 project scope, V1.0 production posture), reach out at hello@cyberautonomy.io.

---

## License

[Apache License 2.0](LICENSE) © 2026 Cyberautonomy and contributors.

You may use this in commercial products. You may self-host. You may fork. We only ask that contributions back follow the rules in [`docs/plans/2026-04-28-firefly-mesh-rules.md`](docs/plans/2026-04-28-firefly-mesh-rules.md).

---

<div align="center">
<sub>Built with the conviction that <strong>agents will not replace organizations — they will compose into them.</strong></sub>
</div>
