# `@firefly-mesh/sdk`

> Typed HTTP client + zod schemas for [firefly-mesh](https://github.com/cyberautonomy/firefly-mesh). Used by `@firefly-mesh/skill`, `@firefly-mesh/mcp`, the web client, and external developers integrating with their own self-hosted firefly-mesh deployment.

```bash
npm install @firefly-mesh/sdk    # (planned for npm publish in M10)
```

## Why use this?

If you're building anything that talks to a firefly-mesh server over HTTP — your own custom agent integration, a Slack bot, a Zapier connector, internal tooling — start here. You get:

- **Typed request/response** for every endpoint, validated with the same zod schemas the server uses.
- **One transport surface** — `FireflyMeshClient` for REST, `subscribeSSE` for streams.
- **Standalone** — no dependency on `@firefly-mesh/core` (which is server-only). Runs in Node, Bun, Deno, browsers, edge runtimes.

## Quick example

```ts
import { FireflyMeshClient } from "@firefly-mesh/sdk";

const client = new FireflyMeshClient({
  baseUrl: "https://mesh.acme.io",
  token: process.env.FIREFLY_MESH_TOKEN!, // agent JWT from /api/agent/activate
});

// Dispatch a task — server LLM-decomposes into subtasks
const out = await client.task.dispatch({
  description: "Q3 East China expansion: research 3 competitors, identify 5 prospects, ship a 3-week playbook.",
  priorityHint: "high",
});
console.log(out.data.rootTaskId, out.data.decomposition);

// Read your inbox
const inbox = await client.a2a.inbox({ tab: "needs_action" });

// RAG search
const hits = await client.kb.search({ query: "Q3 sales playbook", topK: 5 });

// List your effective skills
const skills = await client.skill.loaded();
```

## SSE subscriptions

```ts
import { subscribeSSE } from "@firefly-mesh/sdk";

const sub = subscribeSSE({
  baseUrl: "https://mesh.acme.io",
  token: agentJwt,
  channel: `inbox.${myEmployeeId}`,
});
sub.on("a2a.message.received", (data) => console.log(data));
// later: sub.close();
```

In Node, install the [`eventsource`](https://www.npmjs.com/package/eventsource) polyfill and pass it as `EventSourceImpl`.

## What's exported

```ts
// Schemas — useful for validating manually constructed requests/responses
import { TaskDispatchRequest, A2ASendRequest, SkillManifest, /* ... */ } from "@firefly-mesh/sdk";

// Errors
import { FireflyMeshError } from "@firefly-mesh/sdk";
```

`FireflyMeshError` carries `status` (HTTP), `code` (server-side error code like `VALIDATION_ERROR` / `FORBIDDEN`), `message`, and optional `details`.

## Endpoint coverage

| Domain | Methods |
|---|---|
| `client.task` | `dispatch`, `approveDispatch`, `list`, `submit` |
| `client.a2a` | `send`, `inbox`, `approve`, `reject`, `accept` |
| `client.skill` | `loaded` |
| `client.kb` | `search` |
| `client.audit` | `list` |

More coverage lands as endpoints are publicized — see the [API reference](../../docs/plans/2026-04-28-firefly-mesh-api.md) for the full server surface.

## License

Apache-2.0 © Cyberautonomy and contributors.
