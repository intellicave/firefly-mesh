/**
 * X3DH (Extended Triple Diffie-Hellman) key types and interface.
 *
 * M0: Key generation produces a structurally correct keypair bundle.
 *     Full X3DH handshake (key agreement / shared-secret derivation) is
 *     scoped to M3. Any call to the agreement function throws a typed error
 *     so callers know exactly what is missing rather than getting a silent no-op.
 *
 * Edge-runtime safe: uses @noble/curves (NOT node:crypto).
 */

import { ed25519 } from "@noble/curves/ed25519.js";
import { AppError, ErrorCode } from "@firefly-mesh/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw key bytes — 32 bytes for both ed25519 and X25519 keys. */
export interface KeyPair {
  /** Raw 32-byte private scalar (Uint8Array). Keep secret. */
  privateKey: Uint8Array;
  /** Raw 32-byte public key (Uint8Array). */
  publicKey: Uint8Array;
}

/**
 * Full X3DH identity + prekey bundle for an agent.
 *
 * Fields follow the Signal Protocol / X3DH spec naming:
 *   IK  = identity keypair (long-term ed25519)
 *   SPK = signed prekey  (medium-term X25519, signed by IK)
 *   OPK = one-time prekeys (X25519, consumed on first use)
 */
export interface X3DHKeys {
  /** Long-term identity keypair (ed25519). */
  identityKey: KeyPair;
  /** Medium-term signed prekey (ed25519 in M0; X25519 in M3). */
  signedPrekey: KeyPair;
  /** ed25519 signature of signedPrekey.publicKey, made with identityKey. */
  signedPrekeySignature: Uint8Array;
  /** Pool of one-time prekeys (ed25519 in M0; X25519 in M3). */
  oneTimePrekeys: KeyPair[];
}

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

/** Generate a fresh ed25519 keypair using @noble/curves. */
function generateKeypair(): KeyPair {
  const privateKey = ed25519.utils.randomSecretKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

/**
 * Generate a full X3DH keypair bundle for a new agent registration.
 *
 * M0: All keys are ed25519. In M3, signed-prekey and one-time prekeys
 * will be X25519 (Curve25519 DH keys) as required by the full X3DH spec.
 * The structure and interface are identical; only the curve changes.
 *
 * @param oneTimePrekeyCount - Number of one-time prekeys to generate (default 20).
 */
export function generateX3DHKeys(oneTimePrekeyCount = 20): X3DHKeys {
  const identityKey = generateKeypair();
  const signedPrekey = generateKeypair();

  // Sign the signed-prekey's public key with the identity private key
  const signedPrekeySignature = ed25519.sign(
    signedPrekey.publicKey,
    identityKey.privateKey,
  );

  const oneTimePrekeys: KeyPair[] = [];
  for (let i = 0; i < oneTimePrekeyCount; i++) {
    oneTimePrekeys.push(generateKeypair());
  }

  return {
    identityKey,
    signedPrekey,
    signedPrekeySignature,
    oneTimePrekeys,
  };
}

// ---------------------------------------------------------------------------
// X3DH Key Agreement (M3)
// ---------------------------------------------------------------------------

/**
 * Perform the X3DH sender-side key agreement to derive a shared secret.
 *
 * M3: Full X3DH Diffie-Hellman handshake (X25519 DH on IK, EK, SPK, OPK).
 * This function will be implemented in M3 once X25519 key types are in place.
 */
export function performX3DHSend(
  _senderIdentityKey: KeyPair,
  _receiverBundle: {
    identityKey: Uint8Array;
    signedPrekey: Uint8Array;
    signedPrekeySignature: Uint8Array;
    oneTimePrekey?: Uint8Array;
  },
): never {
  throw new AppError(
    ErrorCode.NOT_IMPLEMENTED,
    "X3DH key agreement not yet implemented",
    501,
  );
}

/**
 * Perform the X3DH receiver-side key agreement to derive the shared secret.
 *
 * M3: Full X3DH Diffie-Hellman handshake (X25519 DH on IK, EK, SPK, OPK).
 * This function will be implemented in M3 once X25519 key types are in place.
 */
export function performX3DHReceive(
  _receiverKeys: X3DHKeys,
  _senderIdentityKey: Uint8Array,
  _ephemeralKey: Uint8Array,
  _usedOneTimePrekeyIndex?: number,
): never {
  throw new AppError(
    ErrorCode.NOT_IMPLEMENTED,
    "X3DH key agreement not yet implemented",
    501,
  );
}
