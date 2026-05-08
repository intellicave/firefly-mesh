/**
 * AES-256-GCM authenticated encryption / decryption.
 *
 * Uses @noble/ciphers/aes — edge-runtime safe (no node:crypto).
 *
 * Key:   32 bytes (256-bit)
 * Nonce: 12 bytes (96-bit, standard GCM IV length)
 *
 * encrypt returns:  ciphertext || auth-tag (16 bytes tag appended by @noble/ciphers)
 * decrypt expects:  ciphertext || auth-tag
 */

import { gcm } from "@noble/ciphers/aes.js";

/**
 * Encrypt plaintext with AES-256-GCM.
 *
 * @param plaintext - Raw bytes to encrypt.
 * @param key       - 32-byte (256-bit) symmetric key.
 * @param nonce     - 12-byte nonce (must be unique per (key, message) pair).
 * @returns Ciphertext bytes with 16-byte GCM authentication tag appended.
 */
export function encrypt(
  plaintext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
): Uint8Array {
  if (key.length !== 32) {
    throw new RangeError(`AES-256-GCM requires a 32-byte key, got ${key.length}`);
  }
  if (nonce.length !== 12) {
    throw new RangeError(`AES-GCM requires a 12-byte nonce, got ${nonce.length}`);
  }
  const cipher = gcm(key, nonce);
  return cipher.encrypt(plaintext);
}

/**
 * Decrypt and authenticate ciphertext with AES-256-GCM.
 *
 * @param ciphertext - Encrypted bytes with 16-byte auth tag appended.
 * @param key        - 32-byte (256-bit) symmetric key.
 * @param nonce      - 12-byte nonce (must match the value used during encryption).
 * @returns Decrypted plaintext bytes.
 * @throws If authentication tag verification fails (tampered ciphertext).
 */
export function decrypt(
  ciphertext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
): Uint8Array {
  if (key.length !== 32) {
    throw new RangeError(`AES-256-GCM requires a 32-byte key, got ${key.length}`);
  }
  if (nonce.length !== 12) {
    throw new RangeError(`AES-GCM requires a 12-byte nonce, got ${nonce.length}`);
  }
  const cipher = gcm(key, nonce);
  return cipher.decrypt(ciphertext);
}
