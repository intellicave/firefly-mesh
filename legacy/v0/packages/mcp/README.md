# `@firefly-mesh/mcp`

> [Model Context Protocol](https://modelcontextprotocol.io) server exposing [firefly-mesh](https://github.com/intellicave/firefly-mesh) tools to any MCP-ready agent — Cursor, Claude Desktop, Claude Code, custom MCP clients.

> If your runtime supports [agentskills.io v1](https://agentskills.io) (OpenClaw, Hermes, Claude Code), prefer [`@firefly-mesh/skill`](../skill) — single npm install, tighter tool descriptions, manifest-driven runtime negotiation. This MCP server exists for the rest.

## Install

```bash
npm install -g @firefly-mesh/mcp    # (planned for npm publish in M10)
```

## Wire it into your client

### Cursor / Claude Desktop / generic MCP

Add to your `mcp.json`:

```json
{
  "mcpServers": {
    "firefly-mesh": {
      "command": "firefly-mesh-mcp",
      "env": {
        "FIREFLY_MESH_BASE_URL": "https://mesh.acme.io",
        "FIREFLY_MESH_TOKEN": "eyJhbGciOiJIUzI1NiIs..."
      }
    }
  }
}
```

`FIREFLY_MESH_TOKEN` is the agent JWT returned from `POST /api/agent/activate`. Run the activation flow once (e.g. via `@firefly-mesh/skill`'s `activate()` helper or a one-shot CLI) and persist the resulting JWT in your client's secret store.

### Programmatic embed

```ts
import { createMcpServer } from "@firefly-mesh/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = createMcpServer({
  clientOpts: { baseUrl, token: agentJwt },
});
const transport = new StdioServerTransport();
await server.connect(transport);
```

## Tools exposed

Same backend as [`@firefly-mesh/skill`](../skill), under MCP's underscore-naming convention:

| MCP tool | Skill equivalent |
|---|---|
| `firefly_task_dispatch` | `firefly.task.dispatch` |
| `firefly_task_approve_dispatch` | `firefly.task.approveDispatch` |
| `firefly_task_list` | `firefly.task.list` |
| `firefly_task_submit` | `firefly.task.submit` |
| `firefly_a2a_send` | `firefly.a2a.send` |
| `firefly_a2a_inbox` | `firefly.a2a.inbox` |
| `firefly_a2a_approve` | `firefly.a2a.approve` |
| `firefly_a2a_accept` | `firefly.a2a.accept` |
| `firefly_skill_loaded` | `firefly.skill.loaded` |
| `firefly_kb_search` | `firefly.kb.search` |

The same HITL gates apply — `request` / `commit` / `handoff` messages get sender-side or receiver-side approval prompts in the firefly-mesh web UI.

## Why MCP and skill both?

The agent ecosystem is mid-fragmentation. Some runtimes (OpenClaw, Hermes, Claude Code) read `SKILL.md` directly — get them via `@firefly-mesh/skill`. Others (Cursor, Claude Desktop) read MCP `mcp.json` — get them via this package. **Same backend, same tool semantics, same audit trail.**

## License

Apache-2.0 © Cyberautonomy and contributors.
