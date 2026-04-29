// Re-export of the SDK HTTP client + ed25519 signing helper for A2A send.
// Skill tools use this to call the firefly-mesh deployment.

import { sign as edSign } from "node:crypto";

export {
  FireflyMeshClient,
  FireflyMeshError,
  type ClientOpts,
} from "@firefly-mesh/sdk";

/**
 * Deterministic JSON canonicalization (RFC-8785-flavored), matches
 * packages/core/a2a/signing.ts. Skill tools use this to sign A2A messages
 * before calling /api/a2a/send.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map((v) => canonicalize(v)).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys
      .map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`)
      .join(",") +
    "}"
  );
}

/**
 * Sign an arbitrary payload with an ed25519 PKCS8 private key (DER buffer).
 * Returns base64. The agent runtime owns the private key; we only sign here.
 */
export function signPayload(payload: unknown, privateKeyDer: Buffer): string {
  const message = Buffer.from(canonicalize(payload), "utf-8");
  const sig = edSign(null, message, {
    key: privateKeyDer,
    format: "der",
    type: "pkcs8",
  });
  return sig.toString("base64");
}
