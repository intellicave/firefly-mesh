/**
 * ed25519 signing and canonical JSON helpers for A2A wire envelopes.
 *
 * Per api §5.2 + rules.md R10 — sender signs canonical body, hub verifies.
 *
 * Edge-runtime safe: uses @noble/curves (NOT node:crypto — CF Workers and
 * browser environments do not expose the full Node crypto API).
 *
 * Canonical serialization: RFC 8785 via the `canonicalize` npm package.
 */

import { ed25519 } from "@noble/curves/ed25519.js";
import canonicalizeJson from "canonicalize";

// ---------------------------------------------------------------------------
// Canonical JSON
// ---------------------------------------------------------------------------

/**
 * Produces RFC 8785 canonical JSON for the given value.
 * Uses the `canonicalize` npm package (not a hand-rolled implementation).
 */
export function canonicalizeEnvelope(envelope: unknown): string {
  const result = canonicalizeJson(envelope);
  if (result === undefined) {
    throw new TypeError("canonicalize returned undefined for input");
  }
  return result;
}

// ---------------------------------------------------------------------------
// Helpers: base64url encode / decode (no Buffer, works in edge runtimes)
// ---------------------------------------------------------------------------

function toBase64Url(bytes: Uint8Array): string {
  // btoa works on binary strings; convert Uint8Array → binary string first
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function fromBase64Url(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Signing API
// ---------------------------------------------------------------------------

/**
 * Sign a wire envelope with an ed25519 private key.
 *
 * @param envelope   - Any JSON-serialisable object (the full envelope).
 * @param privateKeyHex - 64-char hex string (32-byte ed25519 private scalar).
 * @returns base64url-encoded signature string.
 */
export function signEnvelope(
  envelope: unknown,
  privateKeyHex: string,
): string {
  const canonical = canonicalizeEnvelope(envelope);
  const message = new TextEncoder().encode(canonical);
  const privateKey = hexToBytes(privateKeyHex);
  const signature = ed25519.sign(message, privateKey);
  return toBase64Url(signature);
}

/**
 * Verify an ed25519 signature over a canonicalized wire envelope.
 *
 * @param envelope          - The envelope object to verify.
 * @param signatureB64url   - base64url-encoded signature from `signEnvelope`.
 * @param publicKeyBase64url - base64url-encoded 32-byte ed25519 public key.
 * @returns `true` if valid, `false` for any invalid/malformed input.
 */
export function verifySignature(
  envelope: unknown,
  signatureB64url: string,
  publicKeyBase64url: string,
): boolean {
  try {
    const canonical = canonicalizeEnvelope(envelope);
    const message = new TextEncoder().encode(canonical);
    const signature = fromBase64Url(signatureB64url);
    const publicKey = fromBase64Url(publicKeyBase64url);
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new RangeError(`Invalid hex string length: ${hex.length}`);
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (isNaN(byte)) {
      throw new RangeError(`Invalid hex character at position ${i * 2}`);
    }
    bytes[i] = byte;
  }
  return bytes;
}
