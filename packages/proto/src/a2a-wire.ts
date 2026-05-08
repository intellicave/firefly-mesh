/**
 * A2A wire schema for firefly-mesh edge runtime.
 *
 * Extended from Google A2A v1.2 (api §5.1) with E2E encryption fields
 * added for the edge/encrypted-transport layer.
 *
 * Edge-runtime safe: no Node.js built-ins.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Message type enum
// ---------------------------------------------------------------------------

export const A2AMessageType = z.enum([
  "inform",
  "sync",
  "request",
  "commit",
  "handoff",
  "escalate",
  "block",
]);

export type A2AMessageTypeT = z.infer<typeof A2AMessageType>;

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

export const A2AContent = z.object({
  summary: z.string().min(1).max(500),
  body: z.string().max(20_000).optional(),
  structured: z.record(z.string(), z.unknown()).optional(),
});

export type A2AContentT = z.infer<typeof A2AContent>;

// ---------------------------------------------------------------------------
// Inbound request (agent skill → hub POST /api/a2a/send)
// ---------------------------------------------------------------------------

export const A2ASendRequest = z.object({
  // sender identity comes from auth context — not in body
  receiverEmployeeId: z.string().uuid().optional(),
  receiverAgentId: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
  replyToMessageId: z.string().uuid().optional(),
  type: A2AMessageType,
  content: A2AContent,
  relatedTaskId: z.string().uuid().optional(),
});

export type A2ASendRequestT = z.infer<typeof A2ASendRequest>;

// ---------------------------------------------------------------------------
// Outbound wire format (Google A2A v1.2 envelope + edge E2E fields)
// ---------------------------------------------------------------------------

/**
 * Wire envelope that flows over the A2A protocol boundary.
 *
 * E2E encryption fields (added for edge runtime vs. classic v0):
 *   - encrypted_payload: AES-256-GCM ciphertext of A2AContent (base64url)
 *   - nonce:             12-byte GCM nonce (base64url)
 *   - ephemeral_pk:      sender's ephemeral X3DH public key (base64url)
 *
 * When E2E encryption is active all three fields are present and
 * the plaintext `content` field carries only a non-sensitive summary
 * (or is left empty for fully opaque messages).
 *
 * When E2E encryption is not in use (e.g. hub-internal delivery) all
 * three fields are absent and `content` carries the full plaintext.
 */
export const A2AMessageWire = z.object({
  messageId: z.string().uuid(),
  threadId: z.string().uuid(),
  replyToMessageId: z.string().uuid().optional(),
  protocolVersion: z.literal("1.2"),
  timestamp: z.string().datetime(),

  sender: z.object({
    agentId: z.string().uuid(),
    employeeId: z.string().uuid(),
    employeeName: z.string(),
    department: z.string().optional(),
    authorityScope: z.array(z.string()),
  }),

  receiver: z.object({
    agentId: z.string().uuid(),
    employeeId: z.string().uuid(),
  }),

  type: A2AMessageType,

  /** Plaintext content. Present when encryption is not used. */
  content: A2AContent,

  // E2E encryption fields (all three absent ↔ plaintext; all three present ↔ encrypted)
  /** AES-256-GCM ciphertext of A2AContent JSON (base64url). */
  encrypted_payload: z.string().optional(),
  /** 12-byte GCM nonce (base64url). */
  nonce: z.string().optional(),
  /** Sender ephemeral X3DH public key (base64url, ed25519). */
  ephemeral_pk: z.string().optional(),

  approval: z.object({
    senderApprovalRequired: z.boolean(),
    senderApprovalStatus: z.enum(["pending", "approved", "rejected", "auto"]),
    senderApprovalBy: z.string().uuid().optional(),
    senderApprovalAt: z.string().datetime().optional(),
  }),

  action: z.object({
    receiverActionRequired: z.boolean(),
    receiverActionStatus: z.enum(["pending", "accepted", "rejected", "auto"]),
    deadline: z.string().datetime().optional(),
  }),

  links: z.object({
    relatedTaskId: z.string().uuid().optional(),
    relatedSopNodeId: z.string().uuid().optional(),
  }),

  audit: z.object({
    confidenceScore: z.number().min(0).max(1).optional(),
  }),

  /** base64url ed25519 signature over canonical envelope body (api §5.2). */
  signature: z.string().min(40),
});

export type A2AMessageWireT = z.infer<typeof A2AMessageWire>;

// ---------------------------------------------------------------------------
// Prekey bundle (for X3DH key exchange)
// ---------------------------------------------------------------------------

export const PrekeyBundle = z.object({
  agentId: z.string().uuid(),
  identityKey: z.string(),        // base64url ed25519 public key
  signedPrekey: z.string(),       // base64url X25519 public key
  signedPrekeySignature: z.string(), // base64url ed25519 sig over signedPrekey
  oneTimePrekey: z.string().optional(), // base64url X25519 public key
});

export type PrekeyBundleT = z.infer<typeof PrekeyBundle>;
