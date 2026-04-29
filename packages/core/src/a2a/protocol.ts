// Google A2A v1.2 wire schema (api §5.1).
// All A2A messages — both inbound (POST /api/a2a/send body) and outbound
// (broker fan-out) — conform to this shape.

import { z } from "zod";

export const A2AMessageType = z.enum([
  "inform",
  "sync",
  "request",
  "commit",
  "handoff",
  "escalate",
  "block",
]);

export const A2AContent = z.object({
  summary: z.string().min(1).max(500),
  body: z.string().max(20_000).optional(),
  structured: z.record(z.string(), z.unknown()).optional(),
});

/** Inbound: what the agent's skill/MCP client POSTs to /api/a2a/send. */
export const A2ASendRequest = z.object({
  // sender info comes from auth context — not in body
  receiverEmployeeId: z.string().uuid().optional(),
  receiverAgentId: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
  replyToMessageId: z.string().uuid().optional(),
  type: A2AMessageType,
  content: A2AContent,
  relatedTaskId: z.string().uuid().optional(),
});

export type A2ASendRequestT = z.infer<typeof A2ASendRequest>;

/** Outbound wire format (Google A2A v1.2 envelope) — what flows over A2A
 *  protocol.org boundary or gets stored as the audit fingerprint. */
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
  content: A2AContent,
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
  signature: z.string().min(40), // base64 ed25519 over canonical body
});

export type A2AMessageWireT = z.infer<typeof A2AMessageWire>;
