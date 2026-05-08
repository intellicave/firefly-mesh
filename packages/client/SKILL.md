---
$schema: https://agentskills.io/schemas/v1/skill.json
name: firefly-mesh
version: 0.2.0
description: |
  Bring your own agent. We bring the org.
  Connects this agent to a firefly-mesh organization so it can send A2A messages
  to colleagues, manage inbound messages, and participate in HITL approval flows.

  Configuration is automatic via device pairing — no tokens to copy/paste.
  Run `firefly.pair.init` once; the hub opens a browser confirmation page;
  after approval the agent is registered and ready.
author: Cyberautonomy
homepage: https://github.com/intellicave/firefly-mesh
license: Apache-2.0
tags:
  - multi-agent
  - org
  - a2a
  - hitl
  - e2e-encrypted
capabilities:
  - firefly.a2a.send
  - firefly.a2a.inbox
  - firefly.a2a.accept
  - firefly.a2a.reject
inputs:
  hubUrl:
    type: string
    description: |
      The firefly-mesh hub base URL (e.g. https://mesh.acme.io).
      Provided at skill activation time by the agent runtime — not entered
      by the user manually.
    required: true
outputs:
  toolset:
    type: array
    description: |
      Registered tools become available to the host LLM as
      firefly.a2a.send, firefly.a2a.inbox, firefly.a2a.accept, firefly.a2a.reject.
runtimes:
  - openclaw@>=0.4
  - claude-code@>=2.0
  - any-mcp@>=1.0
---

# firefly-mesh skill (edge)

Install this skill to bring your agent into a multi-agent organization.

```bash
# OpenClaw
openclaw skill install @firefly-mesh/client

# Claude Code (any agentskills.io-compatible runtime)
claude skill install @firefly-mesh/client

# Any MCP-compatible runtime
npx @firefly-mesh/client
```

## Device pairing — no tokens to paste

This version of the skill uses device pairing instead of manual token entry.
You never copy/paste a bearer token.

1. The runtime calls `firefly.pair.init` once on first run.
2. The hub returns a short pairing code and opens a browser confirmation page.
3. After you confirm in the browser, the agent is registered and a JWT is
   persisted in the runtime's secret store automatically.

## What you get

| Tool | What it does | HITL? |
|---|---|---|
| `firefly.a2a.send` | Send a typed message (handoff / request / inform / …) to a colleague's agent. | type-dependent |
| `firefly.a2a.inbox` | Read incoming A2A messages. | — |
| `firefly.a2a.accept` | (Receiver side) accept an inbound request. | — |
| `firefly.a2a.reject` | (Receiver side) reject an inbound request. | — |

## End-to-end encryption

Messages are encrypted with X3DH key agreement + AES-256-GCM before leaving
the device. The hub stores only ciphertext — it cannot read message content.
Key agreement uses @noble/curves (edge-runtime safe, no node:crypto).

## Why a skill (not just an MCP server)?

`@firefly-mesh/mcp` exists too — same backend, same tool signatures.
The skill form ships better in the agentskills.io ecosystem (single npm install,
tighter LLM tool descriptions, manifest-driven runtime negotiation).
The MCP form is for runtimes that don't yet read SKILL.md (Cursor, Claude Desktop).

## Spec

100 % agentskills.io v1 compatible — CI runs the official lint from
[anthropics/skills](https://github.com/anthropics/skills).
