/**
 * OpenClaw / Claude Code adapter for the firefly-mesh hub.
 *
 * Wraps HubHttpClient with typed methods for all A2A operations exposed
 * to the agent skill layer.
 *
 * WebSocket upgrade (real-time push delivery) is declared here as an
 * interface method. The concrete implementation requires M2 hub-side
 * WebSocket support; calling connectWebSocket before M2 throws AppError.
 *
 * Edge-runtime safe: no node:* imports.
 */

import type { HubHttpClient } from "../http-client.ts";
import type {
  A2AMessageWireT,
  A2ASendRequestT,
  PrekeyBundleT,
} from "@firefly-mesh/proto";
import { AppError, ErrorCode } from "@firefly-mesh/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SendMessageOptions {
  /** Parsed send request payload (without sender — comes from auth context). */
  message: A2ASendRequestT;
}

export interface GetInboxOptions {
  /** Filter: only return messages in this status. Defaults to "pending". */
  status?: "pending" | "accepted" | "rejected";
  /** Maximum number of messages to return (default 50). */
  limit?: number;
  /** Pagination cursor (opaque, from previous response). */
  cursor?: string;
}

export interface InboxPage {
  messages: A2AMessageWireT[];
  nextCursor: string | undefined;
}

export interface SendMessageResponse {
  messageId: string;
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

export interface OpenClawAdapter {
  /**
   * Send an A2A message to another agent via the hub.
   * The hub signs the envelope with the agent's registered key.
   */
  sendMessage(opts: SendMessageOptions): Promise<SendMessageResponse>;

  /** Fetch the agent's inbound message inbox. */
  getInbox(opts?: GetInboxOptions): Promise<InboxPage>;

  /** Accept an inbound request message (receiver side). */
  acceptMessage(messageId: string): Promise<void>;

  /** Reject an inbound request message (receiver side). */
  rejectMessage(messageId: string): Promise<void>;

  /** Fetch the X3DH prekey bundle for a remote agent. */
  getPrekeyBundle(agentId: string): Promise<PrekeyBundleT>;

  /**
   * Upgrade to a WebSocket connection for real-time push delivery.
   *
   * M2: Full WebSocket multiplexed delivery over the hub.
   * Calling this before M2 hub support is available throws AppError.
   *
   * @param wsUrl - Hub WebSocket endpoint, e.g. "wss://mesh.acme.io/ws/a2a"
   * @param jwt   - JWT for WebSocket auth (same as HTTP JWT).
   */
  connectWebSocket(wsUrl: string, jwt: string): WebSocket;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an OpenClaw adapter backed by the given HubHttpClient.
 *
 * @example
 * ```ts
 * const client = new HubHttpClient({ baseUrl, jwt });
 * const adapter = createOpenClawAdapter(client);
 * const { messageId } = await adapter.sendMessage({ message: req });
 * ```
 */
export function createOpenClawAdapter(
  client: HubHttpClient,
): OpenClawAdapter {
  return {
    async sendMessage({ message }: SendMessageOptions): Promise<SendMessageResponse> {
      return client.post<SendMessageResponse>("/api/a2a/send", message);
    },

    async getInbox(opts: GetInboxOptions = {}): Promise<InboxPage> {
      const params = new URLSearchParams();
      if (opts.status !== undefined) params.set("status", opts.status);
      if (opts.limit !== undefined) params.set("limit", String(opts.limit));
      if (opts.cursor !== undefined) params.set("cursor", opts.cursor);
      const qs = params.toString();
      const path = qs.length > 0 ? `/api/a2a/inbox?${qs}` : "/api/a2a/inbox";
      return client.get<InboxPage>(path);
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

    connectWebSocket(_wsUrl: string, _jwt: string): WebSocket {
      // M2: hub-side WebSocket endpoint not yet available.
      throw new AppError(
        ErrorCode.NOT_IMPLEMENTED,
        "WebSocket real-time delivery not yet implemented",
        501,
      );
    },
  };
}
