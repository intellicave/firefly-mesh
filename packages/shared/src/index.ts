/**
 * @firefly-mesh/shared
 * Shared constants, error codes, types, and AppError for all firefly-mesh packages.
 * Edge-runtime safe: no Node.js built-ins.
 */

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

export enum ErrorCode {
  // Resource lookup failures
  TENANT_NOT_FOUND = "TENANT_NOT_FOUND",
  AGENT_NOT_FOUND = "AGENT_NOT_FOUND",
  CODE_NOT_FOUND = "CODE_NOT_FOUND",

  // Pairing / registration state
  CODE_ALREADY_CLAIMED = "CODE_ALREADY_CLAIMED",
  CODE_ALREADY_REGISTERED = "CODE_ALREADY_REGISTERED",

  // Auth / crypto
  SIGNATURE_INVALID = "SIGNATURE_INVALID",

  // Authorization
  CROSS_TENANT = "CROSS_TENANT",
  FORBIDDEN = "FORBIDDEN",

  // Input validation
  VALIDATION_ERROR = "VALIDATION_ERROR",

  // Not yet implemented (M0 stubs that will be completed in later milestones)
  NOT_IMPLEMENTED = "NOT_IMPLEMENTED",

  // Generic server-side fault
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

// ---------------------------------------------------------------------------
// AppError
// ---------------------------------------------------------------------------

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;

  constructor(code: ErrorCode, message: string, statusCode = 500) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    // Maintain proper prototype chain in compiled JS
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Pairing code TTL: 10 minutes */
export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;

/** Pending (queued) message TTL: 72 hours */
export const PENDING_MESSAGE_TTL_MS = 72 * 60 * 60 * 1000;

/** Message metadata retention window: 14 days */
export const MESSAGES_META_RETENTION_DAYS = 14;

/** Minimum number of one-time prekeys an agent must publish */
export const MIN_PREKEYS = 10;

/** Maximum number of one-time prekeys an agent may publish at once */
export const MAX_PREKEYS = 100;
