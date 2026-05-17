// Boundary scope catalog — sprint 2026-05-17 M6.
// Ported from legacy/v0/packages/core/src/boundary/catalog.ts.
//
// Each scope is a server-side guarded capability. Agents carry their
// granted scopes in the `scope` claim of their JWT (set at JWT signing
// time from representation_boundaries.scopes). Hub endpoints opt in to
// enforcement by calling `enforceScope(payload.scope, "submit_task")`.
//
// This sprint defines the catalog + helpers. Wiring into individual hub
// business endpoints (messages / a2a / etc.) is per-endpoint and not in
// the M5-M7 sprint scope — see docs/plans/2026-05-17-firefly-mesh-product-layer-m5-m7-ideation.md §5.

export interface ScopeDef {
  id: string
  description: string
  category: "read" | "write" | "a2a" | "action"
  defaultEnabled: boolean
  /** Dangerous scopes default off; admin must explicitly enable. */
  dangerous?: boolean
}

export const SCOPE_CATALOG: readonly ScopeDef[] = [
  {
    id: "read_kb",
    description: "Read knowledge base in agent's accessible scopes",
    category: "read",
    defaultEnabled: true,
  },
  {
    id: "write_kb_personal",
    description: "Upload / edit personal-scope KB documents",
    category: "write",
    defaultEnabled: true,
  },
  {
    id: "submit_task",
    description: "Submit task completion (triggers HITL review)",
    category: "write",
    defaultEnabled: true,
  },
  {
    id: "send_a2a_inform",
    description: "Send inform-type A2A message (no HITL)",
    category: "a2a",
    defaultEnabled: true,
  },
  {
    id: "send_a2a_request",
    description: "Send request-type A2A message (HITL approval required)",
    category: "a2a",
    defaultEnabled: true,
  },
  {
    id: "send_a2a_commit",
    description: "Send commit-type A2A message (HITL approval required)",
    category: "a2a",
    defaultEnabled: true,
  },
  {
    id: "send_a2a_handoff",
    description: "Send handoff-type A2A message (HITL approval required)",
    category: "a2a",
    defaultEnabled: true,
  },
  {
    id: "dispatch_task",
    description: "Initiate task with LLM decomposition (CEO / manager only)",
    category: "action",
    defaultEnabled: false,
  },
  {
    id: "send_external_email",
    description: "Send email outside the organization",
    category: "action",
    defaultEnabled: false,
    dangerous: true,
  },
  {
    id: "sign_contract",
    description: "Sign legal contract on behalf of the employee",
    category: "action",
    defaultEnabled: false,
    dangerous: true,
  },
] as const

export const SCOPE_IDS: readonly string[] = SCOPE_CATALOG.map((s) => s.id)
export type ScopeId = (typeof SCOPE_CATALOG)[number]["id"]

export function isValidScope(id: string): boolean {
  return SCOPE_IDS.includes(id)
}

/** Default scope set assigned to every agent at activation. */
export function defaultScopes(): string[] {
  return SCOPE_CATALOG.filter((s) => s.defaultEnabled).map((s) => s.id)
}

export function isDangerousScope(id: string): boolean {
  return SCOPE_CATALOG.find((s) => s.id === id)?.dangerous ?? false
}

export function getScopeDef(id: string): ScopeDef | undefined {
  return SCOPE_CATALOG.find((s) => s.id === id)
}

export class BoundaryViolationError extends Error {
  readonly code = "BOUNDARY_VIOLATION"
  constructor(scope: string) {
    super(`BOUNDARY_VIOLATION: missing scope "${scope}"`)
  }
}

/**
 * Server-side scope enforcement. Throws BoundaryViolationError if the agent
 * lacks the required scope. Call sites catch and map to HTTP 403.
 */
export function enforceScope(
  agentScopes: readonly string[],
  required: string,
): void {
  if (!agentScopes.includes(required)) {
    throw new BoundaryViolationError(required)
  }
}
