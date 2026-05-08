// firefly.a2a.* tools — typed messaging between agents in an org.
// Sender signature is computed by the host runtime (it owns the ed25519
// private key); we accept the signature as an input so the skill stays
// runtime-agnostic.

import { z } from "zod";

import { FireflyMeshClient } from "../client/http.ts";
import { A2AContent, A2AMessageType, InboxTab } from "@firefly-mesh/sdk";
import type { ToolContext } from "./task.ts";

const SendInput = z.object({
  receiverEmployeeId: z.string().uuid().optional(),
  receiverAgentId: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
  replyToMessageId: z.string().uuid().optional(),
  type: A2AMessageType,
  content: A2AContent,
  relatedTaskId: z.string().uuid().optional(),
  /**
   * ed25519 signature (base64) of the canonicalized body.
   * The runtime computes this with the agent's private key — see
   * client/http.ts#signPayload.
   */
  signature: z.string().min(1),
});

export const send = {
  name: "firefly.a2a.send",
  description:
    "Send a typed A2A message to a colleague's agent. " +
    "Type 'request' / 'commit' / 'handoff' triggers HITL approval (sender or receiver side). " +
    "Type 'inform' / 'sync' is auto-delivered. Caller must sign the canonicalized body.",
  inputSchema: SendInput,
  async handler(ctx: ToolContext, input: z.infer<typeof SendInput>) {
    return ctx.client.a2a.send(input);
  },
};

const InboxInput = z.object({
  employeeId: z.string().uuid().optional(),
  tab: InboxTab.optional(),
  cursor: z.string().optional(),
});
export const inbox = {
  name: "firefly.a2a.inbox",
  description:
    "Read incoming A2A messages. Tabs: needs_action (action required), " +
    "pending_outbound (your queued sends awaiting approval), " +
    "informational (auto-delivered notices), all.",
  inputSchema: InboxInput,
  async handler(ctx: ToolContext, input: z.infer<typeof InboxInput>) {
    return ctx.client.a2a.inbox(input);
  },
};

const ApproveInput = z.object({ messageId: z.string().uuid() });
export const approve = {
  name: "firefly.a2a.approve",
  description:
    "(Sender side.) Approve a queued outbound message that requires your sign-off " +
    "before it can be delivered to the receiver.",
  inputSchema: ApproveInput,
  async handler(ctx: ToolContext, input: z.infer<typeof ApproveInput>) {
    return ctx.client.a2a.approve(input.messageId);
  },
};

const RejectInput = z.object({
  messageId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});
export const reject = {
  name: "firefly.a2a.reject",
  description:
    "(Sender side.) Reject a queued outbound message — message will not be delivered.",
  inputSchema: RejectInput,
  async handler(ctx: ToolContext, input: z.infer<typeof RejectInput>) {
    return ctx.client.a2a.reject(input.messageId, input.reason);
  },
};

const AcceptInput = z.object({ messageId: z.string().uuid() });
export const accept = {
  name: "firefly.a2a.accept",
  description:
    "(Receiver side.) Accept an inbound request / handoff / commit — " +
    "marks it as actioned and unblocks the sender's flow.",
  inputSchema: AcceptInput,
  async handler(ctx: ToolContext, input: z.infer<typeof AcceptInput>) {
    return ctx.client.a2a.accept(input.messageId);
  },
};

export const a2aTools = [send, inbox, approve, reject, accept];
