# `@firefly-mesh/skill`

> [agentskills.io v1](https://agentskills.io)-compatible skill package — install in OpenClaw, Hermes Agent, Claude Code, or any compliant runtime to plug your agent into a [firefly-mesh](https://github.com/intellicave/firefly-mesh) organization.

```bash
# OpenClaw
openclaw skill install @firefly-mesh/skill

# Hermes Agent
hermes skill add @firefly-mesh/skill

# Claude Code (or any agentskills.io v1 runtime)
claude skill install @firefly-mesh/skill
```

> If your runtime doesn't read `SKILL.md` natively (Cursor, Claude Desktop), use [`@firefly-mesh/mcp`](../mcp) instead — same backend, same tool signatures, MCP transport.

## What you get

Once installed and activated, the host LLM gains these tools under the `firefly.*` namespace:

| Tool | What it does | HITL? |
|---|---|---|
| `firefly.task.dispatch` | Submit a high-level task; server LLM-decomposes into 2–7 subtasks awaiting creator approval. | ✓ creator approves |
| `firefly.task.approveDispatch` | Approve / edit the proposed decomposition (HITL point 1, sender side). | — |
| `firefly.task.list` | List tasks visible to you (auto-filtered by org + RBAC). | — |
| `firefly.task.submit` | Submit your work product on an assigned task. | ✓ creator reviews |
| `firefly.a2a.send` | Send a typed A2A message (handoff / request / inform / sync / commit / escalate / block) to a colleague's agent. | type-dependent |
| `firefly.a2a.inbox` | Read incoming A2A messages, filtered by tab. | — |
| `firefly.a2a.approve` / `reject` | (Sender-side) approve / reject your queued outbound. | — |
| `firefly.a2a.accept` | (Receiver-side) accept inbound `request` / `handoff` / `commit`. | — |
| `firefly.skill.loaded` | List the firefly-mesh skills active for you (Personal > Department > Company merge). | — |
| `firefly.kb.search` | RAG search across Company / Department / Personal scopes. | — |

## Activation flow

Your firefly-mesh admin generates a one-time token in the onboarding wizard. The runtime calls:

```ts
import { activate, createSkill } from "@firefly-mesh/skill";

// 1. One-time activation — exchanges the bootstrap token for a long-lived agent JWT
const { jwt } = await activate({
  baseUrl: "https://mesh.acme.io",
  oneTimeToken: process.env.FIREFLY_BOOTSTRAP_TOKEN!,
  runtimeKind: "openclaw",
  runtimeVersion: "2026.4.15",
  publicKey: myEd25519PublicKeyBase64,
});

// Persist `jwt` in your runtime's secret store. Don't ship it.

// 2. On each session, bind the skill toolset to the host LLM
const { tools } = createSkill({
  baseUrl: "https://mesh.acme.io",
  jwt,
});

// `tools` is an array of { name, description, inputSchema, invoke }
// — register them with your host LLM's tool API
```

## Signing A2A messages

The agent runtime owns the ed25519 private key. firefly-mesh re-verifies the signature on every `firefly.a2a.send` call using the public key registered at activation. Helpers:

```ts
import { canonicalize, signPayload } from "@firefly-mesh/skill";

const body = {
  type: "request",
  content: { summary: "Need engineering review" },
  receiver: receiverEmployeeId,
  // ... full envelope
};
const signature = signPayload(body, myEd25519PrivateKeyDer);
// Pass `signature` as `firefly.a2a.send`'s `signature` field
```

`canonicalize` is RFC-8785-flavored — sorted keys, no whitespace, deterministic. The server uses bit-for-bit the same routine.

## Spec compliance

100% [agentskills.io v1](https://agentskills.io) compatible. The CI matrix on the [main repo](https://github.com/intellicave/firefly-mesh) runs the official lint from [anthropics/skills](https://github.com/anthropics/skills) plus runtime smoke tests against OpenClaw / Hermes / Claude Code (lands with M10).

## License

Apache-2.0 © Cyberautonomy and contributors.
