# Security Policy

## Reporting a vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

Email **security@cyberautonomy.io** with:

1. A description of the vulnerability and its impact
2. Steps to reproduce (proof-of-concept welcome but not required)
3. Affected version (commit SHA, or `main` if you're testing the tip)
4. Suggested mitigation if you have one
5. Whether you'd like to be credited in the advisory (we default to credit, opt-out by saying so)

We aim to respond within **48 hours** and patch high-severity issues within **7 days**. Coordinated disclosure timelines are negotiable for serious findings — please tell us if you have an external publication date.

## Supported versions

firefly-mesh is **pre-1.0**. Until v1.0, only the `main` branch receives security fixes. We will revisit this once we cut our first stable release (V1.0 in [the roadmap](README.md#roadmap)).

| Version | Security fixes |
|---|---|
| `main` | ✅ |
| Tagged 0.x releases | ❌ (please track `main`) |
| 1.x | ✅ (once cut) |

## Threat model & non-goals

We assume:

- The deployment is self-hosted on infrastructure you control.
- The Postgres database is reachable only from the application server (don't expose port 5432 to the internet).
- `BETTER_AUTH_SECRET` and `AI_GATEWAY_API_KEY` are stored in a real secret manager, not in repo or in plain `.env` files in production.
- Agent runtimes (OpenClaw / Hermes / Cursor) run on trusted user devices. The agent JWT is sensitive — anyone with it can act as that agent.

We **do** defend against:

- Cross-org data leakage. Every query includes `eq(orgId, session.orgId)`. Cross-tenant access is a security bug.
- Forged A2A messages. ed25519 signature verification is enforced by the `withSenderSignature` middleware on `/api/a2a/send`.
- Audit log tampering. RULE-protected at the database layer — no service code path can amend audit rows.
- Token replay across orgs. Agent JWTs encode `org` and `emp` and are validated on every request.
- Privilege escalation through skill priority. The Personal > Department > Company merge runs in a single SQL pass over server-trusted columns.

We **do not** defend against:

- Compromised host machines running the agent runtime. If your laptop is rooted, your firefly-mesh agent is too.
- Side channels through the LLM (prompt injection within document content). RAG returns can carry hostile instructions; the agent runtime is responsible for prompt-injection defenses.
- DoS via the LLM. Deploy with cost guardrails on your AI Gateway.
- Denial-of-service amplification via the SSE endpoint without WAF rate limits in front of it.

## Cryptography

- **A2A message integrity**: ed25519 signatures over RFC-8785-canonicalized JSON.
- **Agent token issuance**: HS256 JWT signed with `BETTER_AUTH_SECRET`. Bootstrap tokens hashed (SHA-256) before storage and revoked after consumption.
- **Cookie sessions**: managed by [Better Auth](https://www.better-auth.com/) — see their security documentation.

If you find a cryptographic mistake (incorrect canonicalization, signature replay, key reuse), please report it as critical.

## Past advisories

None yet — we'll list them here as they arise.

## Acknowledgments

Security researchers who responsibly disclose issues will be credited (with permission) in the advisory and the corresponding release notes. Hall of fame coming with v1.0.
