# `@firefly-mesh/core`

> Server-side business logic for [firefly-mesh](https://github.com/cyberautonomy/firefly-mesh). No HTTP, no UI — pure TypeScript modules consumed by `@firefly-mesh/web`.

This package owns:

- **Database schema** — 21 tables defined in Drizzle ORM (`src/db/schema/`).
- **A2A broker** — Google A2A v1.2 message persistence + ed25519 signing + RFC-8785 canonicalization (`src/a2a/`).
- **HITL engine** — the *only* writer of bidirectional approval state columns (`src/hitl/engine.ts`).
- **Task dispatcher** — LLM-based decomposition + dept/role-aware routing (`src/task/dispatcher.ts`).
- **Knowledge pipeline** — parse → chunk → embed → search (`src/knowledge/`).
- **Skill loader** — Personal > Department > Company precedence merge (`src/skill/loader.ts`).
- **Auth primitives** — Better Auth handler + agent JWT (HS256) (`src/auth/`).
- **Audit log** — write helpers + RULE-protected append-only DB layer (`src/audit/log.ts`).
- **Event bus** — in-memory pub/sub for SSE delivery (`src/events/bus.ts`).
- **Boundary catalog** — 10-scope authorization model (`src/boundary/catalog.ts`).

## Why a separate package?

`packages/web` is the deployable. `packages/core` is the *library*. Splitting them makes three things possible:

1. **Skill / MCP packages can import schema types** (`@firefly-mesh/core/db/schema`) without pulling in Next.js.
2. **Tests run against business logic in isolation** — no HTTP fixture overhead.
3. **The R7 invariant — no `ToolLoopAgent` server-side — is enforced by package boundaries.** This package only depends on `ai` for `generateText` / `generateObject` / `embedMany`. There is nowhere here for a tool loop to live.

## Public exports

```ts
// Database
import { db } from "@firefly-mesh/core/db";
import { tasks, employees, /* ... */ } from "@firefly-mesh/core/db/schema";

// Auth
import { auth } from "@firefly-mesh/core/auth/better-auth";
import { signAgentJWT, verifyAgentJWT } from "@firefly-mesh/core/auth/jwt";

// A2A
import { sendMessage, brokerErrorToHttp } from "@firefly-mesh/core/a2a/broker";
import { canonicalize, signPayload, verifySignature } from "@firefly-mesh/core/a2a/signing";

// HITL
import { computeHitlFlags, /* ... */ } from "@firefly-mesh/core/hitl/engine";

// Tasks
import { decomposeTask, routeSubTasks } from "@firefly-mesh/core/task/dispatcher";

// Knowledge
import { indexDocument } from "@firefly-mesh/core/knowledge/upload";
import { searchKnowledge } from "@firefly-mesh/core/knowledge/search";

// Skills
import { loadSkillsForEmployee } from "@firefly-mesh/core/skill/loader";

// Audit + events
import { audit, logAction } from "@firefly-mesh/core/audit/log";
import { bus } from "@firefly-mesh/core/events/bus";

// Boundary
import { enforceScope } from "@firefly-mesh/core/boundary/catalog";

// LLM helpers (toolless)
import { generateTextHelper, generateObjectHelper, embedManyHelper } from "@firefly-mesh/core/llm/helper";
```

## Scripts

```bash
pnpm typecheck     # tsc --noEmit
pnpm migrate       # drizzle-kit migrate + apply audit_log RULEs
pnpm smoke:llm     # smoke-test AI Gateway connectivity
```

## Hard rules (do not violate)

- **R7** — No `ToolLoopAgent` here. Server-side LLM is `generateText` / `generateObject` / `embedMany` only.
- **R9** — `src/hitl/engine.ts` is the *only* code path that mutates `senderApprovalStatus` / `receiverActionStatus` columns.
- **R10** — A2A messages must be canonicalized via `signing.canonicalize` before sign / verify. Don't roll your own JSON serializer.
- **Multi-tenant** — every `select` / `update` / `delete` must include `eq(orgId, session.orgId)`.
- **Audit log is append-only** — DB-level RULE blocks UPDATE/DELETE. Don't try to amend audit rows in code.

## License

Apache-2.0 © Cyberautonomy and contributors.
