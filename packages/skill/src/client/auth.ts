// Token persistence + activation helper for skill runtime.
// The runtime is responsible for storing the JWT (per-host secret store);
// this module just owns the protocol of activation.

import { z } from "zod";

const ActivateRequest = z.object({
  oneTimeToken: z.string().min(1),
  runtimeKind: z.enum([
    "openclaw",
    "hermes",
    "claude-code",
    "cursor",
    "claude-desktop",
    "other-mcp",
  ]),
  runtimeVersion: z.string().optional(),
  protocolVersion: z.string().optional(),
  publicKey: z.string().min(1),
});

const ActivateResponse = z.object({
  data: z.object({
    agentId: z.string().uuid(),
    jwt: z.string(),
    scopes: z.array(z.string()),
    serverPublicKey: z.string(),
  }),
});

export interface ActivationOpts {
  baseUrl: string;
  oneTimeToken: string;
  runtimeKind: z.infer<typeof ActivateRequest>["runtimeKind"];
  runtimeVersion?: string;
  protocolVersion?: string;
  /** ed25519 SPKI DER public key, base64-encoded. */
  publicKey: string;
  fetch?: typeof fetch;
}

export interface ActivationResult {
  agentId: string;
  jwt: string;
  scopes: string[];
  serverPublicKey: string;
}

export async function activate(
  opts: ActivationOpts,
): Promise<ActivationResult> {
  const f = opts.fetch ?? fetch;
  const url = opts.baseUrl.replace(/\/+$/, "") + "/api/agent/activate";
  const body = ActivateRequest.parse({
    oneTimeToken: opts.oneTimeToken,
    runtimeKind: opts.runtimeKind,
    runtimeVersion: opts.runtimeVersion,
    protocolVersion: opts.protocolVersion ?? "a2a/v1.2",
    publicKey: opts.publicKey,
  });
  const res = await f(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Activation failed (HTTP ${res.status}): ${text}`);
  }
  const json = await res.json();
  const parsed = ActivateResponse.parse(json);
  return parsed.data;
}

/**
 * Storage adapter — runtimes implement this to persist JWT in their
 * native secret store (e.g. OS keychain, secure config file).
 */
export interface TokenStore {
  load(): Promise<string | null>;
  save(jwt: string): Promise<void>;
  clear(): Promise<void>;
}

/** In-memory store for tests / one-shot CLI use. */
export function memoryTokenStore(initial?: string): TokenStore {
  let v = initial ?? null;
  return {
    async load() {
      return v;
    },
    async save(jwt) {
      v = jwt;
    },
    async clear() {
      v = null;
    },
  };
}
