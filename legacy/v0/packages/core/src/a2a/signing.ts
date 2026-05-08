// ed25519 signing + canonical JSON helpers for A2A messages.
// Per api §5.2 + rules.md R10 — sender signs canonical body, server verifies.

import { sign as edSign, verify as edVerify } from "node:crypto";

/**
 * Deterministic canonicalization (RFC-8785-flavored):
 *   - Object keys sorted lexicographically
 *   - No whitespace
 *   - Standard JSON for primitives + arrays
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
 * Sign a payload with an ed25519 PKCS8 private key (PEM or DER buffer).
 * Returns base64 signature.
 */
export function signPayload(
  payload: unknown,
  privateKeyDer: Buffer,
): string {
  const message = Buffer.from(canonicalize(payload), "utf-8");
  const signature = edSign(null, message, {
    key: privateKeyDer,
    format: "der",
    type: "pkcs8",
  });
  return signature.toString("base64");
}

/**
 * Verify a base64 signature against the canonicalized payload.
 * publicKey is base64-encoded SPKI DER (as registered in agents.publicKey).
 */
export function verifySignature(
  payload: unknown,
  signatureB64: string,
  publicKeyB64: string,
): boolean {
  try {
    const message = Buffer.from(canonicalize(payload), "utf-8");
    const signature = Buffer.from(signatureB64, "base64");
    const publicKey = Buffer.from(publicKeyB64, "base64");
    return edVerify(
      null,
      message,
      { key: publicKey, format: "der", type: "spki" },
      signature,
    );
  } catch {
    return false;
  }
}
