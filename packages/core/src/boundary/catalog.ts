// Boundary scope catalog (M1-6, api §2.4).
// Each scope is a server-side guarded capability assigned to agents via
// representation_boundaries.scopes (JSONB column).

export interface ScopeDef {
  id: string;
  description: string;
  category: "read" | "write" | "a2a" | "action";
  defaultEnabled: boolean;
  /** Dangerous scopes default off; admin must explicitly enable. */
  dangerous?: boolean;
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
    description: "Initiate task with LLM decomposition (CEO/manager only)",
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
] as const;

export const SCOPE_IDS = SCOPE_CATALOG.map((s) => s.id);
export type ScopeId = (typeof SCOPE_CATALOG)[number]["id"];

export function isValidScope(id: string): boolean {
  return SCOPE_IDS.includes(id);
}

/** Default scope set assigned to every agent at activation. */
export function defaultScopes(): string[] {
  return SCOPE_CATALOG.filter((s) => s.defaultEnabled).map((s) => s.id);
}

export function isDangerousScope(id: string): boolean {
  return SCOPE_CATALOG.find((s) => s.id === id)?.dangerous ?? false;
}

export function getScopeDef(id: string): ScopeDef | undefined {
  return SCOPE_CATALOG.find((s) => s.id === id);
}

/**
 * Server-side scope enforcement. Throws if agent lacks required scope.
 */
export function enforceScope(
  agentScopes: readonly string[],
  required: string,
): void {
  if (!agentScopes.includes(required)) {
    const err = new Error(`BOUNDARY_VIOLATION: missing scope "${required}"`);
    (err as Error & { code?: string }).code = "BOUNDARY_VIOLATION";
    throw err;
  }
}
