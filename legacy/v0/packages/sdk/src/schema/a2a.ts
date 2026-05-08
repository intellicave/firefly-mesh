// Wire-format zod schemas for /api/a2a/*. Mirrors design §6.7 + api §5.

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
export type A2AMessageType = z.infer<typeof A2AMessageType>;

export const A2AContent = z.object({
  summary: z.string().min(1).max(500),
  body: z.string().max(10_000).optional(),
  structured: z.record(z.string(), z.unknown()).optional(),
});
export type A2AContent = z.infer<typeof A2AContent>;

export const A2ASendRequest = z.object({
  receiverAgentId: z.string().uuid().optional(),
  receiverEmployeeId: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
  replyToMessageId: z.string().uuid().optional(),
  type: A2AMessageType,
  content: A2AContent,
  relatedTaskId: z.string().uuid().optional(),
  /** ed25519 signature (base64) of canonicalized message body. */
  signature: z.string(),
});
export type A2ASendRequest = z.infer<typeof A2ASendRequest>;

export const A2ASendResponse = z.object({
  data: z.object({
    messageId: z.string().uuid(),
    threadId: z.string().uuid(),
    senderApprovalStatus: z.enum(["pending", "approved", "rejected", "auto"]),
    receiverActionStatus: z.enum(["pending", "accepted", "rejected", "auto"]),
    deliveryStatus: z.enum(["queued_pending_approval", "delivered"]),
  }),
});
export type A2ASendResponse = z.infer<typeof A2ASendResponse>;

export const InboxTab = z.enum([
  "needs_action",
  "pending_outbound",
  "informational",
  "all",
]);
export type InboxTab = z.infer<typeof InboxTab>;

export const InboxItem = z.object({
  messageId: z.string().uuid(),
  threadId: z.string().uuid(),
  type: A2AMessageType,
  senderEmployeeId: z.string().uuid(),
  receiverEmployeeId: z.string().uuid(),
  content: A2AContent,
  senderApprovalStatus: z.enum(["pending", "approved", "rejected", "auto"]),
  receiverActionStatus: z.enum(["pending", "accepted", "rejected", "auto"]),
  relatedTaskId: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type InboxItem = z.infer<typeof InboxItem>;

export const InboxResponse = z.object({
  data: z.object({
    items: z.array(InboxItem),
    nextCursor: z.string().nullable().optional(),
  }),
});
export type InboxResponse = z.infer<typeof InboxResponse>;
