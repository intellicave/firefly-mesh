/**
 * X3DH (Extended Triple Diffie-Hellman) — full implementation.
 *
 * Spec: Signal Protocol X3DH (simplified, no Double Ratchet for M3).
 * Edge-runtime safe: uses @noble/curves (X25519 + ed25519) and @noble/hashes (HKDF + SHA-256).
 * Never uses node:crypto.
 */

import { ed25519, x25519 } from "@noble/curves/ed25519.js"
import { hkdf } from "@noble/hashes/hkdf.js"
import { sha256 } from "@noble/hashes/sha2.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KeyPair {
  privateKey: Uint8Array
  publicKey: Uint8Array
}

export interface X3DHKeys {
  /** Long-term identity keypair (ed25519, used for signing). */
  identityKey: KeyPair
  /** Identity key in X25519 form (derived from ed25519 IK for DH operations). */
  identityKeyX25519: KeyPair
  /** Medium-term signed prekey (X25519). */
  signedPrekey: KeyPair
  /** ed25519 signature of signedPrekey.publicKey using identityKey. */
  signedPrekeySignature: Uint8Array
  /** Pool of one-time prekeys (X25519, consumed on first use). */
  oneTimePrekeys: KeyPair[]
}

export interface PrekeyBundle {
  /** ed25519 identity public key (32 B). */
  identityKey: Uint8Array
  /** X25519 identity public key (32 B). */
  identityKeyX25519: Uint8Array
  /** X25519 signed prekey public (32 B). */
  signedPrekey: Uint8Array
  /** ed25519 signature over signedPrekey (64 B). */
  signedPrekeySignature: Uint8Array
  /** X25519 one-time prekey public (32 B), if any. */
  oneTimePrekey?: Uint8Array
  /** Server-assigned identifier of consumed OPK (echoed back to receiver). */
  oneTimePrekeyId?: number
}

export interface X3DHSendResult {
  /** Master secret for AES-256-GCM (32 B). */
  sharedSecret: Uint8Array
  /** Sender ephemeral public key (32 B) — must be sent on the wire. */
  ephemeralPublicKey: Uint8Array
  /** OPK id used (if any) — receiver needs this to pick the right private OPK. */
  oneTimePrekeyId?: number
}

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

function generateX25519Keypair(): KeyPair {
  const privateKey = x25519.utils.randomSecretKey()
  const publicKey = x25519.getPublicKey(privateKey)
  return { privateKey, publicKey }
}

function generateEd25519Keypair(): KeyPair {
  const privateKey = ed25519.utils.randomSecretKey()
  const publicKey = ed25519.getPublicKey(privateKey)
  return { privateKey, publicKey }
}

/**
 * Generate a full X3DH keypair bundle for a new agent.
 *
 * @param oneTimePrekeyCount - Number of OPKs to generate (default 20).
 */
export function generateX3DHKeys(oneTimePrekeyCount = 20): X3DHKeys {
  const identityKey = generateEd25519Keypair()
  // Derive an X25519 keypair for DH operations on the identity key.
  // We use a separate X25519 keypair (not converted from ed25519) for clarity and safety.
  const identityKeyX25519 = generateX25519Keypair()
  const signedPrekey = generateX25519Keypair()

  // Sign the signed-prekey's public key with the ed25519 identity private key
  const signedPrekeySignature = ed25519.sign(
    signedPrekey.publicKey,
    identityKey.privateKey,
  )

  const oneTimePrekeys: KeyPair[] = []
  for (let i = 0; i < oneTimePrekeyCount; i++) {
    oneTimePrekeys.push(generateX25519Keypair())
  }

  return {
    identityKey,
    identityKeyX25519,
    signedPrekey,
    signedPrekeySignature,
    oneTimePrekeys,
  }
}

// ---------------------------------------------------------------------------
// X3DH Key Agreement
// ---------------------------------------------------------------------------

