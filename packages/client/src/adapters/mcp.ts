/**
 * MCP (Model Context Protocol) adapter for the firefly-mesh hub.
 *
 * HTTP-only transport — same A2A operations as the OpenClaw adapter but
 * without WebSocket, suitable for runtimes that don't support the
 * agentskills.io skill protocol (e.g. Cursor, Claude Desktop, any
 * stdio-based MCP host).
 *
 * Edge-runtime safe: no node:* imports.
 */

import type { HubHttpClient } from "../http-client.ts";
import type {
  A2AMessageWireT,
  A2ASendRequestT,
  PrekeyBundleT,
} from "@firefly-mesh/proto";

// ---------------------------------------------------------------------------
// Types (re-use compatible shapes from openclaw adapter)
// ---------------------------------------------------------------------------

export interface McpSendMessageOptions {
  message: A2ASendRequestT;
}

export interface McpGetInboxOptions {
  status?: "pending" | "accepted" | "rejected";
  limit?: number;
  cursor?: string;
}

export interface McpInboxPage {
  messages: A2AMessageWireT[];
  nextCursor: string | undefined;
}

export interface McpSendMessageResponse {
  messageId: string;
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

export interface McpAdapter {
  /** Send an A2A message to another agent via the hub. */
  sendMessage(opts: McpSendMessageOptions): Promise<McpSendMessageResponse>;

  /** Fetch the agent's inbound message inbox. */
  getInbox(opts?: McpGetInboxOptions): Promise<McpInboxPage>;

  /** Accept an inbound request message (receiver side). */
  acceptMessage(messageId: string): Promise<void>;

  /** Reject an inbound request message (receiver side). */
  rejectMessage(messageId: string): Promise<void>;

  /** Fetch the X3DH prekey bundle for a remote agent. */
  getPrekeyBundle(agentId: string): Promise<PrekeyBundleT>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an MCP adapter backed by the given HubHttpClient.
 *
 * @example
 * ```ts
 * const client = new HubHttpClient({ baseUrl, jwt });
 * const adapter = createMcpAdapter(client);
 * const { messageId } = await adapter.sendMessage({ message: req });
 * ```
 */
export function createMcpAdapter(client: HubHttpClient): McpAdapter {
  return {
    async sendMessage({ message }: McpSendMessageOptions): Promise<McpSendMessageResponse> {
      return client.post<McpSendMessageResponse>("/api/a2a/send", message);
    },

    async getInbox(opts: McpGetInboxOptions = {}): Promise<McpInboxPage> {
      const params = new URLSearchParams();
      if (opts.status !== undefined) params.set("status", opts.status);
      if (opts.limit !== undefined) params.set("limit", String(opts.limit));
      if (opts.cursor !== undefined) params.set("cursor", opts.cursor);
      const qs = params.toString();
      const path = qs.length > 0 ? `/api/a2a/inbox?${qs}` : "/api/a2a/inbox";
      return client.get<McpInboxPage>(path);
    },

    async acceptMessage(messageId: string): Promise<void> {
      await client.put<void>(`/api/a2a/messages/${messageId}/accept`, {});
    },

    async rejectMessage(messageId: string): Promise<void> {
      await client.put<void>(`/api/a2a/messages/${messageId}/reject`, {});
    },

    async getPrekeyBundle(agentId: string): Promise<PrekeyBundleT> {
      return client.get<PrekeyBundleT>(`/api/a2a/prekeys/${agentId}`);
    },
  };
}
