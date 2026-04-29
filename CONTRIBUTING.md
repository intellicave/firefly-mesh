# Contributing to firefly-mesh

Thanks for your interest in contributing. This project is **pre-1.0** and the surface area is still moving — that means bigger leverage per change and tighter feedback loops than mature projects.

Before reading anything else, please read the **[engineering rules](docs/plans/2026-04-28-firefly-mesh-rules.md)**. They are not stylistic; they define what makes this project what it is, and a PR that violates them is much harder to land than one that respects them.

## Table of contents

- [Quick orientation](#quick-orientation)
- [Repo layout](#repo-layout)
- [Local setup](#local-setup)
- [Hard rules (PR blockers)](#hard-rules-pr-blockers)
- [What to work on](#what-to-work-on)
- [Pull request workflow](#pull-request-workflow)
- [Commit style](#commit-style)
- [Testing](#testing)
- [Reporting bugs](#reporting-bugs)
- [Reporting security issues](#reporting-security-issues)

## Quick orientation

firefly-mesh is the *organizational substrate* for any agent runtime — it doesn't replace OpenClaw / Hermes / Claude Code, it gives them a shared org to operate in. This means:

- The server is **toolless** by design (R7). All tool-loops happen on the client. Don't add server-side ToolLoopAgent.
- **Multi-tenant isolation** is a SQL-layer concern. Every query starts with `eq(orgId, session.orgId)`. There is no row-level-security shortcut.
- **HITL state** has exactly one writer (`core/hitl/engine.ts`). Don't add a second.
- **Audit log** is append-only at the database layer (RULE in `19_constraints.sql`). Don't try to amend rows.

If you find yourself writing code that wants to violate one of these, please open an issue first — the design is deliberate, not arbitrary.

## Repo layout

```
firefly-mesh/
├── packages/
│   ├── core/      ← server-only business logic (no HTTP, no UI)
│   ├── web/       ← Next.js 16 deployable
│   ├── sdk/       ← typed HTTP client (publishable)
│   ├── skill/     ← agentskills.io v1 package (publishable)
│   └── mcp/       ← MCP stdio server (publishable)
├── deploy/
│   └── docker-compose/    ← self-host recipe
├── docs/
│   └── plans/             ← design / API / UI / plan / rules
└── README.md
```

Read the [`docs/plans/2026-04-28-firefly-mesh-index.md`](docs/plans/2026-04-28-firefly-mesh-index.md) — it's a map of where every piece of behavior lives.

## Local setup

You need **Node ≥ 24** and **pnpm ≥ 10**.

```bash
git clone https://github.com/cyberautonomy/firefly-mesh.git
cd firefly-mesh
pnpm install
```

Bring up Postgres + pgvector via docker-compose:

```bash
cd deploy/docker-compose
cp .env.example .env
# Fill in BETTER_AUTH_SECRET, AI_GATEWAY_API_KEY, POSTGRES_PASSWORD
docker compose up -d postgres
cd ../..
```

Run migrations:

```bash
pnpm --filter @firefly-mesh/core migrate
```

Start the dev server:

```bash
pnpm dev
```

Visit http://localhost:3000 → sign up → onboarding wizard.

## Hard rules (PR blockers)

These are mechanical checks that block merge regardless of how nice the rest of the PR is. Treat them as boundaries, not opinions.

| Rule | What it means |
|---|---|
| **R7 — No server `ToolLoopAgent`** | `packages/core` and `packages/web` do *not* import or implement tool-loop runtimes. Server-side LLM is `generateText` / `generateObject` / `embedMany` only. |
| **R9 — Single HITL writer** | Only `core/src/hitl/engine.ts` mutates `senderApprovalStatus` / `receiverActionStatus` columns. New approval flows extend the engine, they don't bypass it. |
| **R10 — Canonical signing** | A2A messages must sign / verify against the canonical body produced by `core/a2a/signing.canonicalize`. |
| **Multi-tenant** | Every `select` / `update` / `delete` against an org-scoped table must include `eq(orgId, session.orgId)`. |
| **Audit append-only** | Don't UPDATE or DELETE `audit_log` rows in code — the DB blocks it via RULE, but the code shouldn't try in the first place. |
| **`pnpm typecheck` clean** | All 5 packages must typecheck. |
| **No `// TODO` placeholders** | If a feature is in scope, implement it. If it isn't, don't merge a stub. |
| **No fallback shims** | If an external dependency is required by design (e.g. AI Gateway, pgvector), don't paper over its absence with mocks. Fail loudly. |

## What to work on

**Good first contributions** (tagged `good first issue`):

- Per-package smoke tests against the W1 demo seed data
- Improving the i18n surface (currently English only; M10 will widen scope)
- Adding more file types to the KB parser (currently pdf / docx / md / txt / html)
- Polish on the dashboard (drawer transitions, empty states)

**Bigger leverage**:

- M10 hardening (integration tests, runtime smoke matrix)
- V0.2 project-scope tier in the KB and skill registry
- Helm chart (V1.0 deployment topology)
- New A2A message types (proposed protocol extensions go through an issue first)

**Don't open a PR for** (without a prior issue):

- New top-level dependencies
- Large refactors of the middleware composition
- Schema migrations (these need to be planned around the audit RULE)
- Anything that touches `packages/core/src/hitl/engine.ts`

## Pull request workflow

1. **Open an issue first** for anything beyond a small fix. We use issues to align on approach before you spend time.
2. **Branch from `main`**. Branch names: `feat/...`, `fix/...`, `docs/...`, `chore/...`.
3. **One concern per PR.** Don't bundle a refactor with a bug fix.
4. **Run the full check before pushing**:

   ```bash
   pnpm typecheck
   pnpm --filter @firefly-mesh/core migrate   # against a clean Postgres
   ```

5. **PR description** should answer:
   - What problem does this solve?
   - Why this approach over alternatives?
   - What did you test? (Be specific. "I ran the dev server" doesn't count; "I dispatched a 6-subtask plan and verified all 6 children landed in the right inboxes via DB inspection" does.)
   - Any rule exemptions you're requesting, with justification.

6. **Reviews**: at least one maintainer review before merge. Reviewers will quote rules by number when they apply.

## Commit style

We loosely follow [Conventional Commits](https://www.conventionalcommits.org/) but don't enforce it mechanically. Prefixes we use:

- `feat:` — new user-facing capability
- `fix:` — bug fix
- `docs:` — documentation only
- `chore:` — tooling, deps, CI
- `refactor:` — internal restructuring with no behavior change
- `test:` — adding or fixing tests

For milestone work, scope with the milestone tag: `feat(M5): task dispatcher — LLM decompose + HITL-1 approve-dispatch`.

Co-author lines are encouraged when AI-assisted code is involved:

```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Testing

(M10 deliverable — currently the project has typecheck coverage but not yet a full test suite.)

Planned:

- **vitest** in each package for unit tests
- **Playwright** in `packages/web/e2e/` for end-to-end flows
- **Skill compatibility smoke tests** via GitHub Actions matrix against OpenClaw / Hermes / Claude Code

If you want to land tests early, that's welcome — open an issue with a test plan.

## Reporting bugs

Please open a GitHub issue with:

1. firefly-mesh version (commit SHA)
2. Runtime (OpenClaw 2026.4.15 / Hermes 0.2 / Claude Code 2.0 / etc, or "web UI only")
3. Steps to reproduce
4. Expected behavior
5. Actual behavior + relevant logs (please redact any tokens)

For race conditions or sporadic bugs, the audit log on the affected org is usually the most useful artifact — exporting the relevant thread CSV and attaching it to the issue makes triage much faster.

## Reporting security issues

**Please do not open public GitHub issues for security vulnerabilities.**

Email security@cyberautonomy.io with:

1. A description of the vulnerability
2. Steps to reproduce
3. Affected version (commit SHA)
4. Suggested mitigation if you have one

We aim to respond within 48 hours and patch high-severity issues within 7 days. Coordinated disclosure timelines are negotiable for serious findings.

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE), the same license as the rest of the project.

---

Thanks for helping build firefly-mesh.
