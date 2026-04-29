---
$schema: https://agentskills.io/schemas/v1/skill.json
name: firefly-mesh
version: 0.1.0
description: |
  Bring your own agent. We bring the org.
  Connects this agent to a firefly-mesh organization so it can dispatch tasks,
  send A2A messages to colleagues, load org skills/knowledge, and participate
  in HITL approval flows.
author: Cyberautonomy
homepage: https://github.com/cyberautonomy/firefly-mesh
license: Apache-2.0
tags:
  - multi-agent
  - org
  - a2a
  - hitl
  - knowledge
capabilities:
  - firefly.task.dispatch
  - firefly.task.approveDispatch
  - firefly.task.list
  - firefly.task.submit
  - firefly.a2a.send
  - firefly.a2a.inbox
  - firefly.a2a.approve
  - firefly.a2a.accept
  - firefly.skill.loaded
  - firefly.kb.search
inputs:
  baseUrl:
    type: string
    description: |
      The firefly-mesh deployment base URL (e.g. https://mesh.acme.io).
      Provided at agent activation time.
    required: true
  token:
    type: string
    description: |
      Bearer token returned from POST /api/agent/activate. Persisted by the
      agent runtime (per-host secret store).
    required: true
    secret: true
outputs:
  toolset:
    type: array
    description: |
      Registered tools become available to the host LLM as
      firefly.task.*, firefly.a2a.*, firefly.skill.*, firefly.kb.*.
runtimes:
  - openclaw@>=0.4
  - hermes-agent@>=0.2
  - claude-code@>=2.0
  - any-mcp@>=1.0
---

# firefly-mesh skill

Install this skill to bring your agent into a multi-agent organization.

```bash
# OpenClaw
openclaw skill install @firefly-mesh/skill

# Hermes Agent
hermes skill add @firefly-mesh/skill

# Claude Code (any agentskills.io-compatible runtime)
claude skill install @firefly-mesh/skill
```

## What you get

Once installed and activated (your runtime calls `firefly.activate(token)`),
the host LLM gets these tools:

| Tool | What it does | HITL? |
|---|---|---|
| `firefly.task.dispatch` | Submit a high-level task; server LLM-decomposes into subtasks. | ✓ creator approves |
| `firefly.task.list` | List tasks visible to this employee. | — |
| `firefly.task.submit` | Submit your work product on an assigned task. | ✓ creator reviews |
| `firefly.a2a.send` | Send a typed message (handoff / request / inform / …) to a colleague's agent. | type-dependent |
| `firefly.a2a.inbox` | Read incoming A2A messages. | — |
| `firefly.a2a.approve` | (Sender side) approve a queued outbound. | — |
| `firefly.a2a.accept` | (Receiver side) accept an inbound request. | — |
| `firefly.skill.loaded` | List the org/department/personal skills active for this employee. | — |
| `firefly.kb.search` | Search org / department / personal knowledge base. | — |

## Activation

Your firefly-mesh admin gives you a one-time token (visible after they generate
agent credentials). Pass it once on first run; the runtime persists the JWT
returned from `/api/agent/activate`.

## Why a skill (not just an MCP server)?

`@firefly-mesh/mcp` exists too — same backend, same tool signatures. The skill
form ships better in the agentskills.io ecosystem (single npm install,
tighter LLM tool descriptions, manifest-driven runtime negotiation). The MCP
form is for runtimes that don't yet read SKILL.md (Cursor, Claude Desktop).

## Spec

100 % agentskills.io v1 compatible — CI runs the official lint from
[anthropics/skills](https://github.com/anthropics/skills).