const HKDF_INFO = new TextEncoder().encode("firefly-mesh.x3dh.v1")
const HKDF_LENGTH = 32 // AES-256-GCM key size

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) {
    out.set(a, offset)
    offset += a.length
  }
  return out
}

/**
 * Sender-side X3DH:
 *   DH1 = X25519(IK_s_priv, SPK_pub)
 *   DH2 = X25519(EK_priv,   IK_r_X25519_pub)
 *   DH3 = X25519(EK_priv,   SPK_pub)
 *   DH4 = X25519(EK_priv,   OPK_pub) (if OPK present)
 *   shared = HKDF(DH1 || DH2 || DH3 || DH4, info)
 */
export function performX3DHSend(
  senderIdentityKeyX25519: KeyPair,
  receiverBundle: PrekeyBundle,
): X3DHSendResult {
  // Verify SPK signature with receiver's ed25519 IK
  const sigOk = ed25519.verify(
    receiverBundle.signedPrekeySignature,
    receiverBundle.signedPrekey,
    receiverBundle.identityKey,
  )
  if (!sigOk) {
    throw new Error("Invalid signed prekey signature")
  }

  const ephemeral = generateX25519Keypair()

  const dh1 = x25519.getSharedSecret(
    senderIdentityKeyX25519.privateKey,
    receiverBundle.signedPrekey,
  )
  const dh2 = x25519.getSharedSecret(ephemeral.privateKey, receiverBundle.identityKeyX25519)
  const dh3 = x25519.getSharedSecret(ephemeral.privateKey, receiverBundle.signedPrekey)

  let combined: Uint8Array
  if (receiverBundle.oneTimePrekey) {
    const dh4 = x25519.getSharedSecret(ephemeral.privateKey, receiverBundle.oneTimePrekey)
    combined = concat(dh1, dh2, dh3, dh4)
  } else {
    combined = concat(dh1, dh2, dh3)
  }

  const sharedSecret = hkdf(sha256, combined, undefined, HKDF_INFO, HKDF_LENGTH)

  const result: X3DHSendResult = {
    sharedSecret,
    ephemeralPublicKey: ephemeral.publicKey,
  }
  if (receiverBundle.oneTimePrekeyId !== undefined) {
    result.oneTimePrekeyId = receiverBundle.oneTimePrekeyId
  }
  return result
}

/**
 * Receiver-side X3DH:
 *   DH1 = X25519(SPK_priv, IK_s_X25519_pub)
 *   DH2 = X25519(IK_r_priv, EK_pub)
 *   DH3 = X25519(SPK_priv, EK_pub)
 *   DH4 = X25519(OPK_priv, EK_pub) (if OPK was used)
 *   shared = HKDF(DH1 || DH2 || DH3 || DH4, info)
 */
export function performX3DHReceive(
  receiverIdentityKeyX25519: KeyPair,
  receiverSignedPrekey: KeyPair,
  senderIdentityKeyX25519Pub: Uint8Array,
  senderEphemeralPub: Uint8Array,
  receiverOneTimePrekey?: KeyPair,
): Uint8Array {
  const dh1 = x25519.getSharedSecret(receiverSignedPrekey.privateKey, senderIdentityKeyX25519Pub)
  const dh2 = x25519.getSharedSecret(receiverIdentityKeyX25519.privateKey, senderEphemeralPub)
  const dh3 = x25519.getSharedSecret(receiverSignedPrekey.privateKey, senderEphemeralPub)

  let combined: Uint8Array
  if (receiverOneTimePrekey) {
    const dh4 = x25519.getSharedSecret(receiverOneTimePrekey.privateKey, senderEphemeralPub)
    combined = concat(dh1, dh2, dh3, dh4)
  } else {
    combined = concat(dh1, dh2, dh3)
  }

  return hkdf(sha256, combined, undefined, HKDF_INFO, HKDF_LENGTH)
}
