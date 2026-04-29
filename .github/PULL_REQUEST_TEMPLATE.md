## What does this PR do?

<!-- One or two sentences. What problem does it solve? -->

## Why this approach?

<!-- What alternatives did you consider? Why is this the right tradeoff? -->

## How did you test this?

<!--
Be specific. "Ran the dev server" doesn't count.
"Dispatched a 6-subtask plan and verified all 6 children landed in the right
inboxes via DB inspection" does.
-->

## Rule compliance checklist

- [ ] `pnpm typecheck` passes on all 5 packages
- [ ] No new server-side `ToolLoopAgent` usage (R7)
- [ ] HITL state mutations go through `core/hitl/engine.ts` (R9)
- [ ] A2A signing uses `core/a2a/signing.canonicalize` (R10)
- [ ] Every new SQL query includes `eq(orgId, session.orgId)` (multi-tenant)
- [ ] No `// TODO` placeholders or fallback shims for in-scope features
- [ ] No silent fallback when external dependencies fail (AI Gateway, pgvector, etc)
- [ ] Audit trail covers any new state-changing operation
- [ ] If you exempted any rule, it's justified in the PR description

## Linked issues

<!-- Closes #..., refs #... -->

## Screenshots (UI changes only)

<!-- Before / after, or just after for new pages -->
